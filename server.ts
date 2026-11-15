import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  aggregateAndFilterDvfRows,
  computeSummaryStats,
  haversineDistanceMeters,
  parseGeoDvfCsv,
  type DvfExtractionResult,
  type GeocodedAddress,
  type RawDvfRow,
} from './src/lib/dvf.ts';
import {
  buildSectorEnvironmentSummary,
  computeBdTopoVisAVisFromPrepared,
  computeNaturalLuminosityScore,
  prepareBdTopoFeatures,
  prepareVegetationFeatures,
  type AdemeDpeRecord,
  type BdnbBuildingInfo,
  type BdTopo3DInfo,
  type CadastreParcelInfo,
  type GeoPolygonFeature,
  type LidarAltiInfo,
  type MeteoFranceInfo,
  type OsmContextInfo,
  type ParsedBdTopoBuilding,
  type ParsedVegetationZone,
  type PropertyEnrichmentResult,
  type SolarRadiationInfo,
  type SourceStatus,
  type TransactionEnvironmentMetrics,
} from './src/lib/enrichment.ts';

const PORT = Number(process.env.PORT) || 3000;
const AVAILABLE_YEARS = [2021, 2022, 2023, 2024, 2025];
const CACHE_DIR = '/tmp/dvf-cache';

interface CachedSectorTopo {
  centerLat: number;
  centerLon: number;
  radiusMeters: number;
  buildings: ParsedBdTopoBuilding[];
  vegetation: ParsedVegetationZone[];
}

const geocodeCache = new Map<string, GeocodedAddress & { banId?: string }>();
const csvRowCache = new Map<string, RawDvfRow[]>();
const enrichmentCache = new Map<string, PropertyEnrichmentResult>();
const sectorBdTopoCache = new Map<string, CachedSectorTopo>();

function getDepartementFromCityCode(cityCode: string): string {
  if (cityCode.startsWith('751')) return '75';
  if (cityCode.startsWith('6938')) return '69';
  if (cityCode.startsWith('132')) return '13';
  if (cityCode.startsWith('97') || cityCode.startsWith('98')) return cityCode.slice(0, 3);
  return cityCode.slice(0, 2);
}

async function geocodeAddress(query: string): Promise<(GeocodedAddress & { banId?: string }) | null> {
  const normalized = query.trim().toLowerCase();
  const cached = geocodeCache.get(normalized);
  if (cached) return cached;

  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query.trim())}&limit=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    throw new Error(`BAN API error (${res.status})`);
  }
  const data = (await res.json()) as {
    features?: Array<{
      geometry: { coordinates: [number, number] };
      properties: {
        id?: string;
        label: string;
        citycode: string;
        postcode: string;
        city: string;
        district?: string;
        score: number;
      };
    }>;
  };

  const feature = data.features?.[0];
  if (!feature || feature.properties.score < 0.25) {
    return null;
  }

  const [longitude, latitude] = feature.geometry.coordinates;
  const result: GeocodedAddress & { banId?: string } = {
    banId: feature.properties.id,
    label: feature.properties.label,
    cityCode: feature.properties.citycode,
    postalCode: feature.properties.postcode,
    city: feature.properties.city,
    district: feature.properties.district || feature.properties.city,
    latitude,
    longitude,
  };
  geocodeCache.set(normalized, result);
  return result;
}

async function discoverCommunesInRadius(
  center: GeocodedAddress,
  radiusMeters: number
): Promise<string[]> {
  const codes = new Set<string>([center.cityCode]);
  const latDelta = radiusMeters / 111320;
  const lonDelta = radiusMeters / (111320 * Math.cos((center.latitude * Math.PI) / 180));

  const points = [
    [center.latitude + latDelta, center.longitude],
    [center.latitude - latDelta, center.longitude],
    [center.latitude, center.longitude + lonDelta],
    [center.latitude, center.longitude - lonDelta],
  ];

  await Promise.all(
    points.map(async ([lat, lon]) => {
      try {
        const res = await fetch(
          `https://api-adresse.data.gouv.fr/reverse/?lon=${lon.toFixed(6)}&lat=${lat.toFixed(6)}`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          features?: Array<{ properties?: { citycode?: string } }>;
        };
        const code = json.features?.[0]?.properties?.citycode;
        if (code) codes.add(code);
      } catch {
        // Non-fatal
      }
    })
  );

  return Array.from(codes).sort();
}

