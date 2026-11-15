import test from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineDistanceMeters,
  parseGeoDvfCsv,
  aggregateAndFilterDvfRows,
  computeSummaryStats,
  computePriceBrackets,
  computeSurfaceBands,
  computePricePrediction,
  transactionsToCsv,
} from './dvf';
import {
  buildSectorEnvironmentSummary,
  classifyVisibility,
  computeBdTopoVisAVis,
  computeNaturalLuminosityScore,
  computeObstructionAngleForFloor,
  wgs84ToLambert93,
} from './enrichment';

const SAMPLE_HEADER =
  'id_mutation,date_mutation,numero_disposition,nature_mutation,valeur_fonciere,adresse_numero,adresse_suffixe,adresse_nom_voie,adresse_code_voie,code_postal,code_commune,nom_commune,code_departement,ancien_code_commune,ancien_nom_commune,id_parcelle,ancien_id_parcelle,numero_volume,lot1_numero,lot1_surface_carrez,lot2_numero,lot2_surface_carrez,lot3_numero,lot3_surface_carrez,lot4_numero,lot4_surface_carrez,lot5_numero,lot5_surface_carrez,nombre_lots,code_type_local,type_local,surface_reelle_bati,nombre_pieces_principales,code_nature_culture,nature_culture,code_nature_culture_speciale,nature_culture_speciale,surface_terrain,longitude,latitude';

test('haversineDistanceMeters computes accurate micro-distances around 70 rue Olivier de Serres', () => {
  const centerLat = 48.833676;
  const centerLon = 2.294779;

  assert.equal(Math.round(haversineDistanceMeters(centerLat, centerLon, centerLat, centerLon)), 0);

  // ~111 meters north
  const north = haversineDistanceMeters(centerLat, centerLon, centerLat + 0.001, centerLon);
  assert.ok(north > 105 && north < 118, `Expected ~111m, got ${north}`);

  // ~350 meters away (outside 200m radius)
  const far = haversineDistanceMeters(centerLat, centerLon, centerLat + 0.0032, centerLon);
  assert.ok(far > 340 && far < 370, `Expected ~355m, got ${far}`);
});

