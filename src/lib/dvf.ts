export interface RawDvfRow {
  id_mutation: string;
  date_mutation: string;
  numero_disposition: string;
  nature_mutation: string;
  valeur_fonciere: number | null;
  adresse_numero: string;
  adresse_suffixe: string;
  adresse_nom_voie: string;
  code_postal: string;
  code_commune: string;
  nom_commune: string;
  id_parcelle: string;
  lot1_numero: string;
  lot1_surface_carrez: number | null;
  lot2_numero: string;
  lot2_surface_carrez: number | null;
  nombre_lots: number;
  code_type_local: string;
  type_local: string;
  surface_reelle_bati: number | null;
  nombre_pieces_principales: number | null;
  surface_terrain: number | null;
  longitude: number | null;
  latitude: number | null;
}

export interface DvfTransaction {
  id: string;
  idMutation: string;
  dateMutation: string;
  year: number;
  natureMutation: string;
  valeurFonciere: number;
  pricePerSqm: number;
  address: string;
  streetNumber: string;
  streetName: string;
  postalCode: string;
  cityCode: string;
  cityName: string;
  parcelId: string;
  rooms: number;
  roomLabel: 'Studio (1P)' | '2 pièces' | string;
  surfaceBati: number;
  surfaceCarrez: number | null;
  lotCount: number;
  dependanceCount: number;
  isBlockSale: boolean;
  mainUnitsInMutation: number;
  latitude: number;
  longitude: number;
  distanceMeters: number;
}

export interface DvfQueryParams {
  address: string;
  centerLat: number;
  centerLon: number;
  radiusMeters: number;
  minSurface: number;
  maxSurface: number;
  rooms: number[];
  years: number[];
  includeBlockSales: boolean;
}

export interface YearlyTrend {
  year: number;
  count: number;
  medianPricePerSqm: number;
  avgPricePerSqm: number;
  q1PricePerSqm: number;
  q3PricePerSqm: number;
  minPricePerSqm: number;
  maxPricePerSqm: number;
}

export interface PriceBracket {
  label: string;
  min: number;
  max: number;
  studioCount: number;
  twoRoomCount: number;
  total: number;
}

export interface SurfaceBandStat {
  label: string;
  minSurface: number;
  maxSurface: number;
  midSurface: number;
  count: number;
  studioCount: number;
  twoRoomCount: number;
  medianPricePerSqm: number;
  q1PricePerSqm: number;
  q3PricePerSqm: number;
  medianTotalPrice: number;
}

export interface PredictedYearPoint {
  year: number;
  predictedPricePerSqm: number;
  lowerBound: number;
  upperBound: number;
}

export interface PricePredictionResult {
  observed: YearlyTrend[];
  projected: PredictedYearPoint[];
  annualSlopeEurSqm: number;
  annualTrendPct: number;
  rSquared: number;
  rmse: number;
}

export interface DvfSummaryStats {
  count: number;
  studioCount: number;
  twoRoomCount: number;
  medianPricePerSqm: number | null;
  meanPricePerSqm: number | null;
  minPricePerSqm: number | null;
  maxPricePerSqm: number | null;
  medianPrice: number | null;
  meanSurface: number | null;
  yearlyTrends: YearlyTrend[];
}

export interface GeocodedAddress {
  label: string;
  cityCode: string;
  postalCode: string;
  city: string;
  district: string;
  latitude: number;
  longitude: number;
}

export interface DvfExtractionResult {
  query: DvfQueryParams;
  center: GeocodedAddress;
  communesChecked: string[];
  yearsLoaded: number[];
  transactions: DvfTransaction[];
  excludedBlockSalesCount: number;
  stats: DvfSummaryStats;
  fetchedAt: string;
  sourceName: string;
}