async function fetchCommuneYearRows(year: number, cityCode: string): Promise<RawDvfRow[]> {
  const cacheKey = `${year}-${cityCode}`;
  const mem = csvRowCache.get(cacheKey);
  if (mem) return mem;

  const diskPath = path.join(CACHE_DIR, `${cacheKey}.csv`);
  try {
    const existing = await fs.readFile(diskPath, 'utf-8');
    const parsed = parseGeoDvfCsv(existing);
    csvRowCache.set(cacheKey, parsed);
    return parsed;
  } catch {
    // Cache miss
  }

  const dep = getDepartementFromCityCode(cityCode);
  const url = `https://files.data.gouv.fr/geo-dvf/latest/csv/${year}/communes/${dep}/${cityCode}.csv`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (res.status === 404) {
    csvRowCache.set(cacheKey, []);
    return [];
  }
  if (!res.ok) {
    throw new Error(`Etalab Geo-DVF error (${res.status}) for ${year}/${cityCode}`);
  }

  const csvText = await res.text();
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(diskPath, csvText, 'utf-8');
  } catch {
    // Optional disk cache
  }

  const parsed = parseGeoDvfCsv(csvText);
  csvRowCache.set(cacheKey, parsed);
  return parsed;
}

function parseNumberList(raw: unknown, fallback: number[]): number[] {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  const nums = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n));
  return nums.length > 0 ? nums : fallback;
}