test('parseGeoDvfCsv and aggregateAndFilterDvfRows filter by room count, surface 35-45m2, radius 200m, and detect block sales', () => {
  const csv = [
    SAMPLE_HEADER,
    // 1. Valid 2-piece 40m2 with a cave (Dépendance) at ~40m
    '2024-001,2024-05-14,000001,Vente,420000,66,,RUE OLIVIER DE SERRES,6889,75015,75115,Paris 15e Arrondissement,75,,,75115000BL0012,,,14,39.5,,,,,,,,,2,2,Appartement,40,2,,,,,,2.2951,48.8339',
    '2024-001,2024-05-14,000001,Vente,420000,66,,RUE OLIVIER DE SERRES,6889,75015,75115,Paris 15e Arrondissement,75,,,75115000BL0012,,,42,,,,,,,,,,2,3,Dépendance,,0,,,,,,2.2951,48.8339',
    // 2. Valid Studio (1P) 35m2 (boundary inclusive) at ~120m
    '2023-002,2023-11-02,000001,Vente,350000,12,,RUE DE DANTZIG,2560,75015,75115,Paris 15e Arrondissement,75,,,75115000BM0008,,,5,35.2,,,,,,,,,1,2,Appartement,35,1,,,,,,2.2960,48.8342',
    // 3. Excluded: 3 pieces 44m2 (wrong room count)
    '2024-003,2024-02-10,000001,Vente,480000,72,,RUE OLIVIER DE SERRES,6889,75015,75115,Paris 15e Arrondissement,75,,,75115000BL0015,,,8,,,,,,,,,,1,2,Appartement,44,3,,,,,,2.2948,48.8337',
    // 4. Excluded: 2 pieces 46m2 (above 45m2)
    '2024-004,2024-03-20,000001,Vente,500000,68,,RUE OLIVIER DE SERRES,6889,75015,75115,Paris 15e Arrondissement,75,,,75115000BL0013,,,3,,,,,,,,,,1,2,Appartement,46,2,,,,,,2.2949,48.8337',
    // 5. Excluded: 2 pieces 40m2 but 350m away (outside 200m)
    '2024-005,2024-04-01,000001,Vente,410000,120,,RUE DE LA CONVENTION,2280,75015,75115,Paris 15e Arrondissement,75,,,75115000BK0001,,,9,,,,,,,,,,1,2,Appartement,40,2,,,,,,2.2948,48.8369',
    // 6. Block sale: two apartments in same mutation 2024-006
    '2024-006,2024-06-15,000001,Vente,1800000,70,,RUE OLIVIER DE SERRES,6889,75015,75115,Paris 15e Arrondissement,75,,,75115000BL0014,,,1,,,,,,,,,,2,2,Appartement,42,2,,,,,,2.294779,48.833676',
    '2024-006,2024-06-15,000001,Vente,1800000,70,,RUE OLIVIER DE SERRES,6889,75015,75115,Paris 15e Arrondissement,75,,,75115000BL0014,,,2,,,,,,,,,,2,2,Appartement,38,1,,,,,,2.294779,48.833676',
  ].join('\n');

  const parsed = parseGeoDvfCsv(csv);
  assert.equal(parsed.length, 8);

  const filteredDefault = aggregateAndFilterDvfRows(parsed, {
    centerLat: 48.833676,
    centerLon: 2.294779,
    radiusMeters: 200,
    minSurface: 35,
    maxSurface: 45,
    rooms: [1, 2],
    years: [2021, 2022, 2023, 2024, 2025],
    includeBlockSales: false,
  });

  assert.equal(filteredDefault.excludedBlockSalesCount, 2);
  assert.equal(filteredDefault.transactions.length, 2);
  assert.equal(filteredDefault.transactions[0].idMutation, '2024-001');
  assert.equal(filteredDefault.transactions[0].dependanceCount, 1);
  assert.equal(filteredDefault.transactions[0].pricePerSqm, 10500);
  assert.equal(filteredDefault.transactions[0].surfaceCarrez, 39.5);
  assert.equal(filteredDefault.transactions[1].idMutation, '2023-002');
  assert.equal(filteredDefault.transactions[1].roomLabel, 'Studio (1P)');
  assert.equal(filteredDefault.transactions[1].pricePerSqm, 10000);

  const stats = computeSummaryStats(filteredDefault.transactions);
  assert.equal(stats.count, 2);
  assert.equal(stats.studioCount, 1);
  assert.equal(stats.twoRoomCount, 1);
  assert.equal(stats.medianPricePerSqm, 10250);
  assert.equal(stats.yearlyTrends.length, 2);

  // Including block sales exposes all 4 matching apartment rows
  const withBlocks = aggregateAndFilterDvfRows(parsed, {
    centerLat: 48.833676,
    centerLon: 2.294779,
    radiusMeters: 200,
    minSurface: 35,
    maxSurface: 45,
    rooms: [1, 2],
    years: [2021, 2022, 2023, 2024, 2025],
    includeBlockSales: true,
  });
  assert.equal(withBlocks.transactions.length, 4);
  assert.equal(withBlocks.transactions.filter((t) => t.isBlockSale).length, 2);
});

test('transactionsToCsv formats semicolon-delimited UTF-8 BOM CSV with proper headers', () => {
  const csv = transactionsToCsv([
    {
      id: '2024-001-1',
      idMutation: '2024-001',
      dateMutation: '2024-05-14',
      year: 2024,
      natureMutation: 'Vente',
      valeurFonciere: 420000,
      pricePerSqm: 10500,
      address: '66 RUE OLIVIER DE SERRES',
      streetNumber: '66',
      streetName: 'RUE OLIVIER DE SERRES',
      postalCode: '75015',
      cityCode: '75115',
      cityName: 'Paris 15e Arrondissement',
      parcelId: '75115000BL0012',
      rooms: 2,
      roomLabel: '2 pièces',
      surfaceBati: 40,
      surfaceCarrez: 39.5,
      lotCount: 2,
      dependanceCount: 1,
      isBlockSale: false,
      mainUnitsInMutation: 1,
      latitude: 48.8339,
      longitude: 2.2951,
      distanceMeters: 34,
    },
  ]);
  assert.ok(csv.startsWith('\uFEFFDate mutation;'));
  assert.ok(csv.includes('66 RUE OLIVIER DE SERRES'));
  assert.ok(csv.includes('420000;10500;34'));
});

