import { haversineDistanceMeters } from './dvf.ts';

export interface BdnbBuildingInfo {
  batimentGroupeId: string;
  addressLabel: string | null;
  constructionYear: number | null;
  wallMaterial: string | null;
  roofMaterial: string | null;
  floors: number | null;
  dwellingsCount: number | null;
  elecMetersCount: number | null;
  meanHeightM: number | null;
  groundAltitudeM: number | null;
  footprintSqm: number | null;
  dpeClassBuilding: string | null;
  dpeConsoEpSqm: number | null;
  gesEmissionSqm: number | null;
  inertiaClass: string | null;
  traversing: string | null;
  windowOrientations: string[];
  hasBalcony: boolean | null;
  windowRatioPct: number | null;
  solarFactor: number | null;
  glazingType: string | null;
  windowFrameMaterial: string | null;
  wallInsulation: string | null;
  heatingEnergy: string | null;
  heatingGenerator: string | null;
  ventilationType: string | null;
  solarThermalPotential: number | null;
  dpeDistribution: Record<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G', number>;
}

export interface AdemeDpeRecord {
  numeroDpe: string;
  dateEtablissement: string;
  etiquetteDpe: string;
  etiquetteGes: string;
  consoEpSqm: number | null;
  emissionGesSqm: number | null;
  surfaceHabitable: number | null;
  anneeConstruction: number | null;
  energyType: string | null;
  heatingInstallation: string | null;
  envelopeInsulation: string | null;
  windowInsulation: string | null;
  floorNumber: number | null;
  likelyMatch: boolean;
  surfaceDiffSqm: number | null;
}

export interface CadastreParcelInfo {
  idu: string;
  section: string;
  numero: string;
  feuille: number | null;
  contenanceSqm: number | null;
  builtCoveragePct: number | null;
}

export type CardinalDir = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SO' | 'O' | 'NO';

export interface NeighborBuildingMask {
  id: string;
  heightM: number;
  floors: number | null;
  distanceM: number;
  direction: CardinalDir;
  obstructionAngleDeg: number;
  facadeLengthM?: number;
  vegetationScreen?: string | null;
}

export interface FacadeRayMask {
  direction: CardinalDir;
  isCourtyard?: boolean;
  facadeLengthM: number;
  distanceM: number | null; // null => dégagé > 100 m
  facingBuildingId: string | null;
  facingHeightM: number | null;
  facingFloors: number | null;
  obstructionAngleDeg: number; // Relative to mid-building height or floor
  vegetationScreen: string | null;
}

export type VisibilityCategory = 'proche' | 'modere' | 'degage';

export interface BdTopo3DInfo {
  subjectHeightM: number | null;
  subjectFloors: number | null;
  subjectDwellings: number | null;
  subjectWallMaterial: string | null;
  subjectRoofMaterial: string | null;
  altitudeMinSolM: number | null;
  altitudeMaxToitM: number | null;
  adjoiningCount: number;
  neighborCount60m: number;
  // Principal (openest major non-mitoyen facade) vs tightest (courtyard) vs length-weighted effective setback
  principalVisAVisDistanceM: number | null; // null => primary facade completely clear (> 100 m)
  principalFacingHeightM: number | null;
  principalDirection: CardinalDir | null;
  effectiveVisAVisDistanceM: number | null; // length-weighted average exposure across real facades (capped at 40 m/facade)
  closestNeighborDistanceM: number | null; // Tightest courtyard / side vis-a-vis
  closestNeighborHeightM: number | null;
  tallestNeighborHeightM: number | null;
  maxObstructionAngleDeg: number | null;
  skyOpennessPct: number | null;
  openDirectionsCount: number;
  visibilityCategory: VisibilityCategory;
  vegetationScreensCount: number;
  facades: FacadeRayMask[];
  nearestNeighbors: NeighborBuildingMask[];
}

export interface NaturalLuminosityBreakdown {
  score: number;
  skyContribution: number;
  distanceContribution: number;
  exposureContribution: number;
  crossLightLabel: string;
}

export interface TransactionEnvironmentMetrics {
  id: string;
  effectiveVisAVisM: number | null;
  principalVisAVisM: number | null;
  closestVisAVisM: number | null;
  visibilityCategory: VisibilityCategory;
  skyOpennessPct: number;
  subjectHeightM: number | null;
  maxObstructionAngleDeg: number | null;
  openDirectionsCount: number;
  vegetationScreensCount: number;
  luminosity: NaturalLuminosityBreakdown;
}

export interface SectorVisibilityBucket {
  category: VisibilityCategory;
  label: string;
  sublabel: string;
  count: number;
  pct: number;
  avgLuminosity: number | null;
}

export interface SectorEnvironmentSummary {
  totalAnalyzed: number;
  medianVisAVisM: number | null;
  medianLuminosity: number;
  q3Luminosity: number;
  avgSkyOpennessPct: number;
  visibilityBuckets: SectorVisibilityBucket[];
  byTransactionId: Record<string, TransactionEnvironmentMetrics>;
}

export interface LidarAltiInfo {
  groundAltitudeNgfM: number | null;
  roofAltitudeNgfM: number | null;
  lidarCovered: boolean;
  lidarSensor: string | null;
  lidarTileName: string | null;
}

export interface SolarRadiationInfo {
  annualIrradiationKwhSqm: number | null;
  optimalSlopeDeg: number | null;
  optimalAzimuthDeg: number | null;
  monthlyKwh: Array<{ month: number; label: string; kwh: number }>;
}

export interface MeteoFranceInfo {
  elevationM: number | null;
  recent7dAvgSunshineHours: number | null;
  recent7dAvgRadiationMjSqm: number | null;
  recent7dAvgTempMaxC: number | null;
  recent7dAvgTempMinC: number | null;
}

export interface OsmContextInfo {
  displayName: string | null;
  quarter: string | null;
  cityBlock: string | null;
  suburb: string | null;
  osmType: string | null;
  osmId: number | null;
}