const EARTH_RADIUS_METERS = 6371000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function toNullableNumber(val: string | undefined): number | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseGeoDvfCsv(csvText: string): RawDvfRow[] {
  const lines = csvText.split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const idx = new Map<string, number>();
  header.forEach((col, i) => idx.set(col, i));

  const get = (cols: string[], name: string): string => {
    const i = idx.get(name);
    return i !== undefined && i < cols.length ? cols[i].trim() : '';
  };

  const rows: RawDvfRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine || !rawLine.trim()) continue;
    const cols = parseCsvLine(rawLine);
    const idMutation = get(cols, 'id_mutation');
    if (!idMutation) continue;

    rows.push({
      id_mutation: idMutation,
      date_mutation: get(cols, 'date_mutation'),
      numero_disposition: get(cols, 'numero_disposition'),
      nature_mutation: get(cols, 'nature_mutation'),
      valeur_fonciere: toNullableNumber(get(cols, 'valeur_fonciere')),
      adresse_numero: get(cols, 'adresse_numero'),
      adresse_suffixe: get(cols, 'adresse_suffixe'),
      adresse_nom_voie: get(cols, 'adresse_nom_voie'),
      code_postal: get(cols, 'code_postal'),
      code_commune: get(cols, 'code_commune'),
      nom_commune: get(cols, 'nom_commune'),
      id_parcelle: get(cols, 'id_parcelle'),
      lot1_numero: get(cols, 'lot1_numero'),
      lot1_surface_carrez: toNullableNumber(get(cols, 'lot1_surface_carrez')),
      lot2_numero: get(cols, 'lot2_numero'),
      lot2_surface_carrez: toNullableNumber(get(cols, 'lot2_surface_carrez')),
      nombre_lots: toNullableNumber(get(cols, 'nombre_lots')) ?? 0,
      code_type_local: get(cols, 'code_type_local'),
      type_local: get(cols, 'type_local'),
      surface_reelle_bati: toNullableNumber(get(cols, 'surface_reelle_bati')),
      nombre_pieces_principales: toNullableNumber(get(cols, 'nombre_pieces_principales')),
      surface_terrain: toNullableNumber(get(cols, 'surface_terrain')),
      longitude: toNullableNumber(get(cols, 'longitude')),
      latitude: toNullableNumber(get(cols, 'latitude')),
    });
  }
  return rows;
}

function formatStreetAddress(row: RawDvfRow): string {
  const num = [row.adresse_numero, row.adresse_suffixe].filter(Boolean).join('');
  const street = row.adresse_nom_voie;
  return [num, street].filter(Boolean).join(' ').trim() || 'Adresse non précisée';
}

export function formatRoomLabel(rooms: number): string {
  if (rooms === 1) return 'Studio (1P)';
  if (rooms === 2) return '2 pièces';
  return `${rooms} pièces`;
}

export interface AggregationOutput {
  transactions: DvfTransaction[];
  excludedBlockSalesCount: number;
}