test('computePriceBrackets buckets transactions cleanly by Studio and 2-piece', () => {
  const mkTx = (id: string, rooms: number, pricePerSqm: number) => ({
    id,
    idMutation: id,
    dateMutation: '2024-06-01',
    year: 2024,
    natureMutation: 'Vente',
    valeurFonciere: pricePerSqm * 40,
    pricePerSqm,
    address: '70 RUE OLIVIER DE SERRES',
    streetNumber: '70',
    streetName: 'RUE OLIVIER DE SERRES',
    postalCode: '75015',
    cityCode: '75115',
    cityName: 'Paris 15e Arrondissement',
    parcelId: '75115000BL0014',
    rooms,
    roomLabel: rooms === 1 ? 'Studio (1P)' : '2 pièces',
    surfaceBati: 40,
    surfaceCarrez: 40,
    lotCount: 1,
    dependanceCount: 0,
    isBlockSale: false,
    mainUnitsInMutation: 1,
    latitude: 48.833676,
    longitude: 2.294779,
    distanceMeters: 0,
  });

  const brackets = computePriceBrackets([
    mkTx('1', 1, 8200),
    mkTx('2', 2, 9400),
    mkTx('3', 2, 9600),
    mkTx('4', 2, 10800),
  ]);
  const totalCounted = brackets.reduce((sum, b) => sum + b.total, 0);
  assert.equal(totalCounted, 4);
  assert.ok(brackets.some((b) => b.studioCount === 1));
  assert.ok(brackets.some((b) => b.twoRoomCount >= 1));
});

test('computeBdTopoVisAVis computes neighbor distance, height, and obstruction angle', () => {
  const features = [
    {
      id: 'subject',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [2.2947, 48.8336],
            [2.29485, 48.8336],
            [2.29485, 48.83375],
            [2.2947, 48.83375],
            [2.2947, 48.8336],
          ],
        ],
      },
      properties: {
        hauteur: 21,
        nombre_d_etages: 7,
        nombre_de_logements: 25,
        materiaux_des_murs: 'PIERRE',
        materiaux_de_la_toiture: 'ZINC',
        altitude_minimale_sol: 52,
        altitude_maximale_toit: 73,
      },
    },
    {
      id: 'neighbor-east',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [2.29505, 48.8336],
            [2.2952, 48.8336],
            [2.2952, 48.83375],
            [2.29505, 48.83375],
            [2.29505, 48.8336],
          ],
        ],
      },
      properties: {
        hauteur: 18,
        nombre_d_etages: 6,
      },
    },
  ];

  const info = computeBdTopoVisAVis(features, 48.833676, 2.294779);
  assert.equal(info.subjectHeightM, 21);
  assert.equal(info.subjectFloors, 7);
  assert.equal(info.neighborCount60m, 1);
  assert.ok(info.closestNeighborDistanceM !== null && info.closestNeighborDistanceM >= 10 && info.closestNeighborDistanceM <= 25);
  assert.equal(info.closestNeighborHeightM, 18);
  assert.ok(info.maxObstructionAngleDeg !== null && info.maxObstructionAngleDeg > 15);
  assert.equal(info.nearestNeighbors[0].direction, 'E');
  // East neighbor is ~14.7 m away (> 14 m Parisian threshold -> 'degage')
  assert.equal(info.visibilityCategory, classifyVisibility(info.principalVisAVisDistanceM));

  const lum = computeNaturalLuminosityScore(info);
  assert.ok(lum.score >= 10 && lum.score <= 98);
});