async function fetchBdnbForBanId(banId: string): Promise<BdnbBuildingInfo | null> {
  try {
    const relRes = await fetch(
      `https://api.bdnb.io/v1/bdnb/donnees/rel_batiment_groupe_adresse?cle_interop_adr=eq.${encodeURIComponent(banId)}&limit=1`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!relRes.ok) return null;
    const relRows = (await relRes.json()) as Array<{ batiment_groupe_id?: string }>;
    let bgId = relRows?.[0]?.batiment_groupe_id;

    let bRow: Record<string, unknown> | undefined;
    if (bgId) {
      const bRes = await fetch(
        `https://api.bdnb.io/v1/bdnb/donnees/batiment_groupe_complet?batiment_groupe_id=eq.${encodeURIComponent(bgId)}&limit=1`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (bRes.ok) {
        const list = (await bRes.json()) as Array<Record<string, unknown>>;
        bRow = list?.[0];
      }
    }

    if (!bRow) {
      const fallbackRes = await fetch(
        `https://api.bdnb.io/v1/bdnb/donnees/batiment_groupe_complet?cle_interop_adr_principale_ban=eq.${encodeURIComponent(banId)}&limit=1`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (fallbackRes.ok) {
        const list = (await fallbackRes.json()) as Array<Record<string, unknown>>;
        bRow = list?.[0];
      }
    }

    if (!bRow) return null;

    const num = (k: string): number | null => {
      const v = bRow?.[k];
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    };
    const str = (k: string): string | null => {
      const v = bRow?.[k];
      return typeof v === 'string' && v.trim() ? v.trim() : null;
    };
    const bool = (k: string): boolean | null => {
      const v = bRow?.[k];
      return typeof v === 'boolean' ? v : null;
    };

    return {
      batimentGroupeId: String(bRow.batiment_groupe_id ?? bgId ?? ''),
      addressLabel: str('libelle_adr_principale_ban'),
      constructionYear: num('annee_construction') ?? num('annee_construction_dpe'),
      wallMaterial: str('mat_mur_txt'),
      roofMaterial: str('mat_toit_txt'),
      floors: num('nb_niveau'),
      dwellingsCount: num('nb_log'),
      elecMetersCount: num('nb_pdl_res_dle_elec_2020'),
      meanHeightM: num('hauteur_mean'),
      groundAltitudeM: num('altitude_sol_mean'),
      footprintSqm: num('surface_emprise_sol'),
      dpeClassBuilding: str('classe_bilan_dpe'),
      dpeConsoEpSqm: num('conso_5_usages_ep_m2') ? Math.round(num('conso_5_usages_ep_m2')!) : null,
      gesEmissionSqm: num('emission_ges_5_usages_m2') ? Math.round(num('emission_ges_5_usages_m2')! * 10) / 10 : null,
      inertiaClass: str('classe_inertie'),
      traversing: str('traversant'),
      windowOrientations: Array.isArray(bRow.l_orientation_baie_vitree)
        ? (bRow.l_orientation_baie_vitree as string[])
        : [],
      hasBalcony: bool('presence_balcon'),
      windowRatioPct: num('pourcentage_surface_baie_vitree_exterieur')
        ? Math.round(num('pourcentage_surface_baie_vitree_exterieur')! * 100)
        : null,
      solarFactor: num('facteur_solaire_baie_vitree')
        ? Math.round(num('facteur_solaire_baie_vitree')! * 100) / 100
        : null,
      glazingType: str('type_vitrage'),
      windowFrameMaterial: str('type_materiaux_menuiserie'),
      wallInsulation: str('type_isolation_mur_exterieur'),
      heatingEnergy: str('type_energie_chauffage'),
      heatingGenerator: str('type_generateur_chauffage'),
      ventilationType: str('type_ventilation'),
      solarThermalPotential: num('batenr_potentiel_prod_solaire_thermique_annuelle'),
      dpeDistribution: {
        A: num('nb_classe_bilan_dpe_a') ?? 0,
        B: num('nb_classe_bilan_dpe_b') ?? 0,
        C: num('nb_classe_bilan_dpe_c') ?? 0,
        D: num('nb_classe_bilan_dpe_d') ?? 0,
        E: num('nb_classe_bilan_dpe_e') ?? 0,
        F: num('nb_classe_bilan_dpe_f') ?? 0,
        G: num('nb_classe_bilan_dpe_g') ?? 0,
      },
    };
  } catch {
    return null;
  }
}

async function fetchAdemeDpeForBanId(
  banId: string,
  targetSurface: number
): Promise<{ totalAtAddress: number; records: AdemeDpeRecord[] }> {
  try {
    const fields = [
      'numero_dpe',
      'date_etablissement_dpe',
      'etiquette_dpe',
      'etiquette_ges',
      'conso_5_usages_par_m2_ep',
      'emission_ges_5_usages_par_m2',
      'surface_habitable_logement',
      'annee_construction',
      'type_energie_n1',
      'type_installation_chauffage',
      'qualite_isolation_enveloppe',
      'qualite_isolation_menuiseries',
      'numero_etage_appartement',
    ].join(',');

    const url = `https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines?size=20&select=${encodeURIComponent(fields)}&identifiant_ban_eq=${encodeURIComponent(banId)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return { totalAtAddress: 0, records: [] };

    const json = (await res.json()) as {
      total?: number;
      results?: Array<Record<string, unknown>>;
    };
    const results = json.results ?? [];

    const records: AdemeDpeRecord[] = results.map((r) => {
      const surf = typeof r.surface_habitable_logement === 'number' ? r.surface_habitable_logement : null;
      const diff = surf !== null ? Math.round(Math.abs(surf - targetSurface) * 10) / 10 : null;
      return {
        numeroDpe: String(r.numero_dpe ?? ''),
        dateEtablissement: String(r.date_etablissement_dpe ?? ''),
        etiquetteDpe: String(r.etiquette_dpe ?? '—'),
        etiquetteGes: String(r.etiquette_ges ?? '—'),
        consoEpSqm:
          typeof r.conso_5_usages_par_m2_ep === 'number'
            ? Math.round(r.conso_5_usages_par_m2_ep)
            : null,
        emissionGesSqm:
          typeof r.emission_ges_5_usages_par_m2 === 'number'
            ? Math.round(r.emission_ges_5_usages_par_m2 * 10) / 10
            : null,
        surfaceHabitable: surf,
        anneeConstruction: typeof r.annee_construction === 'number' ? r.annee_construction : null,
        energyType: typeof r.type_energie_n1 === 'string' ? r.type_energie_n1 : null,
        heatingInstallation:
          typeof r.type_installation_chauffage === 'string' ? r.type_installation_chauffage : null,
        envelopeInsulation:
          typeof r.qualite_isolation_enveloppe === 'string' ? r.qualite_isolation_enveloppe : null,
        windowInsulation:
          typeof r.qualite_isolation_menuiseries === 'string' ? r.qualite_isolation_menuiseries : null,
        floorNumber:
          typeof r.numero_etage_appartement === 'number' ? r.numero_etage_appartement : null,
        likelyMatch: diff !== null && diff <= 3.5,
        surfaceDiffSqm: diff,
      };
    });

    records.sort((a, b) => {
      const da = a.surfaceDiffSqm ?? 999;
      const db = b.surfaceDiffSqm ?? 999;
      if (da !== db) return da - db;
      return b.dateEtablissement.localeCompare(a.dateEtablissement);
    });

    return { totalAtAddress: json.total ?? records.length, records };
  } catch {
    return { totalAtAddress: 0, records: [] };
  }
}

async function fetchCadastreParcel(
  parcelId: string,
  lat: number,
  lon: number,
  footprintSqm: number | null
): Promise<CadastreParcelInfo | null> {
  try {
    const url = parcelId
      ? `https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle&outputFormat=application/json&count=1&cql_filter=${encodeURIComponent(`idu='${parcelId}'`)}`
      : `https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle&outputFormat=application/json&count=1&bbox=${lat - 0.00015},${lon - 0.00015},${lat + 0.00015},${lon + 0.00015},urn:ogc:def:crs:EPSG::4326`;

    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      features?: Array<{ properties?: Record<string, unknown> }>;
    };
    const p = json.features?.[0]?.properties;
    if (!p) return null;

    const contenance = typeof p.contenance === 'number' ? p.contenance : null;
    const coverage =
      contenance && footprintSqm && contenance > 0
        ? Math.min(100, Math.round((footprintSqm / contenance) * 100))
        : null;

    return {
      idu: String(p.idu ?? parcelId ?? ''),
      section: String(p.section ?? ''),
      numero: String(p.numero ?? ''),
      feuille: typeof p.feuille === 'number' ? p.feuille : null,
      contenanceSqm: contenance,
      builtCoveragePct: coverage,
    };
  } catch {
    return null;
  }
}

async function fetchBdTopoContext(
  lat: number,
  lon: number
): Promise<{ buildings: ParsedBdTopoBuilding[]; vegetation: ParsedVegetationZone[] } | null> {
  // Reuse already-fetched sector dataset if point lies inside radius with >= 100m ray margin
  for (const entry of sectorBdTopoCache.values()) {
    const dist = haversineDistanceMeters(lat, lon, entry.centerLat, entry.centerLon);
    if (dist <= entry.radiusMeters) {
      return { buildings: entry.buildings, vegetation: entry.vegetation };
    }
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const dLat = 0.0012; // ~133m
      const dLon = 0.0018; // ~132m
      const bbox = `${lat - dLat},${lon - dLon},${lat + dLat},${lon + dLon},urn:ogc:def:crs:EPSG::4326`;
      const bUrl = `https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=BDTOPO_V3:batiment&outputFormat=application/json&count=450&bbox=${bbox}`;
      const vUrl = `https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=BDTOPO_V3:zone_de_vegetation&outputFormat=application/json&count=150&bbox=${bbox}`;

      const [bRes, vRes] = await Promise.allSettled([
        fetch(bUrl, { signal: AbortSignal.timeout(9000) }),
        fetch(vUrl, { signal: AbortSignal.timeout(6000) }),
      ]);

      if (bRes.status !== 'fulfilled' || !bRes.value.ok) continue;
      const bJson = (await bRes.value.json()) as { features?: GeoPolygonFeature[] };
      const features = bJson.features ?? [];
      if (features.length === 0) continue;

      let vegFeatures: GeoPolygonFeature[] = [];
      if (vRes.status === 'fulfilled' && vRes.value.ok) {
        const vJson = (await vRes.value.json()) as { features?: GeoPolygonFeature[] };
        vegFeatures = vJson.features ?? [];
      }

      return {
        buildings: prepareBdTopoFeatures(features),
        vegetation: prepareVegetationFeatures(vegFeatures),
      };
    } catch {
      // Retry once if IGN WFS hit transient timeout
    }
  }
  return null;
}

async function fetchLidarAndAlti(
  lat: number,
  lon: number,
  buildingHeightM: number | null
): Promise<LidarAltiInfo | null> {
  try {
    const [altiRes, lidarRes] = await Promise.allSettled([
      fetch(
        `https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=${lon}&lat=${lat}&resource=ign_rge_alti_wld&zonly=false`,
        { signal: AbortSignal.timeout(5000) }
      ),
      fetch(
        `https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=IGNF_LIDAR-HD_METADONNEE:metadata&outputFormat=application/json&count=1&bbox=${lat - 0.0002},${lon - 0.0002},${lat + 0.0002},${lon + 0.0002},urn:ogc:def:crs:EPSG::4326`,
        { signal: AbortSignal.timeout(5000) }
      ),
    ]);

    let groundZ: number | null = null;
    if (altiRes.status === 'fulfilled' && altiRes.value.ok) {
      const json = (await altiRes.value.json()) as { elevations?: Array<{ z?: number }> };
      const z = json.elevations?.[0]?.z;
      if (typeof z === 'number' && z > -100) groundZ = Math.round(z * 10) / 10;
    }

    let lidarCovered = false;
    let lidarSensor: string | null = null;
    let lidarTileName: string | null = null;
    if (lidarRes.status === 'fulfilled' && lidarRes.value.ok) {
      const json = (await lidarRes.value.json()) as {
        features?: Array<{ id?: string; properties?: Record<string, unknown> }>;
      };
      const feat = json.features?.[0];
      if (feat) {
        lidarCovered = true;
        lidarTileName = feat.id ?? null;
        const rawSensor = feat.properties?.capteur;
        if (typeof rawSensor === 'string') {
          lidarSensor = rawSensor.replace(/[\[\]"]/g, '');
        }
      }
    }

    if (groundZ === null && !lidarCovered) return null;

    return {
      groundAltitudeNgfM: groundZ,
      roofAltitudeNgfM:
        groundZ !== null && buildingHeightM !== null
          ? Math.round((groundZ + buildingHeightM) * 10) / 10
          : null,
      lidarCovered,
      lidarSensor,
      lidarTileName,
    };
  } catch {
    return null;
  }
}

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

async function fetchSolarRadiation(lat: number, lon: number): Promise<SolarRadiationInfo | null> {
  try {
    const url = `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&peakpower=1&loss=14&optimalangles=1&usehorizon=1&outputformat=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6500) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      inputs?: {
        mounting_system?: {
          fixed?: {
            slope?: { value?: number };
            azimuth?: { value?: number };
          };
        };
      };
      outputs?: {
        monthly?: {
          fixed?: Array<{ month: number; H_m?: number; 'H(i)_m'?: number }>;
        };
        totals?: {
          fixed?: { 'H(i)_y'?: number };
        };
      };
    };

    const annual = json.outputs?.totals?.fixed?.['H(i)_y'] ?? null;
    const fixedMonthly = json.outputs?.monthly?.fixed ?? [];
    const monthlyKwh = fixedMonthly.map((m) => ({
      month: m.month,
      label: MONTH_LABELS[m.month - 1] || String(m.month),
      kwh: Math.round(m['H(i)_m'] ?? m.H_m ?? 0),
    }));

    return {
      annualIrradiationKwhSqm: annual !== null ? Math.round(annual) : null,
      optimalSlopeDeg: json.inputs?.mounting_system?.fixed?.slope?.value ?? null,
      optimalAzimuthDeg: json.inputs?.mounting_system?.fixed?.azimuth?.value ?? null,
      monthlyKwh,
    };
  } catch {
    return null;
  }
}