export interface SourceStatus {
  id: string;
  name: string;
  producer: string;
  available: boolean;
  note: string;
}

export interface PropertyEnrichmentResult {
  banId: string | null;
  banLabel: string | null;
  bdnb: BdnbBuildingInfo | null;
  ademeDpe: {
    totalAtAddress: number;
    records: AdemeDpeRecord[];
  };
  cadastre: CadastreParcelInfo | null;
  bdTopo: BdTopo3DInfo | null;
  lidarAlti: LidarAltiInfo | null;
  solar: SolarRadiationInfo | null;
  meteoFrance: MeteoFranceInfo | null;
  osm: OsmContextInfo | null;
  luminosity: NaturalLuminosityBreakdown | null;
  sources: SourceStatus[];
}

export interface GeoPolygonFeature {
  id?: string;
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
  properties?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Analytical WGS84 (EPSG:4326) -> Lambert-93 (EPSG:2154) Metric Projection
// IGN GRS80 LCC-2SP standard parameters
// ---------------------------------------------------------------------------
const L93_A = 6378137.0;
const L93_F = 1 / 298.257222101;
const L93_E = Math.sqrt(2 * L93_F - L93_F * L93_F);
const L93_LON0 = (3.0 * Math.PI) / 180;
const L93_PHI0 = (46.5 * Math.PI) / 180;
const L93_PHI1 = (44.0 * Math.PI) / 180;
const L93_PHI2 = (49.0 * Math.PI) / 180;
const L93_X0 = 700000.0;
const L93_Y0 = 6600000.0;

function isoLat(phi: number): number {
  const esin = L93_E * Math.sin(phi);
  return (
    Math.log(Math.tan(Math.PI / 4 + phi / 2)) +
    (L93_E / 2) * Math.log((1 - esin) / (1 + esin))
  );
}

function grandeNormale(phi: number): number {
  const s = Math.sin(phi);
  return L93_A / Math.sqrt(1 - L93_E * L93_E * s * s);
}

const L93_GN1 = grandeNormale(L93_PHI1);
const L93_GN2 = grandeNormale(L93_PHI2);
const L93_LAT1 = isoLat(L93_PHI1);
const L93_LAT2 = isoLat(L93_PHI2);
const L93_N =
  Math.log((L93_GN2 * Math.cos(L93_PHI2)) / (L93_GN1 * Math.cos(L93_PHI1))) /
  (L93_LAT1 - L93_LAT2);
const L93_C = ((L93_GN1 * Math.cos(L93_PHI1)) / L93_N) * Math.exp(L93_N * L93_LAT1);
const L93_YS = L93_Y0 + L93_C * Math.exp(-L93_N * isoLat(L93_PHI0));

export function wgs84ToLambert93(lat: number, lon: number): [number, number] {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180;
  const r = L93_C * Math.exp(-L93_N * isoLat(phi));
  const gamma = L93_N * (lambda - L93_LON0);
  const x = L93_X0 + r * Math.sin(gamma);
  const y = L93_YS - r * Math.cos(gamma);
  return [x, y];
}

// ---------------------------------------------------------------------------
// Metric Lambert-93 Geometry Helpers
// ---------------------------------------------------------------------------

type Pt2D = [number, number];

function extractOuterRingWgs84(geometry: GeoPolygonFeature['geometry']): Pt2D[] {
  if (!geometry || !geometry.coordinates) return [];
  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates as number[][][];
    return (rings[0] ?? []).map((pt) => [pt[0], pt[1]]);
  }
  if (geometry.type === 'MultiPolygon') {
    const polys = geometry.coordinates as number[][][][];
    let bestRing: Pt2D[] = [];
    for (const poly of polys) {
      if (poly[0] && poly[0].length > bestRing.length) {
        bestRing = poly[0].map((pt) => [pt[0], pt[1]]);
      }
    }
    return bestRing;
  }
  return [];
}

function extractAllPolygonPartsWgs84(
  geometry: GeoPolygonFeature['geometry']
): Array<{ outer: Pt2D[]; holes: Pt2D[][] }> {
  if (!geometry || !geometry.coordinates) return [];
  const toPart = (rings: number[][][]): { outer: Pt2D[]; holes: Pt2D[][] } | null => {
    if (!rings || !rings[0] || rings[0].length < 3) return null;
    return {
      outer: rings[0].map((pt) => [pt[0], pt[1]]),
      holes: rings
        .slice(1)
        .filter((h) => Array.isArray(h) && h.length >= 3)
        .map((h) => h.map((pt) => [pt[0], pt[1]])),
    };
  };

  if (geometry.type === 'Polygon') {
    const p = toPart(geometry.coordinates as number[][][]);
    return p ? [p] : [];
  }
  if (geometry.type === 'MultiPolygon') {
    const polys = geometry.coordinates as number[][][][];
    const parts: Array<{ outer: Pt2D[]; holes: Pt2D[][] }> = [];
    for (const poly of polys) {
      const p = toPart(poly);
      if (p) parts.push(p);
    }
    return parts;
  }
  return [];
}

function signedArea2D(ring: Pt2D[]): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return area / 2;
}

function closeRing(ring: Pt2D[]): Pt2D[] {
  if (ring.length < 3) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}

function ensureCcwRing(ring: Pt2D[]): Pt2D[] {
  if (ring.length < 3) return ring;
  const closed = closeRing(ring);
  return signedArea2D(closed) < 0 ? [...closed].reverse() : closed;
}

function ensureCwRing(ring: Pt2D[]): Pt2D[] {
  if (ring.length < 3) return ring;
  const closed = closeRing(ring);
  return signedArea2D(closed) > 0 ? [...closed].reverse() : closed;
}

function ringBBox(ring: Pt2D[]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

function centroidOfRing(ring: Pt2D[]): Pt2D {
  const n = ring.length > 1 ? ring.length - 1 : ring.length;
  if (n === 0) return [0, 0];
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += ring[i][0];
    sy += ring[i][1];
  }
  return [sx / n, sy / n];
}