export function aggregateAndFilterDvfRows(
  rows: RawDvfRow[],
  params: Pick<
    DvfQueryParams,
    'centerLat' | 'centerLon' | 'radiusMeters' | 'minSurface' | 'maxSurface' | 'rooms' | 'years' | 'includeBlockSales'
  >
): AggregationOutput {
  // Group all rows by id_mutation to understand the full scope of each notary deed
  const byMutation = new Map<string, RawDvfRow[]>();
  for (const row of rows) {
    const list = byMutation.get(row.id_mutation);
    if (list) {
      list.push(row);
    } else {
      byMutation.set(row.id_mutation, [row]);
    }
  }

  const allowedYears = new Set(params.years);
  const allowedRooms = new Set(params.rooms);
  const transactions: DvfTransaction[] = [];
  let excludedBlockSalesCount = 0;

  for (const [idMutation, mutRows] of byMutation.entries()) {
    // Count main units vs annexes (Dépendance) in the entire mutation
    const mainUnits = mutRows.filter(
      (r) =>
        r.type_local === 'Appartement' ||
        r.type_local === 'Maison' ||
        r.type_local === 'Local industriel. commercial ou assimilé'
    );
    const dependances = mutRows.filter((r) => r.type_local === 'Dépendance');

    // Deduplicate identical apartment rows within the same mutation (e.g., split cadastral lots)
    const uniqueAptMap = new Map<string, RawDvfRow>();
    for (const r of mainUnits) {
      if (r.type_local !== 'Appartement') continue;
      const key = `${r.adresse_numero}|${r.adresse_nom_voie}|${r.surface_reelle_bati}|${r.nombre_pieces_principales}|${r.valeur_fonciere}`;
      const existing = uniqueAptMap.get(key);
      if (!existing) {
        uniqueAptMap.set(key, r);
      } else if (existing.lot1_surface_carrez === null && r.lot1_surface_carrez !== null) {
        uniqueAptMap.set(key, r);
      }
    }

    const distinctMainCount = new Set(
      mainUnits.map(
        (r) => `${r.type_local}|${r.adresse_numero}|${r.adresse_nom_voie}|${r.surface_reelle_bati}|${r.nombre_pieces_principales}`
      )
    ).size;

    const isBlockSale = distinctMainCount > 1;

    let idxInMut = 0;
    for (const row of uniqueAptMap.values()) {
      idxInMut++;
      if (!row.date_mutation || row.valeur_fonciere === null || row.valeur_fonciere <= 0) continue;
      if (row.nature_mutation !== 'Vente' && row.nature_mutation !== "Vente en l'état futur d'achèvement") {
        continue;
      }

      const year = Number(row.date_mutation.slice(0, 4));
      if (allowedYears.size > 0 && !allowedYears.has(year)) continue;

      if (row.nombre_pieces_principales === null || !allowedRooms.has(row.nombre_pieces_principales)) {
        continue;
      }

      if (
        row.surface_reelle_bati === null ||
        row.surface_reelle_bati < params.minSurface ||
        row.surface_reelle_bati > params.maxSurface
      ) {
        continue;
      }

      if (row.latitude === null || row.longitude === null) continue;

      const distanceMeters = Math.round(
        haversineDistanceMeters(params.centerLat, params.centerLon, row.latitude, row.longitude)
      );
      if (distanceMeters > params.radiusMeters) continue;

      if (isBlockSale && !params.includeBlockSales) {
        excludedBlockSalesCount++;
        continue;
      }

      const carrez = row.lot1_surface_carrez ?? row.lot2_surface_carrez ?? null;
      const pricePerSqm = Math.round(row.valeur_fonciere / row.surface_reelle_bati);

      transactions.push({
        id: `${idMutation}-${idxInMut}`,
        idMutation,
        dateMutation: row.date_mutation,
        year,
        natureMutation: row.nature_mutation,
        valeurFonciere: row.valeur_fonciere,
        pricePerSqm,
        address: formatStreetAddress(row),
        streetNumber: [row.adresse_numero, row.adresse_suffixe].filter(Boolean).join(''),
        streetName: row.adresse_nom_voie,
        postalCode: row.code_postal,
        cityCode: row.code_commune,
        cityName: row.nom_commune,
        parcelId: row.id_parcelle,
        rooms: row.nombre_pieces_principales,
        roomLabel: formatRoomLabel(row.nombre_pieces_principales),
        surfaceBati: row.surface_reelle_bati,
        surfaceCarrez: carrez,
        lotCount: row.nombre_lots,
        dependanceCount: dependances.length,
        isBlockSale,
        mainUnitsInMutation: distinctMainCount,
        latitude: row.latitude,
        longitude: row.longitude,
        distanceMeters,
      });
    }
  }

  transactions.sort((a, b) => {
    if (b.dateMutation !== a.dateMutation) {
      return b.dateMutation.localeCompare(a.dateMutation);
    }
    return a.distanceMeters - b.distanceMeters;
  });

  return { transactions, excludedBlockSalesCount };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return Math.round(sorted[mid]);
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return Math.round(sorted[base] + rest * (sorted[base + 1] - sorted[base]));
  }
  return Math.round(sorted[base]);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}

export function computeSummaryStats(transactions: DvfTransaction[]): DvfSummaryStats {
  if (transactions.length === 0) {
    return {
      count: 0,
      studioCount: 0,
      twoRoomCount: 0,
      medianPricePerSqm: null,
      meanPricePerSqm: null,
      minPricePerSqm: null,
      maxPricePerSqm: null,
      medianPrice: null,
      meanSurface: null,
      yearlyTrends: [],
    };
  }

  const pricesPerSqm = transactions.map((t) => t.pricePerSqm);
  const prices = transactions.map((t) => t.valeurFonciere);
  const surfaces = transactions.map((t) => t.surfaceBati);

  const studioCount = transactions.filter((t) => t.rooms === 1).length;
  const twoRoomCount = transactions.filter((t) => t.rooms === 2).length;

  const byYear = new Map<number, number[]>();
  for (const t of transactions) {
    const arr = byYear.get(t.year);
    if (arr) arr.push(t.pricePerSqm);
    else byYear.set(t.year, [t.pricePerSqm]);
  }

  const yearlyTrends: YearlyTrend[] = Array.from(byYear.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, vals]) => ({
      year,
      count: vals.length,
      medianPricePerSqm: median(vals) ?? 0,
      avgPricePerSqm: Math.round(average(vals) ?? 0),
      q1PricePerSqm: quantile(vals, 0.25),
      q3PricePerSqm: quantile(vals, 0.75),
      minPricePerSqm: Math.min(...vals),
      maxPricePerSqm: Math.max(...vals),
    }));

  return {
    count: transactions.length,
    studioCount,
    twoRoomCount,
    medianPricePerSqm: median(pricesPerSqm),
    meanPricePerSqm: Math.round(average(pricesPerSqm) ?? 0),
    minPricePerSqm: Math.min(...pricesPerSqm),
    maxPricePerSqm: Math.max(...pricesPerSqm),
    medianPrice: median(prices),
    meanSurface: Math.round((average(surfaces) ?? 0) * 10) / 10,
    yearlyTrends,
  };
}