test('computeBdTopoVisAVis excludes touching mitoyen buildings from facing vis-a-vis', () => {
  const features = [
    {
      id: 'subject',
      geometry: {
        type: 'Polygon',
        coordinates: [[[2.2947, 48.8336], [2.29485, 48.8336], [2.29485, 48.83375], [2.2947, 48.83375], [2.2947, 48.8336]]],
      },
      properties: { hauteur: 20, nombre_d_etages: 6 },
    },
    {
      id: 'mitoyen-west',
      geometry: {
        type: 'Polygon',
        coordinates: [[[2.29455, 48.8336], [2.2947, 48.8336], [2.2947, 48.83375], [2.29455, 48.83375], [2.29455, 48.8336]]],
      },
      properties: { hauteur: 20, nombre_d_etages: 6 },
    },
    {
      id: 'facing-far',
      geometry: {
        type: 'Polygon',
        coordinates: [[[2.2952, 48.8336], [2.29535, 48.8336], [2.29535, 48.83375], [2.2952, 48.83375], [2.2952, 48.8336]]],
      },
      properties: { hauteur: 15, nombre_d_etages: 5 },
    },
  ];
  const info = computeBdTopoVisAVis(features, 48.833676, 2.294779);
  assert.equal(info.adjoiningCount, 1);
  assert.equal(info.neighborCount60m, 1);
  assert.ok((info.closestNeighborDistanceM ?? 0) > 20);
  assert.equal(info.visibilityCategory, 'degage');
});

test('computeSurfaceBands and computePricePrediction produce valid bands and projections', () => {
  const mk = (id: string, surfaceBati: number, pricePerSqm: number, year = 2024) => ({
    id,
    idMutation: id,
    dateMutation: `${year}-05-01`,
    year,
    natureMutation: 'Vente',
    valeurFonciere: pricePerSqm * surfaceBati,
    pricePerSqm,
    address: '70 RUE OLIVIER DE SERRES',
    streetNumber: '70',
    streetName: 'RUE OLIVIER DE SERRES',
    postalCode: '75015',
    cityCode: '75115',
    cityName: 'Paris 15e Arrondissement',
    parcelId: '75115000BL0014',
    rooms: 2,
    roomLabel: '2 pièces',
    surfaceBati,
    surfaceCarrez: surfaceBati,
    lotCount: 1,
    dependanceCount: 0,
    isBlockSale: false,
    mainUnitsInMutation: 1,
    latitude: 48.833676,
    longitude: 2.294779,
    distanceMeters: 0,
  });

  const bands = computeSurfaceBands(
    [mk('a', 35, 9000), mk('b', 36, 9400), mk('c', 40, 9800), mk('d', 44, 10200)],
    35,
    45
  );
  assert.ok(bands.length >= 2);
  assert.equal(bands.reduce((s, b) => s + b.count, 0), 4);

  const pred = computePricePrediction([
    { year: 2021, count: 10, medianPricePerSqm: 9600, avgPricePerSqm: 9600, q1PricePerSqm: 9000, q3PricePerSqm: 10100, minPricePerSqm: 8500, maxPricePerSqm: 10500 },
    { year: 2022, count: 12, medianPricePerSqm: 9800, avgPricePerSqm: 9800, q1PricePerSqm: 9200, q3PricePerSqm: 10200, minPricePerSqm: 8700, maxPricePerSqm: 10900 },
    { year: 2023, count: 11, medianPricePerSqm: 9200, avgPricePerSqm: 9200, q1PricePerSqm: 8800, q3PricePerSqm: 9600, minPricePerSqm: 8000, maxPricePerSqm: 10200 },
    { year: 2024, count: 14, medianPricePerSqm: 9500, avgPricePerSqm: 9500, q1PricePerSqm: 8900, q3PricePerSqm: 9900, minPricePerSqm: 7900, maxPricePerSqm: 10600 },
  ]);
  assert.ok(pred !== null);
  assert.equal(pred.projected.length, 2);
  assert.equal(pred.projected[0].year, 2025);
  assert.equal(pred.projected[1].year, 2026);
  assert.ok(pred.projected[0].lowerBound < pred.projected[0].predictedPricePerSqm);
  assert.ok(pred.projected[0].upperBound > pred.projected[0].predictedPricePerSqm);

  const summary = buildSectorEnvironmentSummary([
    {
      id: 'a',
      effectiveVisAVisM: 7.5,
      principalVisAVisM: 7.5,
      closestVisAVisM: 7.5,
      visibilityCategory: 'proche',
      skyOpennessPct: 32,
      subjectHeightM: 20,
      maxObstructionAngleDeg: 70,
      openDirectionsCount: 1,
      vegetationScreensCount: 0,
      luminosity: { score: 34, skyContribution: 18, distanceContribution: 8, exposureContribution: 8, crossLightLabel: 'Mono' },
    },
    {
      id: 'b',
      effectiveVisAVisM: 17.5,
      principalVisAVisM: 23,
      closestVisAVisM: 11,
      visibilityCategory: 'degage',
      skyOpennessPct: 78,
      subjectHeightM: 22,
      maxObstructionAngleDeg: 35,
      openDirectionsCount: 3,
      vegetationScreensCount: 1,
      luminosity: { score: 82, skyContribution: 43, distanceContribution: 23, exposureContribution: 16, crossLightLabel: 'Multi' },
    },
  ]);
  assert.equal(summary.totalAnalyzed, 2);
  assert.equal(summary.visibilityBuckets.find((b) => b.category === 'degage')?.count, 1);
  assert.equal(summary.visibilityBuckets.find((b) => b.category === 'proche')?.count, 1);
});