function pointInRing2D(x: number, y: number, ring: Pt2D[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointToSegmentDist2D(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function pointToRingDist2D(px: number, py: number, ring: Pt2D[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const d = pointToSegmentDist2D(px, py, ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

function minPolygonEdgeDistance2D(ringA: Pt2D[], ringB: Pt2D[]): number {
  let best = Infinity;
  for (let i = 0; i < ringA.length - 1; i++) {
    const ax = ringA[i][0];
    const ay = ringA[i][1];
    for (let j = 0; j < ringB.length - 1; j++) {
      const d = pointToSegmentDist2D(ax, ay, ringB[j][0], ringB[j][1], ringB[j + 1][0], ringB[j + 1][1]);
      if (d < best) best = d;
    }
  }
  for (let i = 0; i < ringB.length - 1; i++) {
    const bx = ringB[i][0];
    const by = ringB[i][1];
    for (let j = 0; j < ringA.length - 1; j++) {
      const d = pointToSegmentDist2D(bx, by, ringA[j][0], ringA[j][1], ringA[j + 1][0], ringA[j + 1][1]);
      if (d < best) best = d;
    }
  }
  return best;
}

// Ray P + t * D (t >= 0) intersection with segment A -> B; returns t or Infinity
function raySegmentIntersectDist(
  px: number,
  py: number,
  dx: number,
  dy: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const sx = bx - ax;
  const sy = by - ay;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-9) return Infinity;
  const qpx = ax - px;
  const qpy = ay - py;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * dy - qpy * dx) / denom;
  if (t >= 0 && u >= 0 && u <= 1) {
    return t;
  }
  return Infinity;
}

function rayMultiRingMinHit(
  px: number,
  py: number,
  dx: number,
  dy: number,
  rings: Pt2D[][],
  maxDist: number,
  minDist = 0
): number {
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const t = raySegmentIntersectDist(
        px,
        py,
        dx,
        dy,
        ring[i][0],
        ring[i][1],
        ring[i + 1][0],
        ring[i + 1][1]
      );
      if (t >= minDist && t < best && t <= maxDist) best = t;
    }
  }
  return best;
}

function vectorToCardinal(dx: number, dy: number): CardinalDir {
  // In Lambert-93, +X is East, +Y is North
  const angle = (Math.atan2(dx, dy) * 180) / Math.PI; // 0 = N, 90 = E
  const normalized = (angle + 360) % 360;
  const dirs: CardinalDir[] = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return dirs[Math.round(normalized / 45) % 8];
}

// ---------------------------------------------------------------------------
// Parisian Thresholds & Floor-Aware Vertical Obstruction Angle
// ---------------------------------------------------------------------------

/**
 * Refined Parisian vis-a-vis thresholds:
 * - < 9 m: Vis-a-vis proche (cour étroite, impasse ou passage serré)
 * - 9–16 m: Vis-a-vis modéré (largeur de rue parisienne classique)
 * - > 16 m (or null = > 100 m): Vue dégagée (avenue, place, école ou recul sans masque proche)
 */
export function classifyVisibility(distanceM: number | null): VisibilityCategory {
  if (distanceM === null) return 'degage';
  if (distanceM > 16) return 'degage';
  if (distanceM >= 9) return 'modere';
  return 'proche';
}

/**
 * Vertical obstruction angle from apartment floor elevation H_appart = 0.50 + floor * 2.90
 * to facing roofline H_face at distance D:
 * Angle = arctan((H_face - H_appart) / D), clamped to 0 deg when facing roof is below floor.
 */
export function computeObstructionAngleForFloor(
  facingHeightM: number,
  distanceM: number,
  apartmentFloor: number | null
): number {
  if (distanceM <= 0) return 90;
  const hAppart = apartmentFloor !== null ? 0.5 + Math.max(0, apartmentFloor) * 2.9 : 0.5;
  const deltaH = facingHeightM - hAppart;
  if (deltaH <= 0) return 0;
  return Math.round((Math.atan2(deltaH, distanceM) * 180) / Math.PI);
}

// ---------------------------------------------------------------------------
// Prepared Lambert-93 BD TOPO Buildings & Vegetation
// ---------------------------------------------------------------------------

export interface ParsedBdTopoBuilding {
  f: GeoPolygonFeature;
  ringL93: Pt2D[]; // Largest exterior outer ring (CCW)
  outerRingsL93: Pt2D[][]; // All exterior outer rings of MultiPolygon (CCW)
  holeRingsL93: Pt2D[][]; // All interior courtyard holes (CW so outward normal points into courtyard)
  allRingsL93: Pt2D[][]; // Outer (CCW) + Holes (CW)
  bbox: [number, number, number, number];
  centroidL93: Pt2D;
  heightM: number;
  floors: number | null;
}

export interface ParsedVegetationZone {
  ringL93: Pt2D[];
  bbox: [number, number, number, number];
  nature: string;
}

function pointInBuilding2D(x: number, y: number, b: ParsedBdTopoBuilding): boolean {
  const inOuter = b.outerRingsL93.some((r) => pointInRing2D(x, y, r));
  if (!inOuter) return false;
  return !b.holeRingsL93.some((h) => pointInRing2D(x, y, h));
}

function sanitizeBdTopoHeight(
  rawH: number,
  floors: number | null,
  sourceIds: string
): number {
  let heightM = Number.isFinite(rawH) && rawH > 0 ? rawH : 0;
  // Multi-story buildings whose BD TOPO local part has low/0 roof terrace height
  if (heightM < 6 && floors !== null && floors >= 2) {
    heightM = Math.round(floors * 3.0 * 10) / 10;
  }
  // ANFR telecom antenna masts pasted onto rooftop height when no residential floor count exists
  if ((sourceIds.startsWith('ANFR') || heightM > 45) && floors === null) {
    heightM = 21;
  }
  return heightM;
}

export function prepareBdTopoFeatures(features: GeoPolygonFeature[]): ParsedBdTopoBuilding[] {
  const out: ParsedBdTopoBuilding[] = [];
  for (const f of features) {
    const partsWgs = extractAllPolygonPartsWgs84(f.geometry);
    if (partsWgs.length === 0) continue;

    const outerRingsL93: Pt2D[][] = [];
    const holeRingsL93: Pt2D[][] = [];
    let primaryOuter: Pt2D[] = [];
    let bestArea = -1;

    for (const part of partsWgs) {
      const outer = ensureCcwRing(part.outer.map(([lon, lat]) => wgs84ToLambert93(lat, lon)));
      outerRingsL93.push(outer);
      const area = Math.abs(signedArea2D(outer));
      if (area > bestArea) {
        bestArea = area;
        primaryOuter = outer;
      }
      for (const h of part.holes) {
        holeRingsL93.push(ensureCwRing(h.map(([lon, lat]) => wgs84ToLambert93(lat, lon))));
      }
    }

    if (primaryOuter.length < 3) continue;

    const allRingsL93 = [...outerRingsL93, ...holeRingsL93];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const r of outerRingsL93) {
      const [rx1, ry1, rx2, ry2] = ringBBox(r);
      if (rx1 < minX) minX = rx1;
      if (ry1 < minY) minY = ry1;
      if (rx2 > maxX) maxX = rx2;
      if (ry2 > maxY) maxY = ry2;
    }

    const centroidL93 = centroidOfRing(primaryOuter);
    const props = f.properties ?? {};
    const rawH =
      typeof props.hauteur === 'number' && Number.isFinite(props.hauteur) ? props.hauteur : 0;
    const floors =
      typeof props.nombre_d_etages === 'number' &&
      Number.isFinite(props.nombre_d_etages) &&
      props.nombre_d_etages > 0
        ? props.nombre_d_etages
        : null;
    const sourceIds = typeof props.identifiants_sources === 'string' ? props.identifiants_sources : '';
    const heightM = sanitizeBdTopoHeight(rawH, floors, sourceIds);

    out.push({
      f,
      ringL93: primaryOuter,
      outerRingsL93,
      holeRingsL93,
      allRingsL93,
      bbox: [minX, minY, maxX, maxY],
      centroidL93,
      heightM,
      floors,
    });
  }
  return out;
}

export function prepareVegetationFeatures(features: GeoPolygonFeature[]): ParsedVegetationZone[] {
  const out: ParsedVegetationZone[] = [];
  for (const f of features) {
    const rawWgs = extractOuterRingWgs84(f.geometry);
    if (rawWgs.length < 3) continue;
    const ringL93 = ensureCcwRing(rawWgs.map(([lon, lat]) => wgs84ToLambert93(lat, lon)));
    const bbox = ringBBox(ringL93);
    const natureRaw = f.properties?.nature;
    const nature = typeof natureRaw === 'string' && natureRaw.trim() ? natureRaw.trim() : 'Végétation haute';
    out.push({ ringL93, bbox, nature });
  }
  return out;
}

interface RawEdgeMeasurement {
  dir: CardinalDir;
  isCourtyard: boolean;
  segLen: number;
  distM: number | null;
  neighbor: ParsedBdTopoBuilding | null;
  vegDetected: string | null;
}

export function computeBdTopoVisAVisFromPrepared(
  parsed: ParsedBdTopoBuilding[],
  targetLat: number,
  targetLon: number,
  vegetation: ParsedVegetationZone[] = [],
  apartmentFloor: number | null = null
): BdTopo3DInfo {
  if (parsed.length === 0) {
    return {
      subjectHeightM: null,
      subjectFloors: null,
      subjectDwellings: null,
      subjectWallMaterial: null,
      subjectRoofMaterial: null,
      altitudeMinSolM: null,
      altitudeMaxToitM: null,
      adjoiningCount: 0,
      neighborCount60m: 0,
      principalVisAVisDistanceM: null,
      principalFacingHeightM: null,
      principalDirection: null,
      effectiveVisAVisDistanceM: null,
      closestNeighborDistanceM: null,
      closestNeighborHeightM: null,
      tallestNeighborHeightM: null,
      maxObstructionAngleDeg: null,
      skyOpennessPct: null,
      openDirectionsCount: 4,
      visibilityCategory: 'degage',
      vegetationScreensCount: 0,
      facades: [],
      nearestNeighbors: [],
    };
  }

  const [tx, ty] = wgs84ToLambert93(targetLat, targetLon);

  // Locate subject building preferring residential-scale buildings (>= 6 m):
  // 1) Point inside polygon (excluding interior courtyard holes)
  // 2) Closest exterior facade within 25 m (BAN address coordinates often lie on the sidewalk)
  // 3) Nearest centroid fallback
  let insideResIdx = -1;
  let insideResHeight = -1;
  let insideAnyIdx = -1;
  let insideAnyHeight = -1;
  let bestResEdgeDist = Infinity;
  let bestResEdgeIdx = -1;
  let bestAnyEdgeDist = Infinity;
  let bestAnyEdgeIdx = -1;
  let bestCenterDist = Infinity;
  let bestCenterIdx = 0;

  for (let i = 0; i < parsed.length; i++) {
    const b = parsed[i];
    const [minX, minY, maxX, maxY] = b.bbox;
    if (tx >= minX - 30 && tx <= maxX + 30 && ty >= minY - 30 && ty <= maxY + 30) {
      if (pointInBuilding2D(tx, ty, b)) {
        if (b.heightM >= 6 && b.heightM >= insideResHeight) {
          insideResHeight = b.heightM;
          insideResIdx = i;
        }
        if (b.heightM >= insideAnyHeight) {
          insideAnyHeight = b.heightM;
          insideAnyIdx = i;
        }
      }
      const ed = Math.min(...b.outerRingsL93.map((r) => pointToRingDist2D(tx, ty, r)));
      if (b.heightM >= 6 && ed < bestResEdgeDist) {
        bestResEdgeDist = ed;
        bestResEdgeIdx = i;
      }
      if (b.heightM >= 3.5 && ed < bestAnyEdgeDist) {
        bestAnyEdgeDist = ed;
        bestAnyEdgeIdx = i;
      }
    }
    const cd = Math.hypot(tx - b.centroidL93[0], ty - b.centroidL93[1]);
    if (cd < bestCenterDist) {
      bestCenterDist = cd;
      bestCenterIdx = i;
    }
  }

  let subjectIdx = insideResIdx;
  if (subjectIdx === -1) {
    if (bestResEdgeIdx !== -1 && bestResEdgeDist <= 25) {
      subjectIdx = bestResEdgeIdx;
    } else if (insideAnyIdx !== -1) {
      subjectIdx = insideAnyIdx;
    } else if (bestAnyEdgeIdx !== -1 && bestAnyEdgeDist <= 25) {
      subjectIdx = bestAnyEdgeIdx;
    } else {
      subjectIdx = bestCenterIdx;
    }
  }

  const subject = parsed[subjectIdx];
  const sp = subject.f.properties ?? {};
  const toNum = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const toStr = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null;

  // Candidate neighboring main buildings within 100 m ray horizon
  const [sMinX, sMinY, sMaxX, sMaxY] = subject.bbox;
  const MAX_RAY = 100;
  const candidateNeighbors: ParsedBdTopoBuilding[] = [];
  let adjoiningCount = 0;

  for (let i = 0; i < parsed.length; i++) {
    if (i === subjectIdx) continue;
    const nb = parsed[i];
    if (nb.heightM < 3.5) continue; // Skip low courtyard sheds/garages < 3.5 m
    const [nMinX, nMinY, nMaxX, nMaxY] = nb.bbox;
    if (
      nMaxX < sMinX - MAX_RAY ||
      nMinX > sMaxX + MAX_RAY ||
      nMaxY < sMinY - MAX_RAY ||
      nMinY > sMaxY + MAX_RAY
    ) {
      continue;
    }
    const edgeDist = minPolygonEdgeDistance2D(subject.ringL93, nb.ringL93);
    if (edgeDist <= 1.8) {
      if (nb.heightM >= Math.max(8, subject.heightM * 0.55)) {
        adjoiningCount++;
        continue;
      }
      // A low annex (4–7 m) touching the ground floor is NOT a full-height party wall; still skip self-contact noise
      continue;
    }
    if (edgeDist <= MAX_RAY) {
      candidateNeighbors.push(nb);
    }
  }

  // Candidate vegetation zones within 100 m
  const candidateVeg = vegetation.filter((v) => {
    const [vMinX, vMinY, vMaxX, vMaxY] = v.bbox;
    return !(
      vMaxX < sMinX - MAX_RAY ||
      vMinX > sMaxX + MAX_RAY ||
      vMaxY < sMinY - MAX_RAY ||
      vMinY > sMaxY + MAX_RAY
    );
  });

  // Step 2: Facade-by-facade decomposition across ALL outer + interior courtyard hole rings
  const subjFloors = toNum(sp.nombre_d_etages);
  const effectiveSubjFloors =
    subjFloors ?? (subject.heightM > 0 ? Math.max(2, Math.round(subject.heightM / 3.0)) : null);
  const evalFloor =
    apartmentFloor !== null
      ? apartmentFloor
      : effectiveSubjFloors !== null
      ? Math.max(1, Math.floor(effectiveSubjFloors / 2))
      : 2;

  const minPartyWallH = Math.max(8, subject.heightM * 0.55);
  const edgesByKey = new Map<string, RawEdgeMeasurement[]>();

  for (let ringIdx = 0; ringIdx < subject.allRingsL93.length; ringIdx++) {
    const ring = subject.allRingsL93[ringIdx];
    const isHoleRing = ringIdx >= subject.outerRingsL93.length;

    for (let i = 0; i < ring.length - 1; i++) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[i + 1];
      const segDx = bx - ax;
      const segDy = by - ay;
      const segLen = Math.hypot(segDx, segDy);
      if (segLen < 1.8) continue;

      // In CCW outer rings and CW courtyard holes, (segDy/segLen, -segDx/segLen) always points toward open air
      const nx = segDy / segLen;
      const ny = -segDx / segLen;
      const dir = vectorToCardinal(nx, ny);

      const sampleFracs = [0.25, 0.5, 0.75];
      const hitPairs: Array<{ dist: number; neighbor: ParsedBdTopoBuilding | null }> = [];
      let partyWallHits = 0;
      let vegDetected: string | null = null;

      for (const frac of sampleFracs) {
        const px = ax + segDx * frac + nx * 0.35;
        const py = ay + segDy * frac + ny * 0.35;

        const coneAngles = [-7, 0, 7];
        let sampleClosest = Infinity;
        let sampleNb: ParsedBdTopoBuilding | null = null;

        for (const deg of coneAngles) {
          const rad = (deg * Math.PI) / 180;
          const rdx = nx * Math.cos(rad) - ny * Math.sin(rad);
          const rdy = nx * Math.sin(rad) + ny * Math.cos(rad);

          // 1) Ray vs external neighboring buildings
          for (const nb of candidateNeighbors) {
            const hit = rayMultiRingMinHit(px, py, rdx, rdy, nb.allRingsL93, MAX_RAY, 0);
            if (hit < sampleClosest) {
              sampleClosest = hit;
              sampleNb = nb;
            }
          }

          // 2) Self-intersection against U/L-shaped wings & opposite courtyard walls (minDist 0.8 m skips own wall)
          const selfHit = rayMultiRingMinHit(px, py, rdx, rdy, subject.allRingsL93, MAX_RAY, 0.8);
          if (selfHit < sampleClosest) {
            sampleClosest = selfHit;
            sampleNb = subject;
          }
        }

        // Only full-height touching buildings count as blind mitoyen party walls (low 4 m courtyard glass roofs don't)
        for (let bIdx = 0; bIdx < parsed.length; bIdx++) {
          if (bIdx === subjectIdx) continue;
          const nb = parsed[bIdx];
          if (nb.heightM < minPartyWallH) continue;
          const hitClose = rayMultiRingMinHit(px, py, nx, ny, nb.allRingsL93, 1.8, 0);
          if (hitClose <= 1.8 || pointInBuilding2D(px, py, nb)) {
            partyWallHits++;
            break;
          }
        }

        if (Number.isFinite(sampleClosest) && sampleNb) {
          hitPairs.push({ dist: sampleClosest + 0.35, neighbor: sampleNb });
        } else {
          hitPairs.push({ dist: Infinity, neighbor: null });
        }

        if (!vegDetected && candidateVeg.length > 0) {
          const maxVegRange = Number.isFinite(sampleClosest) ? sampleClosest : 35;
          for (const v of candidateVeg) {
            const vHit = rayPolygonMinHit(px, py, nx, ny, v.ringL93, maxVegRange);
            if (Number.isFinite(vHit) || pointInRing2D(px, py, v.ringL93)) {
              vegDetected = v.nature;
              break;
            }
          }
        }
      }

      if (partyWallHits >= 2) {
        continue;
      }

      hitPairs.sort((u, v) => u.dist - v.dist);
      const medianPair = hitPairs[1];
      const distM = Number.isFinite(medianPair.dist) ? Math.round(medianPair.dist * 10) / 10 : null;
      const isCourtyard = isHoleRing || medianPair.neighbor === subject;
      const key = `${dir}|${isCourtyard ? 'cour' : 'ext'}`;
      const list = edgesByKey.get(key) ?? [];
      list.push({
        dir,
        isCourtyard,
        segLen,
        distM,
        neighbor: medianPair.neighbor,
        vegDetected,
      });
      edgesByKey.set(key, list);
    }
  }

  // Aggregate edges per (direction, exterior vs courtyard) weighted by facade length.
  // If an exterior direction has major straight facades (>= 6 m), discard small recess notches (< 4.5 m)
  // in that same group so tiny light-well jogs don't dilute a clean street/courtyard facade.
  const dirFacades = new Map<string, FacadeRayMask>();

  for (const [key, rawList] of edgesByKey.entries()) {
    const { dir, isCourtyard } = rawList[0];
    const hasMajor = !isCourtyard && rawList.some((e) => e.segLen >= 6.0);
    const list = hasMajor ? rawList.filter((e) => e.segLen >= 4.5) : rawList;
    if (list.length === 0) continue;

    const totalLen = list.reduce((s, e) => s + e.segLen, 0);
    const obstructed = list.filter((e) => e.distM !== null && e.neighbor !== null);
    const obstructedLen = obstructed.reduce((s, e) => s + e.segLen, 0);

    let distM: number | null = null;
    let facingH: number | null = null;
    let facingFloors: number | null = null;
    let facingBuildingId: string | null = null;

    if (obstructed.length > 0 && obstructedLen >= totalLen * 0.4) {
      distM =
        Math.round(
          (obstructed.reduce((s, e) => s + (e.distM ?? 0) * e.segLen, 0) / obstructedLen) * 10
        ) / 10;
      facingH =
        Math.round(
          (obstructed.reduce((s, e) => s + (e.neighbor?.heightM ?? 0) * e.segLen, 0) /
            obstructedLen) *
            10
        ) / 10;
      const dominant = [...obstructed].sort((a, b) => b.segLen - a.segLen)[0];
      facingBuildingId = dominant.neighbor
        ? dominant.neighbor === subject
          ? String(subject.f.id ?? 'cour-interieure')
          : String(dominant.neighbor.f.id ?? '')
        : null;
      facingFloors = dominant.neighbor?.floors ?? null;
    }

    const vegScreen = list.find((e) => e.vegDetected)?.vegDetected ?? null;
    const angleDeg =
      distM !== null && facingH !== null
        ? computeObstructionAngleForFloor(facingH, distM, evalFloor)
        : 0;

    dirFacades.set(key, {
      direction: dir,
      isCourtyard,
      facadeLengthM: Math.round(totalLen * 10) / 10,
      distanceM: distM,
      facingBuildingId,
      facingHeightM: facingH,
      facingFloors,
      obstructionAngleDeg: angleDeg,
      vegetationScreen: vegScreen,
    });
  }

  const facades = Array.from(dirFacades.values()).sort((a, b) => {
    const da = a.distanceM ?? 999;
    const db = b.distanceM ?? 999;
    return db - da; // Openest facade first
  });

  // Build nearestNeighbors list from distinct obstructing buildings on non-mitoyen facades + nearby candidates
  const neighborMaskMap = new Map<string, NeighborBuildingMask>();
  for (const fac of facades) {
    if (fac.distanceM === null || !fac.facingBuildingId || fac.facingHeightM === null) continue;
    const prev = neighborMaskMap.get(fac.facingBuildingId);
    if (!prev || fac.distanceM < prev.distanceM) {
      neighborMaskMap.set(fac.facingBuildingId, {
        id: fac.facingBuildingId,
        heightM: fac.facingHeightM,
        floors: fac.facingFloors,
        distanceM: fac.distanceM,
        direction: fac.direction,
        obstructionAngleDeg: fac.obstructionAngleDeg,
        facadeLengthM: fac.facadeLengthM,
        vegetationScreen: fac.vegetationScreen,
      });
    }
  }

  // Also include nearby surrounding non-mitoyen buildings (< 60 m) if fewer than 4 facades hit neighbors
  for (let i = 0; i < candidateNeighbors.length; i++) {
    const nb = candidateNeighbors[i];
    const nbId = String(nb.f.id ?? `nb-${i}`);
    if (neighborMaskMap.has(nbId)) continue;
    const edgeDist = Math.round(minPolygonEdgeDistance2D(subject.ringL93, nb.ringL93) * 10) / 10;
    if (edgeDist > 60) continue;
    const h = Math.round(nb.heightM * 10) / 10;
    const dir = vectorToCardinal(
      nb.centroidL93[0] - subject.centroidL93[0],
      nb.centroidL93[1] - subject.centroidL93[1]
    );
    neighborMaskMap.set(nbId, {
      id: nbId,
      heightM: h,
      floors: nb.floors,
      distanceM: edgeDist,
      direction: dir,
      obstructionAngleDeg: computeObstructionAngleForFloor(h, edgeDist, evalFloor),
    });
  }

  const nearestNeighbors = Array.from(neighborMaskMap.values()).sort(
    (a, b) => a.distanceM - b.distanceM
  );

  // Principal facade: openest significant exterior facade (>= 4.5 m if available)
  const majorFacades = facades.filter((f) => f.facadeLengthM >= 4.5);
  const openFacadePool = majorFacades.length > 0 ? majorFacades : facades;
  const openFacade = openFacadePool.find((f) => !f.isCourtyard) ?? openFacadePool[0] ?? null;
  const principalDist = openFacade ? openFacade.distanceM : null;
  const principalFacingHeightM = openFacade ? openFacade.facingHeightM : null;
  const principalDirection = openFacade ? openFacade.direction : null;

  // Tightest obstructed facade among significant non-mitoyen facades
  const obstructedFacades = openFacadePool
    .filter((f): f is FacadeRayMask & { distanceM: number } => f.distanceM !== null)
    .sort((a, b) => a.distanceM - b.distanceM);

  const tightestFacade = obstructedFacades[0] ?? null;
  const closestDist = tightestFacade
    ? tightestFacade.distanceM
    : nearestNeighbors[0]?.distanceM ?? null;
  const closestHeight = tightestFacade
    ? tightestFacade.facingHeightM
    : nearestNeighbors[0]?.heightM ?? null;

  // Length-weighted effective vis-a-vis distance across main facades (each open facade capped at 40 m)
  let effectiveVisAVisDistanceM: number | null = null;
  if (openFacadePool.length > 0) {
    const totalW = openFacadePool.reduce((s, f) => s + f.facadeLengthM, 0);
    if (totalW > 0) {
      const weightedSum = openFacadePool.reduce(
        (s, f) => s + Math.min(40, f.distanceM ?? 40) * f.facadeLengthM,
        0
      );
      effectiveVisAVisDistanceM = Math.round((weightedSum / totalW) * 10) / 10;
    }
  } else if (closestDist !== null) {
    effectiveVisAVisDistanceM = closestDist;
  }

  const tallest =
    nearestNeighbors.length > 0
      ? nearestNeighbors.reduce((max, n) => (n.heightM > max ? n.heightM : max), 0)
      : null;
  const maxAngle =
    obstructedFacades.length > 0
      ? obstructedFacades.reduce(
          (max, f) => (f.obstructionAngleDeg > max ? f.obstructionAngleDeg : max),
          0
        )
      : nearestNeighbors[0]?.obstructionAngleDeg ?? null;

  // Open directions: non-mitoyen facades that are unobstructed (> 100 m) or >= 11 m / angle < 42 deg
  const openDirectionsCount =
    openFacadePool.length > 0
      ? openFacadePool.filter(
          (f) => f.distanceM === null || f.distanceM >= 11 || f.obstructionAngleDeg < 42
        ).length
      : 4;

  // Length-weighted sky openness % across open facades
  let skyOpennessPct: number | null = null;
  if (openFacadePool.length > 0) {
    const totalW = openFacadePool.reduce((s, f) => s + f.facadeLengthM, 0);
    const weightedSky = openFacadePool.reduce((s, f) => {
      const score =
        f.distanceM === null
          ? 94
          : Math.max(14, Math.min(94, Math.round((1 - f.obstructionAngleDeg / 90) * 100)));
      return s + score * f.facadeLengthM;
    }, 0);
    skyOpennessPct = totalW > 0 ? Math.round(weightedSky / totalW) : 55;
  } else if (nearestNeighbors.length > 0) {
    const sample = nearestNeighbors.slice(0, 4);
    const avgAngle = sample.reduce((acc, n) => acc + n.obstructionAngleDeg, 0) / sample.length;
    skyOpennessPct = Math.max(14, Math.min(94, Math.round((1 - avgAngle / 90) * 100)));
  } else {
    skyOpennessPct = 92;
  }

  const vegetationScreensCount = openFacadePool.filter((f) => Boolean(f.vegetationScreen)).length;

  // Classify visibility consistently using length-weighted effective vis-a-vis across facades
  const classificationDist =
    effectiveVisAVisDistanceM !== null
      ? effectiveVisAVisDistanceM
      : openFacadePool.length > 0
      ? principalDist
      : closestDist;

  return {
    subjectHeightM:
      subject.heightM > 0 ? Math.round(subject.heightM * 10) / 10 : toNum(sp.hauteur),
    subjectFloors: effectiveSubjFloors,
    subjectDwellings: toNum(sp.nombre_de_logements),
    subjectWallMaterial: toStr(sp.materiaux_des_murs),
    subjectRoofMaterial: toStr(sp.materiaux_de_la_toiture),
    altitudeMinSolM: toNum(sp.altitude_minimale_sol),
    altitudeMaxToitM: toNum(sp.altitude_maximale_toit),
    adjoiningCount,
    neighborCount60m: nearestNeighbors.length,
    principalVisAVisDistanceM: principalDist,
    principalFacingHeightM,
    principalDirection,
    effectiveVisAVisDistanceM,
    closestNeighborDistanceM: closestDist,
    closestNeighborHeightM: closestHeight,
    tallestNeighborHeightM: tallest,
    maxObstructionAngleDeg: maxAngle,
    skyOpennessPct,
    openDirectionsCount,
    visibilityCategory: classifyVisibility(classificationDist),
    vegetationScreensCount,
    facades,
    nearestNeighbors: nearestNeighbors.slice(0, 6),
  };
}