export function computePriceBrackets(transactions: DvfTransaction[]): PriceBracket[] {
  if (transactions.length === 0) return [];
  const vals = transactions.map((t) => t.pricePerSqm);
  const sorted = [...vals].sort((a, b) => a - b);
  const p10 = quantile(sorted, 0.08);
  const p90 = quantile(sorted, 0.92);
  const span = Math.max(2000, p90 - p10);
  const step = span <= 3500 ? 500 : 1000;
  const start = Math.max(0, Math.floor(p10 / step) * step);
  const end = Math.ceil(p90 / step) * step;

  const brackets: PriceBracket[] = [];
  // Below start bucket if outliers exist
  const below = transactions.filter((t) => t.pricePerSqm < start);
  if (below.length > 0) {
    brackets.push({
      label: `< ${Math.round(start / 1000)}k`,
      min: 0,
      max: start,
      studioCount: below.filter((t) => t.rooms === 1).length,
      twoRoomCount: below.filter((t) => t.rooms !== 1).length,
      total: below.length,
    });
  }

  for (let low = start; low < end; low += step) {
    const high = low + step;
    const inBucket = transactions.filter((t) => t.pricePerSqm >= low && t.pricePerSqm < high);
    const fmt = (n: number) =>
      n % 1000 === 0 ? `${n / 1000}k` : `${(n / 1000).toFixed(1).replace('.', ',')}k`;
    brackets.push({
      label: `${fmt(low)}–${fmt(high)}`,
      min: low,
      max: high,
      studioCount: inBucket.filter((t) => t.rooms === 1).length,
      twoRoomCount: inBucket.filter((t) => t.rooms !== 1).length,
      total: inBucket.length,
    });
  }

  const above = transactions.filter((t) => t.pricePerSqm >= end);
  if (above.length > 0) {
    brackets.push({
      label: `≥ ${Math.round(end / 1000)}k`,
      min: end,
      max: Infinity,
      studioCount: above.filter((t) => t.rooms === 1).length,
      twoRoomCount: above.filter((t) => t.rooms !== 1).length,
      total: above.length,
    });
  }

  return brackets;
}

export function computeSurfaceBands(
  transactions: DvfTransaction[],
  minSurface: number,
  maxSurface: number
): SurfaceBandStat[] {
  if (transactions.length === 0) return [];
  const safeMin = Math.floor(Math.min(minSurface, ...transactions.map((t) => t.surfaceBati)));
  const safeMax = Math.ceil(Math.max(maxSurface, ...transactions.map((t) => t.surfaceBati)));
  const span = Math.max(2, safeMax - safeMin);
  const step = span <= 12 ? 2 : span <= 25 ? 4 : 5;

  const bands: SurfaceBandStat[] = [];
  for (let low = safeMin; low <= safeMax; low += step) {
    const isLast = low + step > safeMax;
    const high = isLast ? safeMax : low + step - 1;
    const inBand = transactions.filter((t) =>
      isLast ? t.surfaceBati >= low && t.surfaceBati <= high + 0.99 : t.surfaceBati >= low && t.surfaceBati < low + step
    );
    if (inBand.length === 0) continue;

    const pricesSqm = inBand.map((t) => t.pricePerSqm);
    const totals = inBand.map((t) => t.valeurFonciere);
    const label = low === high ? `${low} m²` : `${low}–${high} m²`;
    bands.push({
      label,
      minSurface: low,
      maxSurface: high,
      midSurface: (low + high) / 2,
      count: inBand.length,
      studioCount: inBand.filter((t) => t.rooms === 1).length,
      twoRoomCount: inBand.filter((t) => t.rooms !== 1).length,
      medianPricePerSqm: median(pricesSqm) ?? 0,
      q1PricePerSqm: quantile(pricesSqm, 0.25),
      q3PricePerSqm: quantile(pricesSqm, 0.75),
      medianTotalPrice: median(totals) ?? 0,
    });
    if (isLast) break;
  }

  return bands;
}