test('wgs84ToLambert93 projects Paris 15e accurately in meters and floor-aware angles work', () => {
  const [x, y] = wgs84ToLambert93(48.833658, 2.294865);
  assert.ok(Math.abs(x - 648240) < 60, `Expected Lambert-93 X near 648240, got ${x}`);
  assert.ok(Math.abs(y - 6859520) < 60, `Expected Lambert-93 Y near 6859520, got ${y}`);

  // Floor 7: H_appart = 0.5 + 7 * 2.9 = 20.8 m > facing 18 m -> 0 deg (clear above roof)
  assert.equal(computeObstructionAngleForFloor(18, 12, 7), 0);
  // Floor 0 (RDC): H_appart = 0.5 m vs facing 18 m at 12 m -> atan(17.5 / 12) ≈ 56 deg
  const rdcAngle = computeObstructionAngleForFloor(18, 12, 0);
  assert.ok(rdcAngle >= 54 && rdcAngle <= 57, `Expected ~56 deg, got ${rdcAngle}`);

  // Parisian thresholds (< 9 / 9-16 / > 16 m)
  assert.equal(classifyVisibility(8.9), 'proche');
  assert.equal(classifyVisibility(9.0), 'modere');
  assert.equal(classifyVisibility(16.0), 'modere');
  assert.equal(classifyVisibility(16.1), 'degage');
  assert.equal(classifyVisibility(null), 'degage');
});