async function fetchMeteoFrance(lat: number, lon: number): Promise<MeteoFranceInfo | null> {
  try {
    const url = `https://api.open-meteo.com/v1/meteofrance?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&daily=sunshine_duration,shortwave_radiation_sum,temperature_2m_max,temperature_2m_min&timezone=Europe%2FParis`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      elevation?: number;
      daily?: {
        sunshine_duration?: Array<number | null>;
        shortwave_radiation_sum?: Array<number | null>;
        temperature_2m_max?: Array<number | null>;
        temperature_2m_min?: Array<number | null>;
      };
    };

    const avg = (arr?: Array<number | null>): number | null => {
      if (!arr || arr.length === 0) return null;
      const valid = arr.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      if (valid.length === 0) return null;
      return valid.reduce((a, b) => a + b, 0) / valid.length;
    };

    const sunSec = avg(json.daily?.sunshine_duration);
    const radMj = avg(json.daily?.shortwave_radiation_sum);
    const tMax = avg(json.daily?.temperature_2m_max);
    const tMin = avg(json.daily?.temperature_2m_min);

    return {
      elevationM: typeof json.elevation === 'number' ? json.elevation : null,
      recent7dAvgSunshineHours: sunSec !== null ? Math.round((sunSec / 3600) * 10) / 10 : null,
      recent7dAvgRadiationMjSqm: radMj !== null ? Math.round(radMj * 10) / 10 : null,
      recent7dAvgTempMaxC: tMax !== null ? Math.round(tMax * 10) / 10 : null,
      recent7dAvgTempMinC: tMin !== null ? Math.round(tMin * 10) / 10 : null,
    };
  } catch {
    return null;
  }
}