export function computePricePrediction(
  yearlyTrends: YearlyTrend[],
  horizonYears = 2
): PricePredictionResult | null {
  if (yearlyTrends.length < 2) return null;

  const sorted = [...yearlyTrends].sort((a, b) => a.year - b.year);
  const weights = sorted.map((t) => Math.max(1, t.count));
  const sumW = weights.reduce((acc, w) => acc + w, 0);

  const meanX = sorted.reduce((acc, t, i) => acc + weights[i] * t.year, 0) / sumW;
  const meanY =
    sorted.reduce((acc, t, i) => acc + weights[i] * t.medianPricePerSqm, 0) / sumW;

  let num = 0;
  let den = 0;
  for (let i = 0; i < sorted.length; i++) {
    const dx = sorted[i].year - meanX;
    const dy = sorted[i].medianPricePerSqm - meanY;
    num += weights[i] * dx * dy;
    den += weights[i] * dx * dx;
  }

  const slope = den > 0 ? num / den : 0;
  const intercept = meanY - slope * meanX;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < sorted.length; i++) {
    const pred = slope * sorted[i].year + intercept;
    ssRes += weights[i] * Math.pow(sorted[i].medianPricePerSqm - pred, 2);
    ssTot += weights[i] * Math.pow(sorted[i].medianPricePerSqm - meanY, 2);
  }

  const rSquared = ssTot > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 0;
  const rmse = Math.round(Math.sqrt(ssRes / sumW));
  const lastYear = sorted[sorted.length - 1].year;
  const lastMed = sorted[sorted.length - 1].medianPricePerSqm;

  // Anchor projection smoothly from the last observed year so visual transition is continuous
  // while reflecting the fitted annualized slope + uncertainty cone widening with sqrt(step)
  const projected: PredictedYearPoint[] = [];
  for (let step = 1; step <= horizonYears; step++) {
    const yr = lastYear + step;
    const rawPred = Math.round(slope * yr + intercept);
    // Blend 50% regression line + 50% anchored slope from last observed median for realistic local continuity
    const anchoredPred = Math.round(lastMed + slope * step);
    const predictedPricePerSqm = Math.max(1000, Math.round((rawPred + anchoredPred) / 2));
    const margin = Math.max(350, Math.round(rmse * (0.85 + 0.35 * step)));
    projected.push({
      year: yr,
      predictedPricePerSqm,
      lowerBound: Math.max(500, predictedPricePerSqm - margin),
      upperBound: predictedPricePerSqm + margin,
    });
  }

  const basePrice = meanY > 0 ? meanY : 1;
  const annualTrendPct = Math.round((slope / basePrice) * 1000) / 10;

  return {
    observed: sorted,
    projected,
    annualSlopeEurSqm: Math.round(slope),
    annualTrendPct,
    rSquared: Math.round(rSquared * 100) / 100,
    rmse,
  };
}

function escapeCsvCell(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function transactionsToCsv(transactions: DvfTransaction[]): string {
  const headers = [
    'Date mutation',
    'ID mutation',
    'Adresse',
    'Code postal',
    'Commune',
    'Typologie',
    'Pièces',
    'Surface bâtie (m²)',
    'Surface Carrez (m²)',
    'Valeur foncière (€)',
    'Prix/m² (€)',
    'Distance (m)',
    'Dépendances',
    'Parcelle cadastrale',
    'Vente en bloc',
    'Latitude',
    'Longitude',
  ];

  const lines = [headers.join(';')];
  for (const t of transactions) {
    lines.push(
      [
        t.dateMutation,
        t.idMutation,
        t.address,
        t.postalCode,
        t.cityName,
        t.roomLabel,
        t.rooms,
        t.surfaceBati,
        t.surfaceCarrez ?? '',
        t.valeurFonciere,
        t.pricePerSqm,
        t.distanceMeters,
        t.dependanceCount,
        t.parcelId,
        t.isBlockSale ? 'Oui' : 'Non',
        t.latitude,
        t.longitude,
      ]
        .map(escapeCsvCell)
        .join(';')
    );
  }
  return '\uFEFF' + lines.join('\n');
}