test('computeBdTopoVisAVis separates open principal street facade from tight courtyard facade', () => {
  // Parisian block building: mitoyens on North & South, tight courtyard ~6m West, open street ~20m East
  const features = [
    {
      id: 'subject',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [2.2947, 48.8336],
            [2.29484, 48.8336],
            [2.29484, 48.83375],
            [2.2947, 48.83375],
            [2.2947, 48.8336],
          ],
        ],
      },
      properties: { hauteur: 21, nombre_d_etages: 7 },
    },
    {
      id: 'mitoyen-north',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [2.2947, 48.83375],
            [2.29484, 48.83375],
            [2.29484, 48.8339],
            [2.2947, 48.8339],
            [2.2947, 48.83375],
          ],
        ],
      },
      properties: { hauteur: 21, nombre_d_etages: 7 },
    },
    {
      id: 'mitoyen-south',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [2.2947, 48.83345],
            [2.29484, 48.83345],
            [2.29484, 48.8336],
            [2.2947, 48.8336],
            [2.2947, 48.83345],
          ],
        ],
      },
      properties: { hauteur: 21, nombre_d_etages: 7 },
    },
    {
      id: 'courtyard-west',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [2.29448, 48.8336],
            [2.29462, 48.8336],
            [2.29462, 48.83375],
            [2.29448, 48.83375],
            [2.29448, 48.8336],
          ],
        ],
      },
      properties: { hauteur: 19, nombre_d_etages: 6 },
    },
    {
      id: 'street-east',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [2.29512, 48.8336],
            [2.29528, 48.8336],
            [2.29528, 48.83375],
            [2.29512, 48.83375],
            [2.29512, 48.8336],
          ],
        ],
      },
      properties: { hauteur: 15, nombre_d_etages: 5 },
    },
  ];

  const info = computeBdTopoVisAVis(features, 48.833675, 2.29477);
  assert.equal(info.adjoiningCount, 2);
  assert.equal(info.facades.length, 2);
  assert.ok(
    info.principalVisAVisDistanceM !== null && info.principalVisAVisDistanceM >= 18,
    `Expected open street principal >= 18m, got ${info.principalVisAVisDistanceM}`
  );
  assert.ok(
    info.closestNeighborDistanceM !== null && info.closestNeighborDistanceM <= 7,
    `Expected courtyard <= 7m, got ${info.closestNeighborDistanceM}`
  );
  // Weighted exposure blends ~21m open street and ~6m courtyard -> ~13-14m (modere)
  assert.ok(
    info.effectiveVisAVisDistanceM !== null &&
      info.effectiveVisAVisDistanceM >= 10 &&
      info.effectiveVisAVisDistanceM <= 16,
    `Expected weighted effective distance in 10..16m, got ${info.effectiveVisAVisDistanceM}`
  );
  assert.equal(info.visibilityCategory, 'modere');
});

test('computeBdTopoVisAVis sanitizes ANFR 70m antenna heights, skips h=0 overhang annexes, and raycasts interior courtyard holes', () => {
  // Hollow courtyard MultiPolygon building (outer ~28m x 22m, interior courtyard ~8m x 8m)
  // Plus a 0m entrance canopy overlapping the target point, and an ANFR:650231 neighbor with height=70.1m without floors
  const features = [
    {
      id: 'annex-zero',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [2.29472, 48.83362],
            [2.29482, 48.83362],
            [2.29482, 48.8337],
            [2.29472, 48.8337],
            [2.29472, 48.83362],
          ],
        ],
      },
      properties: { hauteur: 0, nombre_d_etages: null },
    },
    {
      id: 'hollow-subject',
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            // Outer ring (~26m x 24m)
            [
              [2.2946, 48.83355],
              [2.29495, 48.83355],
              [2.29495, 48.83377],
              [2.2946, 48.83377],
              [2.2946, 48.83355],
            ],
            // Interior courtyard hole (~8m x 8m)
            [
              [2.29472, 48.83362],
              [2.29483, 48.83362],
              [2.29483, 48.8337],
              [2.29472, 48.8337],
              [2.29472, 48.83362],
            ],
          ],
        ],
      },
      properties: { hauteur: 21, nombre_d_etages: 7 },
    },
    {
      id: 'anfr-neighbor-east',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [2.29515, 48.83355],
            [2.29535, 48.83355],
            [2.29535, 48.83377],
            [2.29515, 48.83377],
            [2.29515, 48.83355],
          ],
        ],
      },
      properties: {
        hauteur: 70.1,
        nombre_d_etages: null,
        identifiants_sources: 'ANFR:650231',
      },
    },
  ];

  // Target point sits inside annex-zero (courtyard entrance canopy) & close to hollow-subject
  const info = computeBdTopoVisAVis(features, 48.83366, 2.29477);
  assert.equal(info.subjectHeightM, 21, 'Must pick hollow-subject (21m) instead of 0m annex');
  assert.ok(
    info.closestNeighborDistanceM !== null && info.closestNeighborDistanceM <= 10,
    `Interior courtyard self-intersection (~8-9m) must be detected, got ${info.closestNeighborDistanceM}`
  );
  const eastFacade = info.facades.find((f) => f.direction === 'E' && !f.isCourtyard);
  assert.ok(eastFacade, 'Exterior East facade should exist');
  assert.equal(
    eastFacade?.facingHeightM,
    21,
    `ANFR 70.1m without floor count should be clamped to 21m, got ${eastFacade?.facingHeightM}`
  );
});