export function computeBdTopoVisAVis(
  features: GeoPolygonFeature[],
  targetLat: number,
  targetLon: number,
  vegetationFeatures: GeoPolygonFeature[] = [],
  apartmentFloor: number | null = null
): BdTopo3DInfo {
  const prepared = prepareBdTopoFeatures(features);
  const preparedVeg = prepareVegetationFeatures(vegetationFeatures);
  return computeBdTopoVisAVisFromPrepared(prepared, targetLat, targetLon, preparedVeg, apartmentFloor);
}

export function computeNaturalLuminosityScore(
  bdTopo: BdTopo3DInfo | null,
  bdnb?: BdnbBuildingInfo | null
): NaturalLuminosityBreakdown {
  const skyPct = bdTopo?.skyOpennessPct ?? 55;
  const principalDist = bdTopo
    ? bdTopo.principalVisAVisDistanceM === null
      ? 35
      : bdTopo.principalVisAVisDistanceM
    : 12;
  const closestDist = bdTopo?.closestNeighborDistanceM ?? principalDist;
  const effectiveDist =
    bdTopo?.effectiveVisAVisDistanceM !== null && bdTopo?.effectiveVisAVisDistanceM !== undefined
      ? bdTopo.effectiveVisAVisDistanceM
      : principalDist * 0.65 + closestDist * 0.35;
  const openDirs = bdTopo?.openDirectionsCount ?? 2;

  // 1) Sky openness across facades (max 55 pts)
  const skyContribution = Math.round((Math.min(100, Math.max(0, skyPct)) / 100) * 55);
  // 2) Parisian facade setback distance (max 25 pts, plateaus around 18 m)
  const distanceContribution = Math.round((Math.min(18, Math.max(0, effectiveDist)) / 18) * 25);
  // 3) Multi-facade exposure / traversant bonus (max 20 pts)
  const isTraversantBdnb =
    bdnb?.traversing?.toLowerCase().includes('traversant') &&
    !bdnb.traversing.toLowerCase().includes('non');
  const majorOpenCount =
    bdTopo?.facades.filter((f) => f.facadeLengthM >= 4.5).length ??
    bdTopo?.facades.length ??
    openDirs;
  const baseDirPts = Math.round((Math.min(3, Math.max(0, openDirs)) / 3) * 14);
  const traversantPts =
    isTraversantBdnb || majorOpenCount >= 2
      ? 4
      : bdTopo && (bdTopo.subjectHeightM ?? 0) >= (bdTopo.closestNeighborHeightM ?? 0)
      ? 2
      : 0;
  const vegPenalty = Math.min(3, bdTopo?.vegetationScreensCount ?? 0);
  const exposureContribution = Math.max(2, Math.min(20, baseDirPts + traversantPts - vegPenalty));

  const score = Math.max(12, Math.min(98, skyContribution + distanceContribution + exposureContribution));
  const crossLightLabel = isTraversantBdnb
    ? 'Traversant (BDNB) · multi-orientations'
    : majorOpenCount >= 3
    ? `Ouvert sur ${majorOpenCount} façades`
    : majorOpenCount === 2
    ? 'Double exposition (rue & cour)'
    : 'Mono-orienté / masqué';

  return {
    score,
    skyContribution,
    distanceContribution,
    exposureContribution,
    crossLightLabel,
  };
}