async function fetchOsmContext(lat: number, lon: number): Promise<OsmContextInfo | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DVFCadastre/1.0 (open-data-analysis)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      display_name?: string;
      osm_type?: string;
      osm_id?: number;
      address?: {
        quarter?: string;
        city_block?: string;
        suburb?: string;
      };
    };

    return {
      displayName: json.display_name ?? null,
      quarter: json.address?.quarter ?? null,
      cityBlock: json.address?.city_block ?? null,
      suburb: json.address?.suburb ?? null,
      osmType: json.osm_type ?? null,
      osmId: typeof json.osm_id === 'number' ? json.osm_id : null,
    };
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/config', (_req, res) => {
    const googleMapsApiKey =
      process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
    res.json({ googleMapsApiKey });
  });

  app.get('/api/dvf/extract', async (req, res) => {
    try {
      const addressParam = typeof req.query.address === 'string' ? req.query.address.trim() : '';
      if (!addressParam) {
        return res.status(400).json({ error: 'Veuillez saisir une adresse de référence valide.' });
      }

      const radiusMeters = Number(req.query.radius ?? 200);
      const minSurface = Number(req.query.minSurface ?? 35);
      const maxSurface = Number(req.query.maxSurface ?? 45);
      const rooms = parseNumberList(req.query.rooms, [1, 2]);
      const years = parseNumberList(req.query.years, AVAILABLE_YEARS).filter((y) =>
        AVAILABLE_YEARS.includes(y)
      );
      const includeBlockSales = req.query.includeBlockSales === 'true';

      if (!Number.isFinite(radiusMeters) || radiusMeters < 20 || radiusMeters > 2000) {
        return res.status(400).json({ error: 'Le rayon doit être compris entre 20 m et 2 000 m.' });
      }
      if (!Number.isFinite(minSurface) || !Number.isFinite(maxSurface) || minSurface < 5 || minSurface > maxSurface) {
        return res.status(400).json({ error: 'La plage de surface est invalide (min <= max).' });
      }
      if (years.length === 0) {
        return res.status(400).json({ error: 'Sélectionnez au moins une année DVF (2021–2025).' });
      }

      const center = await geocodeAddress(addressParam);
      if (!center) {
        return res.status(404).json({
          error: `Adresse introuvable dans la Base Adresse Nationale : « ${addressParam} ».`,
        });
      }

      const communesChecked = await discoverCommunesInRadius(center, radiusMeters);
      const fetchTasks: Array<Promise<{ year: number; rows: RawDvfRow[] }>> = [];

      for (const year of years) {
        for (const cityCode of communesChecked) {
          fetchTasks.push(
            fetchCommuneYearRows(year, cityCode).then((rows) => ({ year, rows }))
          );
        }
      }

      const fetched = await Promise.all(fetchTasks);
      const allRows: RawDvfRow[] = [];
      const yearsWithData = new Set<number>();

      for (const item of fetched) {
        if (item.rows.length > 0) {
          yearsWithData.add(item.year);
          allRows.push(...item.rows);
        }
      }

      const { transactions, excludedBlockSalesCount } = aggregateAndFilterDvfRows(allRows, {
        centerLat: center.latitude,
        centerLon: center.longitude,
        radiusMeters,
        minSurface,
        maxSurface,
        rooms,
        years,
        includeBlockSales,
      });

      const stats = computeSummaryStats(transactions);

      const payload: DvfExtractionResult = {
        query: {
          address: addressParam,
          centerLat: center.latitude,
          centerLon: center.longitude,
          radiusMeters,
          minSurface,
          maxSurface,
          rooms,
          years,
          includeBlockSales,
        },
        center,
        communesChecked,
        yearsLoaded: Array.from(yearsWithData).sort((a, b) => a - b),
        transactions,
        excludedBlockSalesCount,
        stats,
        fetchedAt: new Date().toISOString(),
        sourceName: 'DGFiP / Etalab Geo-DVF (data.gouv.fr)',
      };

      return res.json(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur interne lors de l’extraction DVF.';
      console.error('DVF extract error:', message);
      return res.status(502).json({
        error: `Impossible de récupérer les données DVF officielles (${message}).`,
      });
    }
  });

  app.get('/api/property/enrich', async (req, res) => {
    try {
      const lat = Number(req.query.lat);
      const lon = Number(req.query.lon);
      const address = typeof req.query.address === 'string' ? req.query.address.trim() : '';
      const postalCode = typeof req.query.postalCode === 'string' ? req.query.postalCode.trim() : '';
      const parcelId = typeof req.query.parcelId === 'string' ? req.query.parcelId.trim() : '';
      const surfaceBati = Number(req.query.surfaceBati ?? 40);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return res.status(400).json({ error: 'Coordonnées géographiques invalides.' });
      }

      const cacheKey = `${parcelId}|${address}|${lat.toFixed(5)}|${lon.toFixed(5)}|${surfaceBati}`;
      const cached = enrichmentCache.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      // Resolve BAN ID for this specific apartment building
      const searchQuery = [address, postalCode].filter(Boolean).join(' ');
      const banFeature = searchQuery ? await geocodeAddress(searchQuery).catch(() => null) : null;
      const banId = banFeature?.banId ?? null;

      // Parallel fetch across BDNB, ADEME DPE, BD TOPO 3D, Solar PVGIS, Météo-France, OSM
      const [bdnbRes, dpeRes, bdTopoRaw, solarRes, meteoRes, osmRes] = await Promise.all([
        banId ? fetchBdnbForBanId(banId) : Promise.resolve(null),
        banId ? fetchAdemeDpeForBanId(banId, surfaceBati) : Promise.resolve({ totalAtAddress: 0, records: [] }),
        fetchBdTopoContext(lat, lon),
        fetchSolarRadiation(lat, lon),
        fetchMeteoFrance(lat, lon),
        fetchOsmContext(lat, lon),
      ]);

      // Compute building-level BD TOPO baseline at mid-building so luminosity & sky openness stay 100% consistent with sector metrics;
      // floor-specific angles & sky openness dynamically update in the UI drawer using DPE floor or interactive floor selector.
      const bdTopoRes: BdTopo3DInfo | null = bdTopoRaw
        ? computeBdTopoVisAVisFromPrepared(
            bdTopoRaw.buildings,
            lat,
            lon,
            bdTopoRaw.vegetation,
            null
          )
        : null;

      const buildingHeight = bdTopoRes?.subjectHeightM ?? bdnbRes?.meanHeightM ?? null;
      const footprintSqm = bdnbRes?.footprintSqm ?? null;

      const [cadastreRes, lidarAltiRes] = await Promise.all([
        fetchCadastreParcel(parcelId, lat, lon, footprintSqm),
        fetchLidarAndAlti(lat, lon, buildingHeight),
      ]);

      const sources: SourceStatus[] = [
        {
          id: 'dvf',
          name: 'DVF',
          producer: 'DGFiP (État)',
          available: true,
          note: 'Acte notarié géocodé',
        },
        {
          id: 'bdnb',
          name: 'BDNB',
          producer: 'CSTB',
          available: bdnbRes !== null,
          note: bdnbRes ? `Bâtiment ${bdnbRes.batimentGroupeId}` : 'Non apparié à cette adresse BAN',
        },
        {
          id: 'dpe',
          name: 'Observatoire des DPE',
          producer: 'ADEME',
          available: dpeRes.totalAtAddress > 0,
          note:
            dpeRes.totalAtAddress > 0
              ? `${dpeRes.totalAtAddress} DPE enregistrés à l’immeuble`
              : 'Aucun DPE public trouvé à l’adresse',
        },
        {
          id: 'bdtopo',
          name: 'BD TOPO 3D',
          producer: 'IGN',
          available: bdTopoRes !== null,
          note: bdTopoRes
            ? `${bdTopoRes.neighborCount60m} bâtiments voisins analysés (< 60 m)`
            : 'Emprise 3D indisponible',
        },
        {
          id: 'lidar',
          name: 'LiDAR HD & Altimétrie',
          producer: 'IGN',
          available: lidarAltiRes !== null,
          note: lidarAltiRes?.lidarCovered
            ? `Couvert (${lidarAltiRes.lidarSensor ?? 'LiDAR HD'})`
            : 'Altitude NGF IGN RGE Alti',
        },
        {
          id: 'cadastre',
          name: 'Cadastre (PCI)',
          producer: 'DGFiP / IGN',
          available: cadastreRes !== null,
          note: cadastreRes ? `Parcelle ${cadastreRes.idu}` : 'Parcelle non trouvée',
        },
        {
          id: 'solar',
          name: 'Ensoleillement & Horizon',
          producer: 'EU PVGIS / BDNB',
          available: solarRes !== null,
          note: solarRes?.annualIrradiationKwhSqm
            ? `${solarRes.annualIrradiationKwhSqm} kWh/m²/an`
            : 'Indisponible',
        },
        {
          id: 'meteofrance',
          name: 'Données Météo-France',
          producer: 'Météo-France (AROME/ARPEGE)',
          available: meteoRes !== null,
          note: meteoRes?.recent7dAvgSunshineHours !== null && meteoRes?.recent7dAvgSunshineHours !== undefined
            ? `Moy. ${meteoRes.recent7dAvgSunshineHours} h soleil/j (7j)`
            : 'Indisponible',
        },
        {
          id: 'osm',
          name: 'OpenStreetMap',
          producer: 'Communauté libre',
          available: osmRes !== null,
          note: osmRes?.quarter ? `${osmRes.quarter}${osmRes.cityBlock ? ` · ${osmRes.cityBlock}` : ''}` : 'Contexte rue',
        },
      ];

      const luminosity = computeNaturalLuminosityScore(bdTopoRes, bdnbRes);

      const payload: PropertyEnrichmentResult = {
        banId,
        banLabel: banFeature?.label ?? null,
        bdnb: bdnbRes,
        ademeDpe: dpeRes,
        cadastre: cadastreRes,
        bdTopo: bdTopoRes,
        lidarAlti: lidarAltiRes,
        solar: solarRes,
        meteoFrance: meteoRes,
        osm: osmRes,
        luminosity,
        sources,
      };

      if (bdTopoRes !== null) {
        enrichmentCache.set(cacheKey, payload);
      }
      return res.json(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur d’enrichissement.';
      return res.status(500).json({ error: message });
    }
  });

  app.post('/api/dvf/environment', async (req, res) => {
    try {
      const body = req.body as {
        centerLat?: number;
        centerLon?: number;
        radiusMeters?: number;
        items?: Array<{ id: string; lat: number; lon: number }>;
      };

      const centerLat = Number(body?.centerLat);
      const centerLon = Number(body?.centerLon);
      const radiusMeters = Math.min(2000, Math.max(50, Number(body?.radiusMeters ?? 200)));
      const items = Array.isArray(body?.items) ? body.items.slice(0, 400) : [];

      if (!Number.isFinite(centerLat) || !Number.isFinite(centerLon) || items.length === 0) {
        return res.json(buildSectorEnvironmentSummary([]));
      }

      const marginMeters = radiusMeters + 125;
      const dLat = marginMeters / 111320;
      const dLon = marginMeters / (111320 * Math.cos((centerLat * Math.PI) / 180));
      const boxKey = `${centerLat.toFixed(4)}|${centerLon.toFixed(4)}|${Math.round(marginMeters / 50) * 50}`;

      let cachedSector = sectorBdTopoCache.get(boxKey);
      if (!cachedSector) {
        const bbox = `${(centerLat - dLat).toFixed(5)},${(centerLon - dLon).toFixed(5)},${(centerLat + dLat).toFixed(5)},${(centerLon + dLon).toFixed(5)},urn:ogc:def:crs:EPSG::4326`;
        const bUrl = `https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=BDTOPO_V3:batiment&outputFormat=application/json&count=1200&bbox=${bbox}`;
        const vUrl = `https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=BDTOPO_V3:zone_de_vegetation&outputFormat=application/json&count=350&bbox=${bbox}`;

        const [wfsRes, vegRes] = await Promise.allSettled([
          fetch(bUrl, { signal: AbortSignal.timeout(9000) }),
          fetch(vUrl, { signal: AbortSignal.timeout(6000) }),
        ]);

        if (wfsRes.status !== 'fulfilled' || !wfsRes.value.ok) {
          const status = wfsRes.status === 'fulfilled' ? wfsRes.value.status : 504;
          return res.status(502).json({ error: `IGN BD TOPO indisponible (${status})` });
        }

        const json = (await wfsRes.value.json()) as { features?: GeoPolygonFeature[] };
        let vegFeatures: GeoPolygonFeature[] = [];
        if (vegRes.status === 'fulfilled' && vegRes.value.ok) {
          const vJson = (await vegRes.value.json()) as { features?: GeoPolygonFeature[] };
          vegFeatures = vJson.features ?? [];
        }

        cachedSector = {
          centerLat,
          centerLon,
          radiusMeters,
          buildings: prepareBdTopoFeatures(json.features ?? []),
          vegetation: prepareVegetationFeatures(vegFeatures),
        };
        sectorBdTopoCache.set(boxKey, cachedSector);
      }

      // Compute Lambert-93 facade vis-a-vis & luminosity per unique coordinate pair
      const coordMemo = new Map<string, ReturnType<typeof computeBdTopoVisAVisFromPrepared>>();
      const metricsList: TransactionEnvironmentMetrics[] = [];

      for (const item of items) {
        if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) continue;
        const coordKey = `${item.lat.toFixed(5)},${item.lon.toFixed(5)}`;
        let bd = coordMemo.get(coordKey);
        if (!bd) {
          bd = computeBdTopoVisAVisFromPrepared(
            cachedSector.buildings,
            item.lat,
            item.lon,
            cachedSector.vegetation
          );
          coordMemo.set(coordKey, bd);
        }
        const lum = computeNaturalLuminosityScore(bd, null);
        metricsList.push({
          id: item.id,
          effectiveVisAVisM: bd.effectiveVisAVisDistanceM,
          principalVisAVisM: bd.principalVisAVisDistanceM,
          closestVisAVisM: bd.closestNeighborDistanceM,
          visibilityCategory: bd.visibilityCategory,
          skyOpennessPct: bd.skyOpennessPct ?? 55,
          subjectHeightM: bd.subjectHeightM,
          maxObstructionAngleDeg: bd.maxObstructionAngleDeg,
          openDirectionsCount: bd.openDirectionsCount,
          vegetationScreensCount: bd.vegetationScreensCount,
          luminosity: lum,
        });
      }

      return res.json(buildSectorEnvironmentSummary(metricsList));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur d’analyse environnementale.';
      return res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DVF Cadastre server running on http://localhost:${PORT}`);
  });
}

startServer();