export function buildSectorEnvironmentSummary(
  items: TransactionEnvironmentMetrics[]
): SectorEnvironmentSummary {
  const byTransactionId: Record<string, TransactionEnvironmentMetrics> = {};
  for (const item of items) {
    byTransactionId[item.id] = item;
  }

  const total = items.length;
  const bucketsMeta: Array<{ category: VisibilityCategory; label: string; sublabel: string }> = [
    { category: 'proche', label: 'Vis-à-vis proche (< 9 m)', sublabel: 'Cour étroite ou passage serré' },
    { category: 'modere', label: 'Vis-à-vis modéré (9–16 m)', sublabel: 'Largeur de rue parisienne classique' },
    { category: 'degage', label: 'Vue dégagée (> 16 m)', sublabel: 'Avenue, place ou recul sans masque proche' },
  ];

  const visibilityBuckets: SectorVisibilityBucket[] = bucketsMeta.map((b) => {
    const matches = items.filter((it) => it.visibilityCategory === b.category);
    const avgLum =
      matches.length > 0
        ? Math.round(matches.reduce((acc, m) => acc + m.luminosity.score, 0) / matches.length)
        : null;
    return {
      category: b.category,
      label: b.label,
      sublabel: b.sublabel,
      count: matches.length,
      pct: total > 0 ? Math.round((matches.length / total) * 100) : 0,
      avgLuminosity: avgLum,
    };
  });

  const sortedDists = items
    .map((it) => it.effectiveVisAVisM ?? it.principalVisAVisM ?? 40)
    .sort((a, b) => a - b);
  const medianVisAVisM =
    sortedDists.length > 0
      ? Math.round(sortedDists[Math.floor(sortedDists.length / 2)] * 10) / 10
      : null;

  const sortedLum = items.map((it) => it.luminosity.score).sort((a, b) => a - b);
  const medianLuminosity =
    sortedLum.length > 0 ? sortedLum[Math.floor(sortedLum.length / 2)] : 0;
  const q3Luminosity =
    sortedLum.length > 0
      ? sortedLum[Math.min(sortedLum.length - 1, Math.floor(sortedLum.length * 0.75))]
      : 0;

  const avgSkyOpennessPct =
    total > 0 ? Math.round(items.reduce((acc, it) => acc + it.skyOpennessPct, 0) / total) : 0;

  return {
    totalAnalyzed: total,
    medianVisAVisM,
    medianLuminosity,
    q3Luminosity,
    avgSkyOpennessPct,
    visibilityBuckets,
    byTransactionId,
  };
}
