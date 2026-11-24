import { ExternalLink, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { DvfTransaction } from '../lib/dvf';
import {
  classifyVisibility,
  computeObstructionAngleForFloor,
  type FacadeRayMask,
  type PropertyEnrichmentResult,
  type SectorEnvironmentSummary,
} from '../lib/enrichment';
import { formatDateFr, formatEuros, formatPricePerSqm, formatSurface } from '../utils/format';

interface DvfDetailDrawerProps {
  transaction: DvfTransaction | null;
  allTransactions: DvfTransaction[];
  sectorMedianPricePerSqm: number | null;
  environmentSummary?: SectorEnvironmentSummary | null;
  centerLabel: string;
  onSelectComparable: (tx: DvfTransaction) => void;
  onClose: () => void;
}

type DrawerTab = 'synthese' | 'immeuble' | '3d_solaire' | 'cadastre';

const DPE_COLOR: Record<string, { bg: string; text: string }> = {
  A: { bg: '#15803D', text: '#FFFFFF' },
  B: { bg: '#22C55E', text: '#FFFFFF' },
  C: { bg: '#84CC16', text: '#0F172A' },
  D: { bg: '#FACC15', text: '#0F172A' },
  E: { bg: '#F97316', text: '#FFFFFF' },
  F: { bg: '#EA580C', text: '#FFFFFF' },
  G: { bg: '#DC2626', text: '#FFFFFF' },
};

function DpeGradeBox({ letter }: { letter: string }) {
  const clean = letter?.toUpperCase().trim() || '—';
  const style = DPE_COLOR[clean] ?? { bg: '#E2E8F0', text: '#334155' };
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold font-mono shrink-0"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {clean}
    </span>
  );
}

export function DvfDetailDrawer({
  transaction,
  allTransactions,
  sectorMedianPricePerSqm,
  environmentSummary,
  centerLabel,
  onSelectComparable,
  onClose,
}: DvfDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>('synthese');
  const [enrichment, setEnrichment] = useState<PropertyEnrichmentResult | null>(null);
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [selectedFacadeDir, setSelectedFacadeDir] = useState<string | null>(null);

  useEffect(() => {
    setSelectedFloor(null);
    setSelectedFacadeDir(null);
  }, [transaction?.id]);

  useEffect(() => {
    if (!transaction) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [transaction, onClose]);

  useEffect(() => {
    if (!transaction) {
      setEnrichment(null);
      return;
    }

    let cancelled = false;
    setEnrichLoading(true);
    setEnrichError(null);

    const qs = new URLSearchParams({
      lat: String(transaction.latitude),
      lon: String(transaction.longitude),
      address: transaction.address,
      postalCode: transaction.postalCode,
      cityCode: transaction.cityCode,
      parcelId: transaction.parcelId,
      surfaceBati: String(transaction.surfaceBati),
    });

    fetch(`/api/property/enrich?${qs.toString()}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        return json as PropertyEnrichmentResult;
      })
      .then((data) => {
        if (!cancelled) setEnrichment(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setEnrichError(err instanceof Error ? err.message : 'Erreur d’enrichissement');
        }
      })
      .finally(() => {
        if (!cancelled) setEnrichLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [transaction]);

  const sameBuildingSales = useMemo(() => {
    if (!transaction) return [];
    return allTransactions.filter(
      (t) =>
        t.id !== transaction.id &&
        ((transaction.parcelId && t.parcelId === transaction.parcelId) ||
          (t.streetNumber === transaction.streetNumber && t.streetName === transaction.streetName))
    );
  }, [transaction, allTransactions]);

  const bdnb = enrichment?.bdnb ?? null;
  const bdTopo = enrichment?.bdTopo ?? null;
  const lidar = enrichment?.lidarAlti ?? null;
  const cadastre = enrichment?.cadastre ?? null;
  const solar = enrichment?.solar ?? null;
  const meteo = enrichment?.meteoFrance ?? null;
  const osm = enrichment?.osm ?? null;

  const cleanMaterial = (val: string | null | undefined): string | null => {
    if (!val) return null;
    const up = val.trim().toUpperCase();
    if (!up || up === 'INDETERMINE' || up === '00' || up === 'NON RENSEIGNE') return null;
    return val.trim();
  };

  const subjectHeight = bdTopo?.subjectHeightM ?? bdnb?.meanHeightM ?? 18;
  const subjectFloors =
    bdTopo?.subjectFloors ?? bdnb?.floors ?? Math.max(2, Math.round(subjectHeight / 2.9));
  const maxSimFloor = Math.max(1, Math.min(12, Math.round(subjectFloors) - 1));
  const dpeRecords = enrichment?.ademeDpe?.records ?? [];
  const matchedDpeWithFloor =
    dpeRecords.find((r) => r.likelyMatch && r.floorNumber !== null) ??
    dpeRecords.find((r) => r.floorNumber !== null) ??
    null;
  const defaultFloor =
    matchedDpeWithFloor?.floorNumber !== null && matchedDpeWithFloor?.floorNumber !== undefined
      ? Math.max(0, Math.min(maxSimFloor, matchedDpeWithFloor.floorNumber))
      : Math.floor(Math.round(subjectFloors) / 2);
  const evalFloor =
    selectedFloor !== null ? Math.max(0, Math.min(maxSimFloor, selectedFloor)) : defaultFloor;
  const hAppart = Math.round((0.5 + evalFloor * 2.9) * 10) / 10;

  const getFacadeKey = (f: FacadeRayMask) => `${f.direction}${f.isCourtyard ? '-cour' : ''}`;
  const activeFacade: FacadeRayMask | null =
    bdTopo && bdTopo.facades.length > 0
      ? bdTopo.facades.find((f) => getFacadeKey(f) === selectedFacadeDir) ?? bdTopo.facades[0]
      : null;
  const activeDist = activeFacade ? activeFacade.distanceM : bdTopo?.principalVisAVisDistanceM ?? null;
  const activeFacingH = activeFacade
    ? activeFacade.facingHeightM
    : bdTopo?.principalFacingHeightM ?? null;
  const activeFacingFloors = activeFacade?.facingFloors ?? null;
  const activeDir = activeFacade?.direction ?? bdTopo?.principalDirection ?? null;
  const activeVeg = activeFacade?.vegetationScreen ?? null;
  const activeGroundDelta = activeFacade?.groundDeltaM ?? 0;

  const floorSkyOpennessPct = useMemo(() => {
    if (!bdTopo) return null;
    const major = bdTopo.facades.filter((f) => f.facadeLengthM >= 2.5);
    const pool = major.length > 0 ? major : bdTopo.facades;
    if (pool.length === 0) return bdTopo.skyOpennessPct;
    const totalW = pool.reduce((s, f) => s + f.facadeLengthM, 0);
    if (totalW <= 0) return bdTopo.skyOpennessPct;
    const weightedSky = pool.reduce((s, f) => {
      if (f.distanceM === null || f.facingHeightM === null) return s + 94 * f.facadeLengthM;
      const angle = computeObstructionAngleForFloor(
        f.facingHeightM,
        f.distanceM,
        evalFloor,
        f.groundDeltaM ?? 0
      );
      const score = Math.max(14, Math.min(94, Math.round((1 - angle / 90) * 100)));
      return s + score * f.facadeLengthM;
    }, 0);
    return Math.round(weightedSky / totalW);
  }, [bdTopo, evalFloor]);

  if (!transaction) return null;

  const deltaVsMedianPct =
    sectorMedianPricePerSqm && sectorMedianPricePerSqm > 0
      ? Math.round(((transaction.pricePerSqm - sectorMedianPricePerSqm) / sectorMedianPricePerSqm) * 100)
      : null;

  const osmUrl = `https://www.openstreetmap.org/?mlat=${transaction.latitude}&mlon=${transaction.longitude}#map=19/${transaction.latitude}/${transaction.longitude}`;
  const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${transaction.latitude},${transaction.longitude}`;
  const streetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${transaction.latitude},${transaction.longitude}`;
  const geoportailUrl = `https://www.geoportail.gouv.fr/carte?c=${transaction.longitude},${transaction.latitude}&z=19&l0=CADASTRALPARCELS.PARCELLAIRE_EXPRESS::GEOPORTAIL:OGC:WMTS(1)&permalink=yes`;

  const isVefa = transaction.natureMutation.toLowerCase().includes('futur');
  const luminosity =
    enrichment?.luminosity ??
    environmentSummary?.byTransactionId[transaction.id]?.luminosity ??
    null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex justify-end bg-slate-900/30"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
      onClick={onClose}
    >
      <aside
        className="w-full max-w-2xl bg-white h-full border-l border-slate-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4 bg-white">
          <div className="min-w-0">
            <p className="text-xs font-mono text-slate-500">
              Mutation {transaction.idMutation} · {formatDateFr(transaction.dateMutation)} ·{' '}
              {transaction.roomLabel} · {formatSurface(transaction.surfaceBati)}
            </p>
            <h3 id="drawer-title" className="text-lg font-bold text-slate-900 mt-0.5 truncate">
              {transaction.address}
            </h3>
            <p className="text-xs text-slate-500">
              {transaction.postalCode} {transaction.cityName} · À {transaction.distanceMeters} m de{' '}
              {centerLabel.split(',')[0]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fiche de transaction"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Key Price Valuation Strip */}
        <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 grid grid-cols-3 gap-4">
          <div>
            <div className="text-[11px] text-slate-500">Valeur foncière</div>
            <div className="text-base sm:text-lg font-bold font-mono tabular-nums text-slate-900 whitespace-nowrap">
              {formatEuros(transaction.valeurFonciere)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Prix au m² bâti</div>
            <div className="text-base sm:text-lg font-bold font-mono tabular-nums text-[#1D4ED8] whitespace-nowrap">
              {formatPricePerSqm(transaction.pricePerSqm)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Écart vs médiane secteur</div>
            <div
              className={`text-base sm:text-lg font-bold font-mono tabular-nums whitespace-nowrap ${
                deltaVsMedianPct === null
                  ? 'text-slate-700'
                  : deltaVsMedianPct > 5
                  ? 'text-[#0F766E]'
                  : deltaVsMedianPct < -5
                  ? 'text-amber-700'
                  : 'text-slate-800'
              }`}
            >
              {deltaVsMedianPct === null
                ? '—'
                : `${deltaVsMedianPct > 0 ? '+' : ''}${deltaVsMedianPct} %`}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div
          className="px-6 pt-2 border-b border-slate-200 flex items-center gap-5 overflow-x-auto bg-white"
          role="tablist"
          aria-label="Sections de la fiche technique"
        >
          {[
            { id: 'synthese', label: 'Synthèse & DVF' },
            { id: 'immeuble', label: 'Immeuble & DPE' },
            { id: '3d_solaire', label: '3D, Vis-à-vis & Solaire' },
            { id: 'cadastre', label: 'Cadastre & Quartier' },
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id as DrawerTab)}
                className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-[#1D4ED8] text-[#1D4ED8]'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {transaction.isBlockSale && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900">
              <strong>Vente en bloc détectée :</strong> cette mutation regroupe{' '}
              {transaction.mainUnitsInMutation} lots principaux pour une valeur foncière globale de{' '}
              {formatEuros(transaction.valeurFonciere)}.
            </div>
          )}

          {enrichError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-800">
              Certaines sources externes n’ont pas répondu ({enrichError}).
            </div>
          )}

          {/* TAB 1: SYNTHESE & DVF */}
          {activeTab === 'synthese' && (
            <div className="space-y-6">
              <div>
                <h4 className="text-xs font-semibold text-slate-900 mb-2">
                  Caractéristiques de la transaction (DVF — DGFiP)
                </h4>
                <dl className="divide-y divide-slate-100 text-sm border border-slate-200 rounded-md px-4">
                  <div className="py-2.5 flex items-center justify-between gap-4">
                    <dt className="text-slate-500">Nature de mutation</dt>
                    <dd className="font-medium text-slate-900">
                      {transaction.natureMutation}
                      {isVefa && (
                        <span className="ml-2 text-xs font-semibold text-[#0F766E]">
                          · VEFA (vente sur plan)
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="py-2.5 flex items-center justify-between gap-4">
                    <dt className="text-slate-500">Étage identifié (ADEME DPE / BDNB)</dt>
                    <dd className="font-mono tabular-nums font-medium text-slate-900">
                      {matchedDpeWithFloor && matchedDpeWithFloor.floorNumber !== null
                        ? `${matchedDpeWithFloor.floorNumber === 0 ? 'RDC' : `${matchedDpeWithFloor.floorNumber}e étage`} (${
                            matchedDpeWithFloor.likelyMatch ? 'DPE apparié' : 'DPE immeuble'
                          })`
                        : subjectFloors
                        ? `Non renseigné (immeuble ${subjectFloors} niveaux)`
                        : 'Non renseigné'}
                    </dd>
                  </div>
                  <div className="py-2.5 flex items-center justify-between gap-4">
                    <div>
                      <dt className="text-slate-500">Surface réelle bâtie</dt>
                      {transaction.surfaceCarrez !== null &&
                        Math.abs(transaction.surfaceCarrez - transaction.surfaceBati) > 0.5 && (
                          <div className="text-[10px] text-slate-400">
                            Surface fiscale DGFiP (hors annexes / loggias)
                          </div>
                        )}
                    </div>
                    <dd className="font-mono tabular-nums font-medium text-slate-900">
                      {formatSurface(transaction.surfaceBati)}
                    </dd>
                  </div>
                  <div className="py-2.5 flex items-center justify-between gap-4">
                    <dt className="text-slate-500">Surface Loi Carrez (lot 1)</dt>
                    <dd className="font-mono tabular-nums font-medium text-slate-900">
                      {transaction.surfaceCarrez !== null
                        ? formatSurface(transaction.surfaceCarrez)
                        : 'Non renseignée'}
                    </dd>
                  </div>
                  <div className="py-2.5 flex items-center justify-between gap-4">
                    <dt className="text-slate-500">Dépendances dans l’acte</dt>
                    <dd className="font-mono tabular-nums text-slate-900">
                      {transaction.dependanceCount > 0
                        ? `${transaction.dependanceCount} (cave / parking)`
                        : 'Aucune'}
                    </dd>
                  </div>
                  <div className="py-2.5 flex items-center justify-between gap-4">
                    <dt className="text-slate-500">Nombre total de lots vendus</dt>
                    <dd className="font-mono tabular-nums text-slate-900">{transaction.lotCount}</dd>
                  </div>
                  <div className="py-2.5 flex items-center justify-between gap-4">
                    <dt className="text-slate-500">Parcelle cadastrale</dt>
                    <dd className="font-mono tabular-nums text-slate-900">
                      {transaction.parcelId || '—'}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Same building DVF comparables */}
              <div>
                <h4 className="text-xs font-semibold text-slate-900 mb-2">
                  Autres ventes DVF dans le même immeuble / parcelle ({sameBuildingSales.length})
                </h4>
                {sameBuildingSales.length === 0 ? (
                  <p className="text-xs text-slate-500 border border-slate-200 rounded-md p-3">
                    Aucune autre vente studio/2P (35–45 m²) enregistrée sur cette même parcelle sur la période.
                  </p>
                ) : (
                  <div className="border border-slate-200 rounded-md divide-y divide-slate-100">
                    {sameBuildingSales.map((comp) => (
                      <button
                        key={comp.id}
                        type="button"
                        onClick={() => onSelectComparable(comp)}
                        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 transition-colors"
                      >
                        <div>
                          <div className="text-xs font-semibold text-slate-900">
                            {formatDateFr(comp.dateMutation)} · {comp.roomLabel} ·{' '}
                            {formatSurface(comp.surfaceBati)}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            Mutation {comp.idMutation}
                            {comp.dependanceCount > 0 ? ` · +${comp.dependanceCount} annexe` : ''}
                          </div>
                        </div>
                        <div className="text-right font-mono tabular-nums">
                          <div className="text-xs font-bold text-slate-900">
                            {formatEuros(comp.valeurFonciere)}
                          </div>
                          <div className="text-[11px] text-[#1D4ED8] font-semibold">
                            {formatPricePerSqm(comp.pricePerSqm)}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 9 Open-data sources summary */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-slate-900">
                    Croisement des 9 bases publiques Open Data
                  </h4>
                  {enrichLoading && (
                    <span className="text-[11px] text-[#1D4ED8] font-medium">
                      Interrogation des bases…
                    </span>
                  )}
                </div>

                {enrichLoading && !enrichment ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-14 bg-slate-100 rounded-md animate-pulse" />
                    ))}
                  </div>
                ) : enrichment ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {enrichment.sources.map((src) => (
                      <div
                        key={src.id}
                        className="p-3 border border-slate-200 rounded-md bg-white flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-900">{src.name}</span>
                          <span
                            className={`text-[11px] font-medium ${
                              src.available ? 'text-[#0F766E]' : 'text-slate-400'
                            }`}
                          >
                            {src.available ? 'Données extraites' : 'Non couvert'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          {src.producer} · {src.note}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* TAB 2: IMMEUBLE (BDNB) & ENERGIE (ADEME DPE) */}
          {activeTab === 'immeuble' && (
            <div className="space-y-6">
              {enrichLoading && !enrichment ? (
                <div className="space-y-3">
                  <div className="h-32 bg-slate-100 rounded-md animate-pulse" />
                  <div className="h-40 bg-slate-100 rounded-md animate-pulse" />
                </div>
              ) : (
                <>
                  {/* BDNB Building Sheet */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 mb-2">
                      Fiche technique de l’immeuble (BDNB — CSTB)
                    </h4>
                    {!bdnb && !bdTopo ? (
                      <p className="text-xs text-slate-500 border border-slate-200 rounded-md p-3">
                        Aucun bâtiment apparié dans la BDNB ni dans IGN BD TOPO pour cette adresse BAN ({enrichment?.banId ?? 'inconnue'}).
                      </p>
                    ) : !bdnb && bdTopo ? (
                      <dl className="divide-y divide-slate-100 text-xs border border-slate-200 rounded-md px-4">
                        <div className="py-2 flex justify-between gap-4">
                          <dt className="text-slate-500">Appariement BDNB</dt>
                          <dd className="text-slate-600 text-right">Non apparié · Gabarit issu d’IGN BD TOPO</dd>
                        </div>
                        <div className="py-2 flex justify-between gap-4">
                          <dt className="text-slate-500">Matériaux IGN (Murs / Toiture)</dt>
                          <dd className="font-medium text-slate-900 text-right">
                            {[bdTopo.subjectWallMaterial, bdTopo.subjectRoofMaterial].filter(Boolean).join(' / ') || '—'}
                          </dd>
                        </div>
                        <div className="py-2 flex justify-between gap-4">
                          <dt className="text-slate-500">Gabarit 3D (IGN BD TOPO)</dt>
                          <dd className="font-mono text-slate-900">
                            {bdTopo.subjectFloors ? `${bdTopo.subjectFloors} niveaux` : '—'}
                            {bdTopo.subjectDwellings ? ` · ${bdTopo.subjectDwellings} logements` : ''}
                            {bdTopo.subjectHeightM ? ` · H = ${bdTopo.subjectHeightM} m` : ''}
                          </dd>
                        </div>
                      </dl>
                    ) : bdnb ? (
                      <div className="space-y-4">
                        <dl className="divide-y divide-slate-100 text-xs border border-slate-200 rounded-md px-4">
                          <div className="py-2 flex justify-between gap-4">
                            <dt className="text-slate-500">Année de construction</dt>
                            <dd className="font-mono font-semibold text-slate-900">
                              {bdnb.constructionYear ?? 'Non renseignée'}
                            </dd>
                          </div>
                          <div className="py-2 flex justify-between gap-4">
                            <dt className="text-slate-500">Matériaux (Murs / Toiture)</dt>
                            <dd className="font-medium text-slate-900 text-right">
                              {(() => {
                                const w =
                                  cleanMaterial(bdnb.wallMaterial) ??
                                  (bdTopo?.subjectWallMaterial ? `${bdTopo.subjectWallMaterial} (IGN)` : null);
                                const r =
                                  cleanMaterial(bdnb.roofMaterial) ??
                                  (bdTopo?.subjectRoofMaterial ? `${bdTopo.subjectRoofMaterial} (IGN)` : null);
                                return [w, r].filter(Boolean).join(' / ') || '—';
                              })()}
                            </dd>
                          </div>
                          <div className="py-2 flex justify-between gap-4">
                            <dt className="text-slate-500">Gabarit & Copropriété</dt>
                            <dd className="font-mono text-slate-900">
                              {(bdnb.floors ?? bdTopo?.subjectFloors)
                                ? `${bdnb.floors ?? bdTopo?.subjectFloors} niveaux`
                                : '—'}{' '}
                              ·{' '}
                              {(bdnb.dwellingsCount ?? bdTopo?.subjectDwellings)
                                ? `${bdnb.dwellingsCount ?? bdTopo?.subjectDwellings} logements`
                                : '—'}
                              {(bdnb.meanHeightM ?? bdTopo?.subjectHeightM)
                                ? ` · H = ${bdnb.meanHeightM ?? bdTopo?.subjectHeightM} m`
                                : ''}
                            </dd>
                          </div>
                          <div className="py-2 flex justify-between gap-4">
                            <dt className="text-slate-500">Orientation & Traversant</dt>
                            <dd className="font-medium text-slate-900 text-right">
                              {(() => {
                                if (bdnb.traversing) {
                                  const t = bdnb.traversing.trim();
                                  if (t.toLowerCase().includes('traversant')) {
                                    return t.charAt(0).toUpperCase() + t.slice(1);
                                  }
                                  return `Traversant (${t})`;
                                }
                                if (bdnb.windowOrientations.length > 0) {
                                  return bdnb.windowOrientations.join(', ');
                                }
                                return luminosity?.crossLightLabel ?? 'Non renseignée';
                              })()}
                            </dd>
                          </div>
                          <div className="py-2 flex justify-between gap-4">
                            <dt className="text-slate-500">Surface vitrée & Facteur solaire</dt>
                            <dd className="font-mono text-slate-900">
                              {bdnb.windowRatioPct !== null ? `${bdnb.windowRatioPct} % façade` : '—'}
                              {bdnb.solarFactor !== null ? ` · Sw ${bdnb.solarFactor}` : ''}
                            </dd>
                          </div>
                          <div className="py-2 flex justify-between gap-4">
                            <dt className="text-slate-500">Vitrage & Menuiseries</dt>
                            <dd className="font-medium text-slate-900 text-right">
                              {[bdnb.glazingType, bdnb.windowFrameMaterial].filter(Boolean).join(' · ') || '—'}
                            </dd>
                          </div>
                          <div className="py-2 flex justify-between gap-4">
                            <dt className="text-slate-500">Chauffage & Isolation murs</dt>
                            <dd className="font-medium text-slate-900 text-right">
                              {[bdnb.heatingEnergy, bdnb.wallInsulation].filter(Boolean).join(' · ') || '—'}
                            </dd>
                          </div>
                          <div className="py-2 flex justify-between gap-4">
                            <dt className="text-slate-500">Présence balcon (DPE réf.)</dt>
                            <dd className="font-medium text-slate-900">
                              {bdnb.hasBalcony === true ? 'Oui' : bdnb.hasBalcony === false ? 'Non signalé' : '—'}
                            </dd>
                          </div>
                        </dl>

                        {/* Building DPE Distribution bar */}
                        {(() => {
                          const total = Object.values(bdnb.dpeDistribution).reduce((a, b) => a + b, 0);
                          if (total === 0) return null;
                          const grades = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
                          return (
                            <div className="border border-slate-200 rounded-md p-3.5">
                              <div className="flex items-center justify-between text-xs mb-2">
                                <span className="font-semibold text-slate-800">
                                  Répartition des DPE dans l’immeuble ({total} diagnostics)
                                </span>
                                {bdnb.dpeClassBuilding && (
                                  <span className="text-slate-500">
                                    DPE représentatif : <strong>{bdnb.dpeClassBuilding}</strong>
                                  </span>
                                )}
                              </div>
                              <div className="flex h-3 w-full rounded overflow-hidden bg-slate-100">
                                {grades.map((g) => {
                                  const count = bdnb.dpeDistribution[g];
                                  if (!count) return null;
                                  return (
                                    <div
                                      key={g}
                                      style={{
                                        width: `${(count / total) * 100}%`,
                                        backgroundColor: DPE_COLOR[g].bg,
                                      }}
                                      title={`Classe ${g} : ${count}`}
                                    />
                                  );
                                })}
                              </div>
                              <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] font-mono text-slate-600">
                                {grades.map((g) =>
                                  bdnb.dpeDistribution[g] > 0 ? (
                                    <span key={g} className="inline-flex items-center gap-1">
                                      <DpeGradeBox letter={g} />
                                      <span>×{bdnb.dpeDistribution[g]}</span>
                                    </span>
                                  ) : null
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    ) : null}
                  </div>

                  {/* ADEME Observatoire des DPE */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 mb-2">
                      Observatoire des DPE à l’adresse (ADEME — {enrichment?.ademeDpe.totalAtAddress ?? 0})
                    </h4>
                    {!enrichment || enrichment.ademeDpe.records.length === 0 ? (
                      <p className="text-xs text-slate-500 border border-slate-200 rounded-md p-3">
                        Aucun DPE public récent (méthode 2021) retrouvé sur cette adresse BAN.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {enrichment.ademeDpe.records.slice(0, 8).map((dpe) => (
                          <div
                            key={dpe.numeroDpe}
                            className={`p-3 border rounded-md text-xs ${
                              dpe.likelyMatch
                                ? 'border-[#1D4ED8] bg-blue-50/40'
                                : 'border-slate-200 bg-white'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <DpeGradeBox letter={dpe.etiquetteDpe} />
                                <DpeGradeBox letter={dpe.etiquetteGes} />
                                <div>
                                  <span className="font-semibold font-mono text-slate-900">
                                    {dpe.surfaceHabitable !== null
                                      ? formatSurface(dpe.surfaceHabitable)
                                      : 'Surface n/c'}
                                  </span>
                                  {dpe.floorNumber !== null && (
                                    <span className="text-slate-600 ml-2">
                                      · Étage {dpe.floorNumber === 0 ? 'RDC' : dpe.floorNumber}
                                    </span>
                                  )}
                                  {dpe.likelyMatch && (
                                    <span className="ml-2 text-[#1D4ED8] font-semibold">
                                      Correspondance surface (±3,5 m²)
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className="font-mono text-[11px] text-slate-500">
                                {formatDateFr(dpe.dateEtablissement)}
                              </span>
                            </div>

                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600 font-mono">
                              <span>
                                Conso : {dpe.consoEpSqm !== null ? `${dpe.consoEpSqm} kWh/m²/an` : '—'}
                              </span>
                              <span>
                                GES : {dpe.emissionGesSqm !== null ? `${dpe.emissionGesSqm} kg CO₂/m²` : '—'}
                              </span>
                              {dpe.energyType && <span className="font-sans">Énergie : {dpe.energyType}</span>}
                              {dpe.envelopeInsulation && (
                                <span className="font-sans">Enveloppe : {dpe.envelopeInsulation}</span>
                              )}
                              {dpe.windowInsulation && (
                                <span className="font-sans">Vitrage : {dpe.windowInsulation}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 3: 3D, VIS-A-VIS & SOLAIRE */}
          {activeTab === '3d_solaire' && (
            <div className="space-y-6">
              {enrichLoading && !enrichment ? (
                <div className="space-y-3">
                  <div className="h-64 bg-slate-100 rounded-md animate-pulse" />
                  <div className="h-32 bg-slate-100 rounded-md animate-pulse" />
                </div>
              ) : (
                <>
                  {/* Architectural SVG Cross-Section: Height, Floors, Facade-by-Facade Vis-a-vis, Vegetation & Sun Angles */}
                  <div className="border border-slate-200 rounded-md p-4 bg-white space-y-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-semibold text-slate-900">
                          Coupe architecturale 3D — Vis-à-vis & ensoleillement (IGN BD TOPO · Lambert-93)
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Lancer de rayons perpendiculaires par façade, écrans végétaux IGN et angle d’obstruction calculé à l’étage ({evalFloor === 0 ? 'RDC' : `${evalFloor}e`} · H = {hAppart} m)
                        </p>
                      </div>
                      {floorSkyOpennessPct !== null && floorSkyOpennessPct !== undefined && (
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold font-mono tabular-nums text-[#0F766E]">
                            {floorSkyOpennessPct} % ciel libre ({evalFloor === 0 ? 'RDC' : `${evalFloor}e`})
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {bdTopo?.openDirectionsCount ?? 0} orient. dégagées
                            {bdTopo?.skyOpennessPct !== null &&
                            bdTopo?.skyOpennessPct !== undefined &&
                            floorSkyOpennessPct !== bdTopo.skyOpennessPct
                              ? ` · moy. imm. ${bdTopo.skyOpennessPct} %`
                              : ''}
                          </div>
                        </div>
                      )}
                    </div>

                    {!bdTopo ? (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 space-y-1">
                        <div className="font-semibold">
                          Contours 3D IGN BD TOPO indisponibles pour cette requête
                        </div>
                        <p className="text-[11px] text-amber-800">
                          Le flux WFS IGN Géoplateforme n’a pas retourné la géométrie 3D de cet îlot. Aucune distance de vis-à-vis n’est extrapolée afin d’éviter toute fausse mesure ; fermez puis rouvrez la fiche ou relancez l’extraction pour interroger à nouveau BD TOPO.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Floor & Facade simulation controls */}
                        <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded text-[11px]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-slate-600 font-medium mr-1">Étage simulé :</span>
                            {Array.from({ length: maxSimFloor + 1 }).map((_, fl) => {
                              const isSel = fl === evalFloor;
                              const isDpe = matchedDpeWithFloor?.floorNumber === fl;
                              return (
                                <button
                                  key={fl}
                                  type="button"
                                  onClick={() => setSelectedFloor(fl)}
                                  title={isDpe ? 'Étage repéré sur DPE ADEME' : undefined}
                                  className={`px-2 py-0.5 rounded font-mono font-semibold border transition-colors ${
                                    isSel
                                      ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                                  }`}
                                >
                                  {fl === 0 ? 'RDC' : `${fl}e`}
                                  {isDpe ? '·DPE' : ''}
                                </button>
                              );
                            })}
                          </div>

                          {bdTopo.facades.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-slate-600 font-medium mr-1">Façade :</span>
                              {bdTopo.facades.map((fac) => {
                                const fKey = getFacadeKey(fac);
                                const isSel = activeFacade ? getFacadeKey(activeFacade) === fKey : false;
                                return (
                                  <button
                                    key={fKey}
                                    type="button"
                                    onClick={() => setSelectedFacadeDir(fKey)}
                                    className={`px-2 py-0.5 rounded font-mono font-semibold border transition-colors ${
                                      isSel
                                        ? 'bg-[#0F766E] text-white border-[#0F766E]'
                                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                                    }`}
                                  >
                                    {fac.direction}
                                    {fac.isCourtyard ? ' (Cour)' : ''} · {fac.distanceM !== null ? `${fac.distanceM}m` : '>100m'}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* 2D Footprint Plan View (IGN BD TOPO Lambert-93 real polygons) */}
                        {bdTopo.planView && bdTopo.planView.buildings.length > 0 && (() => {
                          const pv = bdTopo.planView;
                          const pW = 560;
                          const pH = 216;
                          let maxAbsX = 28;
                          let maxAbsY = 20;
                          const subjPoly = pv.buildings.find((b) => b.isSubject);
                          if (subjPoly) {
                            for (const r of subjPoly.outerRings) {
                              for (const [x, y] of r) {
                                maxAbsX = Math.max(maxAbsX, Math.abs(x) + 18);
                                maxAbsY = Math.max(maxAbsY, Math.abs(y) + 14);
                              }
                            }
                          }
                          for (const ray of pv.rays) {
                            maxAbsX = Math.max(maxAbsX, Math.abs(ray.end[0]) + 10);
                            maxAbsY = Math.max(maxAbsY, Math.abs(ray.end[1]) + 10);
                          }
                          const pxPerMPlan = Math.min(
                            (pW - 44) / Math.max(40, maxAbsX * 2),
                            (pH - 28) / Math.max(28, maxAbsY * 2),
                            4.5
                          );
                          const cxSvg = pW / 2;
                          const cySvg = pH / 2;
                          const toSvgPt = (x: number, y: number): [number, number] => [
                            Math.round((cxSvg + x * pxPerMPlan) * 10) / 10,
                            Math.round((cySvg - y * pxPerMPlan) * 10) / 10,
                          ];
                          const ringsToPath = (
                            outerRings: Array<Array<[number, number]>>,
                            holeRings: Array<Array<[number, number]>>
                          ) => {
                            const segs: string[] = [];
                            for (const ring of [...outerRings, ...holeRings]) {
                              if (ring.length < 3) continue;
                              const pts = ring.map(([x, y], idx) => {
                                const [sx, sy] = toSvgPt(x, y);
                                return `${idx === 0 ? 'M' : 'L'}${sx},${sy}`;
                              });
                              segs.push(`${pts.join(' ')} Z`);
                            }
                            return segs.join(' ');
                          };
                          const scaleBarMeters = pxPerMPlan * 20 <= 110 ? 20 : 10;
                          const scaleBarPx = Math.round(scaleBarMeters * pxPerMPlan * 10) / 10;

                          return (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-[11px] text-slate-600">
                                <span className="font-semibold text-slate-800">
                                  Plan d’implantation 2D réel (emprises IGN BD TOPO · échelle 1:1)
                                </span>
                                <span className="font-mono text-[10px] text-slate-500">
                                  Cliquez sur un axe pour changer de façade
                                </span>
                              </div>
                              <svg
                                viewBox={`0 0 ${pW} ${pH}`}
                                className="w-full h-auto rounded border border-slate-200 bg-slate-50/70"
                                role="img"
                                aria-label="Plan d'implantation 2D réel des bâtiments IGN BD TOPO"
                              >
                                <defs>
                                  <pattern id="planAdjoinHatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                                    <line x1="0" y1="0" x2="0" y2="5" stroke="#94A3B8" strokeWidth="1" strokeOpacity="0.45" />
                                  </pattern>
                                </defs>

                                {/* Metric distance rings */}
                                {[15, 30].map((rm) => (
                                  <circle
                                    key={rm}
                                    cx={cxSvg}
                                    cy={cySvg}
                                    r={rm * pxPerMPlan}
                                    fill="none"
                                    stroke="#CBD5E1"
                                    strokeWidth={0.8}
                                    strokeDasharray="3 3"
                                  />
                                ))}

                                {/* Vegetation polygons */}
                                {pv.vegetation.map((veg, idx) => {
                                  const d = ringsToPath([veg.ring], []);
                                  if (!d) return null;
                                  return (
                                    <path
                                      key={`veg-${idx}`}
                                      d={d}
                                      fill="#22C55E"
                                      fillOpacity={0.22}
                                      stroke="#15803D"
                                      strokeWidth={0.9}
                                    />
                                  );
                                })}

                                {/* Neighbor buildings */}
                                {pv.buildings
                                  .filter((b) => !b.isSubject)
                                  .map((b, idx) => {
                                    const d = ringsToPath(b.outerRings, b.holeRings);
                                    if (!d) return null;
                                    const pts = b.outerRings[0] ?? [];
                                    let sxSum = 0;
                                    let sySum = 0;
                                    for (const [px, py] of pts) {
                                      sxSum += px;
                                      sySum += py;
                                    }
                                    const n = Math.max(1, pts.length);
                                    const [lx, ly] = toSvgPt(sxSum / n, sySum / n);
                                    const isActiveTarget = activeFacade?.facingBuildingId === b.id;
                                    const inViewport = lx > 20 && lx < pW - 20 && ly > 16 && ly < pH - 16;
                                    return (
                                      <g key={`${b.id}-${idx}`}>
                                        <path
                                          d={d}
                                          fillRule="evenodd"
                                          fill={
                                            isActiveTarget
                                              ? '#FDE68A'
                                              : b.isAdjoining
                                              ? 'url(#planAdjoinHatch)'
                                              : '#E2E8F0'
                                          }
                                          fillOpacity={isActiveTarget ? 0.65 : 0.9}
                                          stroke={isActiveTarget ? '#D97706' : b.isAdjoining ? '#94A3B8' : '#64748B'}
                                          strokeWidth={isActiveTarget ? 1.6 : 1}
                                        />
                                        {inViewport && b.heightM >= 4 && Math.hypot(lx - cxSvg, ly - cySvg) >= 18 && (
                                          <text
                                            x={lx}
                                            y={Math.max(14, Math.min(pH - 12, ly + 3))}
                                            textAnchor="middle"
                                            className="fill-slate-700 text-[8px] font-mono font-semibold pointer-events-none"
                                          >
                                            {Math.round(b.heightM)}m
                                          </text>
                                        )}
                                      </g>
                                    );
                                  })}

                                {/* Subject building (with courtyard holes cut out via evenodd) */}
                                {subjPoly && (
                                  <path
                                    d={ringsToPath(subjPoly.outerRings, subjPoly.holeRings)}
                                    fillRule="evenodd"
                                    fill="#DBEAFE"
                                    stroke="#1D4ED8"
                                    strokeWidth={2}
                                  />
                                )}

                                {/* Facade rays & collision-free distance badges */}
                                {(() => {
                                  const placedBadges: Array<{ x: number; y: number }> = [];
                                  const rayDraws = pv.rays.map((ray) => {
                                    const rayKey = `${ray.direction}${ray.isCourtyard ? '-cour' : ''}`;
                                    const isSel = activeFacade ? getFacadeKey(activeFacade) === rayKey : false;
                                    const [sx, sy] = toSvgPt(ray.start[0], ray.start[1]);
                                    const [ex, ey] = toSvgPt(ray.end[0], ray.end[1]);
                                    const tBadge = isSel ? 0.56 : 0.62;
                                    const mx = Math.max(24, Math.min(pW - 24, sx + (ex - sx) * tBadge));
                                    const my = Math.max(14, Math.min(pH - 20, sy + (ey - sy) * tBadge));
                                    return { ray, rayKey, isSel, sx, sy, ex, ey, mx, my };
                                  });
                                  const badgeKeys = new Set<string>();
                                  const prioritized = [...rayDraws].sort((a, b) => {
                                    if (a.isSel !== b.isSel) return a.isSel ? -1 : 1;
                                    if (a.ray.isCourtyard !== b.ray.isCourtyard) return a.ray.isCourtyard ? 1 : -1;
                                    return (b.ray.distanceM ?? 99) - (a.ray.distanceM ?? 99);
                                  });
                                  for (const item of prioritized) {
                                    const eligible =
                                      item.isSel ||
                                      (!item.ray.isCourtyard &&
                                        item.ray.distanceM !== null &&
                                        item.ray.distanceM <= 35);
                                    if (!eligible) continue;
                                    const collides = placedBadges.some(
                                      (p) => Math.abs(p.x - item.mx) < 40 && Math.abs(p.y - item.my) < 17
                                    );
                                    if (!collides || item.isSel) {
                                      badgeKeys.add(item.rayKey);
                                      placedBadges.push({ x: item.mx, y: item.my });
                                    }
                                  }

                                  return (
                                    <>
                                      {rayDraws.map(({ rayKey, isSel, sx, sy, ex, ey }) => (
                                        <g
                                          key={`ray-line-${rayKey}`}
                                          className="cursor-pointer"
                                          onClick={() => setSelectedFacadeDir(rayKey)}
                                        >
                                          <line
                                            x1={sx}
                                            y1={sy}
                                            x2={ex}
                                            y2={ey}
                                            stroke={isSel ? '#0F766E' : '#94A3B8'}
                                            strokeWidth={isSel ? 2.2 : 1.1}
                                            strokeDasharray={isSel ? undefined : '3 2'}
                                          />
                                          <circle cx={ex} cy={ey} r={isSel ? 3 : 2} fill={isSel ? '#0F766E' : '#64748B'} />
                                        </g>
                                      ))}
                                      {rayDraws
                                        .filter((item) => badgeKeys.has(item.rayKey))
                                        .map(({ ray, rayKey, isSel, mx, my }) => (
                                          <g
                                            key={`ray-badge-${rayKey}`}
                                            className="cursor-pointer"
                                            onClick={() => setSelectedFacadeDir(rayKey)}
                                          >
                                            <rect
                                              x={mx - 19}
                                              y={my - 8}
                                              width={38}
                                              height={15}
                                              rx={3}
                                              fill="#FFFFFF"
                                              fillOpacity={0.95}
                                              stroke={isSel ? '#0F766E' : '#CBD5E1'}
                                              strokeWidth={isSel ? 1.2 : 0.8}
                                            />
                                            <text
                                              x={mx}
                                              y={my + 3}
                                              textAnchor="middle"
                                              className={`text-[8.5px] font-mono font-bold ${
                                                isSel ? 'fill-[#0F766E]' : 'fill-slate-700'
                                              }`}
                                            >
                                              {ray.distanceM !== null ? `${ray.distanceM}m` : '>45m'}
                                            </text>
                                          </g>
                                        ))}
                                    </>
                                  );
                                })()}

                                {/* Compass Rose (North UP) */}
                                <g transform={`translate(${pW - 26}, 26)`}>
                                  <circle cx={0} cy={0} r={14} fill="#FFFFFF" fillOpacity={0.9} stroke="#CBD5E1" />
                                  <polygon points="0,-10 -3,-2 3,-2" fill="#1D4ED8" />
                                  <text x={0} y={8} textAnchor="middle" className="fill-slate-700 text-[8px] font-mono font-bold">
                                    N
                                  </text>
                                </g>

                                {/* Metric Scale Bar */}
                                <g transform={`translate(14, ${pH - 16})`}>
                                  <rect x={-4} y={-11} width={scaleBarPx + 36} height={18} rx={3} fill="#FFFFFF" fillOpacity={0.88} />
                                  <line x1={0} x2={scaleBarPx} y1={0} y2={0} stroke="#0F172A" strokeWidth={1.6} />
                                  <line x1={0} x2={0} y1={-3} y2={3} stroke="#0F172A" strokeWidth={1.4} />
                                  <line x1={scaleBarPx} x2={scaleBarPx} y1={-3} y2={3} stroke="#0F172A" strokeWidth={1.4} />
                                  <text x={scaleBarPx + 5} y={3} className="fill-slate-700 text-[8.5px] font-mono font-semibold">
                                    {scaleBarMeters} m
                                  </text>
                                </g>
                              </svg>
                            </div>
                          );
                        })()}

                        {(() => {
                          const svgW = 560;
                          const svgH = 276;
                          const groundBaseY = 232;
                          const roofCapPx = 12;

                          const isBrokenHorizontal = activeDist !== null && activeDist > 42;
                          const maxPhysH = Math.max(
                            subjectHeight + 4,
                            (activeFacingH ?? 16) + Math.max(0, activeGroundDelta) + 4,
                            24
                          );
                          const physDistForScale =
                            activeDist !== null ? Math.min(42, Math.max(4, activeDist)) : 26;

                          const pxPerM = Math.max(
                            3.8,
                            Math.min(7.2, 178 / maxPhysH, 265 / Math.max(12, physDistForScale))
                          );
                          const scaleY = pxPerM;
                          const scaleX = isBrokenHorizontal ? 255 / (activeDist ?? 60) : pxPerM;

                          const subjH = Math.max(30, subjectHeight * scaleY);
                          const nbH = activeFacingH ? Math.max(24, activeFacingH * scaleY) : 0;
                          const subjFloorsCount = Math.max(1, Math.min(12, Math.round(subjectFloors)));
                          const nbFloors = Math.max(
                            1,
                            Math.min(12, activeFacingFloors ?? Math.round((activeFacingH ?? 15) / 3))
                          );

                          const gapPx =
                            activeDist !== null
                              ? isBrokenHorizontal
                                ? 255
                                : Math.max(24, activeDist * pxPerM)
                              : 195;

                          const subjX = 76;
                          const subjW = 84;
                          const subjRightX = subjX + subjW;
                          const subjGroundY = groundBaseY;
                          const subjTopY = subjGroundY - subjH;

                          const nbGroundY = Math.max(
                            140,
                            Math.min(svgH - 28, subjGroundY - activeGroundDelta * scaleY)
                          );
                          const nbX = subjRightX + gapPx;
                          const nbW = 84;
                          const nbTopY = nbGroundY - nbH;

                          const targetFloor = Math.max(0, Math.min(subjFloorsCount - 1, evalFloor));
                          const floorH = subjH / subjFloorsCount;
                          const winY = Math.max(
                            subjTopY + 5,
                            Math.min(subjGroundY - 5, subjGroundY - hAppart * scaleY)
                          );

                          const activeObstructionAngle =
                            activeDist !== null && activeFacingH !== null
                              ? computeObstructionAngleForFloor(
                                  activeFacingH,
                                  activeDist,
                                  evalFloor,
                                  activeGroundDelta
                                )
                              : 0;

                          const dirCode = activeDir ?? 'S';
                          const solarSector: 'south' | 'eastwest' | 'north' =
                            dirCode === 'S' || dirCode === 'SE' || dirCode === 'SO'
                              ? 'south'
                              : dirCode === 'E' || dirCode === 'O'
                              ? 'eastwest'
                              : 'north';

                          const winterSlope = Math.tan((18 * Math.PI) / 180);
                          const winterShadowHeightM =
                            activeDist !== null && activeFacingH !== null
                              ? activeFacingH + activeGroundDelta - activeDist * winterSlope
                              : 0;
                          const winterRayAtSubjY =
                            activeDist !== null && activeFacingH !== null
                              ? subjGroundY - winterShadowHeightM * scaleY
                              : subjGroundY;
                          const clampedShadowTopY = Math.max(
                            subjTopY,
                            Math.min(subjGroundY, winterRayAtSubjY)
                          );
                          const winterBlockedFloors =
                            solarSector !== 'north' &&
                            activeDist !== null &&
                            activeFacingH !== null &&
                            winterShadowHeightM > 0.5
                              ? Array.from({ length: subjFloorsCount }).filter(
                                  (_, flIdx) => 0.5 + flIdx * 2.9 < winterShadowHeightM
                                ).length
                              : 0;

                          const hasNeighborDrawn =
                            activeDist !== null && activeFacingH !== null && nbX + 30 < svgW;

                          const skyWedgePoints = (() => {
                            if (!hasNeighborDrawn) {
                              return `${subjRightX},${winY} ${svgW},${winY} ${svgW},12 ${subjRightX},12`;
                            }
                            const dyObs = winY - nbTopY;
                            if (dyObs <= 0) {
                              return `${subjRightX},${winY} ${svgW},${winY} ${svgW},12 ${subjRightX},12`;
                            }
                            const obsSlopePx = dyObs / Math.max(1, nbX - subjRightX);
                            const rayTopX = subjRightX + (winY - 12) / obsSlopePx;
                            if (rayTopX <= svgW) {
                              return `${subjRightX},${winY} ${rayTopX.toFixed(1)},12 ${subjRightX},12`;
                            }
                            const rightY = winY - (svgW - subjRightX) * obsSlopePx;
                            return `${subjRightX},${winY} ${svgW},${rightY.toFixed(1)} ${svgW},12 ${subjRightX},12`;
                          })();

                          const solarBeamSpecs =
                            solarSector === 'south'
                              ? [
                                  { id: 'summer', label: 'Été 65°', deg: 65, color: '#0F766E', dash: '5 3', width: 1.4 },
                                  { id: 'equinox', label: 'Équinoxe 41°', deg: 41, color: '#EAB308', dash: undefined, width: 1.6 },
                                  { id: 'winter', label: 'Hiver 18°', deg: 18, color: '#D97706', dash: '3 2', width: 1.6 },
                                ]
                              : solarSector === 'eastwest'
                              ? [
                                  {
                                    id: 'summer',
                                    label: `Été ~50° (${dirCode === 'E' ? 'matin' : 'soir'})`,
                                    deg: 50,
                                    color: '#0F766E',
                                    dash: '5 3',
                                    width: 1.4,
                                  },
                                  {
                                    id: 'equinox',
                                    label: 'Équinoxe ~30°',
                                    deg: 30,
                                    color: '#EAB308',
                                    dash: undefined,
                                    width: 1.6,
                                  },
                                  {
                                    id: 'winter',
                                    label: 'Hiver ~14°',
                                    deg: 14,
                                    color: '#D97706',
                                    dash: '3 2',
                                    width: 1.5,
                                  },
                                ]
                              : [];

                          const rays = solarBeamSpecs.map((r) => {
                            const rad = (r.deg * Math.PI) / 180;
                            const slope = Math.tan(rad);
                            const sunHitHeightM =
                              activeDist !== null ? hAppart + activeDist * slope : Infinity;
                            const neighborRoofRelSubject = (activeFacingH ?? 0) + activeGroundDelta;
                            const blocked =
                              hasNeighborDrawn && sunHitHeightM < neighborRoofRelSubject;

                            if (blocked) {
                              const hitY = Math.max(
                                nbTopY + 1,
                                Math.min(nbGroundY - 2, subjGroundY - sunHitHeightM * scaleY)
                              );
                              return {
                                ...r,
                                blocked: true,
                                x2: nbX,
                                y2: hitY,
                                labelX: subjRightX + gapPx * 0.56,
                                labelY: Math.min(nbGroundY - 14, Math.max(28, hitY - 9)),
                              };
                            }

                            const svgRisePerPx = (scaleY / scaleX) * slope;
                            const maxDxByTop = Math.max(18, (winY - 16) / Math.max(0.05, svgRisePerPx));
                            const maxDxByRight = svgW - 14 - subjRightX;
                            const dx = Math.min(maxDxByTop, maxDxByRight);
                            const x2 = subjRightX + dx;
                            const y2 = winY - dx * svgRisePerPx;

                            return {
                              ...r,
                              blocked: false,
                              x2,
                              y2,
                              labelX:
                                r.id === 'summer'
                                  ? Math.min(svgW - 64, subjRightX + Math.min(dx * 0.72, 82))
                                  : Math.min(svgW - 76, x2 - 44),
                              labelY: Math.max(22, y2 + 13),
                            };
                          });

                          const visCat = classifyVisibility(
                            bdTopo.effectiveVisAVisDistanceM ?? bdTopo.principalVisAVisDistanceM
                          );

                          return (
                            <div className="space-y-3">
                              <svg
                                viewBox={`0 0 ${svgW} ${svgH}`}
                                className="w-full h-auto rounded border border-slate-100"
                                role="img"
                                aria-label="Coupe architecturale 3D vis-à-vis et ensoleillement à l'échelle 1:1"
                              >
                                <defs>
                                  <linearGradient id="archSkyGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#EFF6FF" />
                                    <stop offset="65%" stopColor="#F8FAFC" />
                                    <stop offset="100%" stopColor="#FFFFFF" />
                                  </linearGradient>
                                  <pattern
                                    id="winterShadowHatch"
                                    width="6"
                                    height="6"
                                    patternUnits="userSpaceOnUse"
                                    patternTransform="rotate(45)"
                                  >
                                    <line x1="0" y1="0" x2="0" y2="6" stroke="#64748B" strokeWidth="1.2" strokeOpacity="0.22" />
                                  </pattern>
                                </defs>

                                <rect x={0} y={0} width={svgW} height={subjGroundY} fill="url(#archSkyGrad)" />

                                {[10, 20, 30].map((m) => {
                                  const gy = subjGroundY - m * scaleY;
                                  if (gy < 18) return null;
                                  return (
                                    <g key={m}>
                                      <line
                                        x1={38}
                                        x2={svgW - 14}
                                        y1={gy}
                                        y2={gy}
                                        stroke="#CBD5E1"
                                        strokeWidth={0.75}
                                        strokeDasharray="3 3"
                                      />
                                      <text
                                        x={34}
                                        y={gy + 3}
                                        textAnchor="end"
                                        className="fill-slate-400 text-[9px] font-mono"
                                      >
                                        {m}m
                                      </text>
                                    </g>
                                  );
                                })}

                                {/* Exact Open-Sky Sector Wedge */}
                                <polygon points={skyWedgePoints} fill="#BAE6FD" fillOpacity={0.3} />

                                {/* Winter shadow polygon (South & East/West exposures only) */}
                                {solarSector !== 'north' && hasNeighborDrawn && winterShadowHeightM > 0 && (
                                  <polygon
                                    points={`${nbX},${nbTopY} ${nbX},${nbGroundY} ${subjRightX},${subjGroundY} ${subjRightX},${clampedShadowTopY}`}
                                    fill="url(#winterShadowHatch)"
                                  />
                                )}

                                {/* Terrain / Ground profile (handles terrain slope if groundDeltaM !== 0) */}
                                <polygon
                                  points={`0,${subjGroundY} ${subjRightX},${subjGroundY} ${nbX},${nbGroundY} ${svgW},${nbGroundY} ${svgW},${svgH} 0,${svgH}`}
                                  fill="#F1F5F9"
                                />
                                <polyline
                                  points={`12,${subjGroundY} ${subjRightX},${subjGroundY} ${nbX},${nbGroundY} ${svgW - 12},${nbGroundY}`}
                                  fill="none"
                                  stroke="#64748B"
                                  strokeWidth={1.6}
                                />

                                {/* Scale info badge */}
                                <text x={svgW - 14} y={18} textAnchor="end" className="fill-slate-500 text-[9px] font-mono">
                                  {isBrokenHorizontal
                                    ? 'Échelle H comprimée (> 42 m)'
                                    : 'Coupe à l’échelle 1:1 (H = V)'}
                                </text>

                                {bdTopo.adjoiningCount > 0 && (
                                  <g>
                                    <rect
                                      x={subjX - 38}
                                      y={subjTopY + 14}
                                      width={38}
                                      height={Math.max(18, subjH - 14)}
                                      fill="#E2E8F0"
                                      fillOpacity={0.55}
                                      stroke="#CBD5E1"
                                      strokeWidth={1}
                                    />
                                    <text
                                      x={subjX - 19}
                                      y={subjGroundY - 8}
                                      textAnchor="middle"
                                      className="fill-slate-600 text-[8px] font-mono font-medium"
                                    >
                                      Mit. ×{bdTopo.adjoiningCount}
                                    </text>
                                  </g>
                                )}

                                {/* Vegetation screen canopy if IGN zone_de_vegetation intersects facade ray */}
                                {activeVeg && (
                                  <g>
                                    <line
                                      x1={subjRightX + Math.min(gapPx * 0.3, 24)}
                                      x2={subjRightX + Math.min(gapPx * 0.3, 24)}
                                      y1={subjGroundY}
                                      y2={subjGroundY - 16}
                                      stroke="#15803D"
                                      strokeWidth={1.8}
                                    />
                                    <circle
                                      cx={subjRightX + Math.min(gapPx * 0.3, 24)}
                                      cy={subjGroundY - 22}
                                      r={9}
                                      fill="#22C55E"
                                      fillOpacity={0.28}
                                      stroke="#15803D"
                                      strokeWidth={1.2}
                                    />
                                    <text
                                      x={subjRightX + Math.min(gapPx * 0.3, 24)}
                                      y={subjGroundY - 34}
                                      textAnchor="middle"
                                      className="fill-[#15803D] text-[8px] font-semibold"
                                    >
                                      Végétation
                                    </text>
                                  </g>
                                )}

                                {/* SUBJECT BUILDING */}
                                <g>
                                  <polygon
                                    points={`${subjX + 5},${subjTopY - roofCapPx} ${subjRightX - 5},${subjTopY - roofCapPx} ${subjRightX},${subjTopY} ${subjX},${subjTopY}`}
                                    fill="#334155"
                                  />
                                  <rect
                                    x={subjX}
                                    y={subjTopY}
                                    width={subjW}
                                    height={subjH}
                                    fill="#FFFFFF"
                                    stroke="#1D4ED8"
                                    strokeWidth={2}
                                  />
                                  {Array.from({ length: subjFloorsCount }).map((_, flIdx) => {
                                    const fy = subjGroundY - (flIdx + 1) * floorH;
                                    const isTarget = flIdx === targetFloor;
                                    return (
                                      <g key={flIdx}>
                                        {flIdx > 0 && (
                                          <line
                                            x1={subjX + 2}
                                            x2={subjRightX - 2}
                                            y1={subjGroundY - flIdx * floorH}
                                            y2={subjGroundY - flIdx * floorH}
                                            stroke="#E2E8F0"
                                            strokeWidth={0.8}
                                          />
                                        )}
                                        {[11, 35, 59].map((wx, wIdx) => (
                                          <rect
                                            key={wIdx}
                                            x={subjX + wx}
                                            y={fy + floorH * 0.25}
                                            width={12}
                                            height={Math.max(4, floorH * 0.5)}
                                            rx={1}
                                            fill={isTarget ? '#1D4ED8' : '#CBD5E1'}
                                            fillOpacity={isTarget ? 0.9 : 0.65}
                                          />
                                        ))}
                                      </g>
                                    );
                                  })}
                                  <circle cx={subjRightX} cy={winY} r={3.5} fill="#1D4ED8" stroke="#FFFFFF" strokeWidth={1.2} />
                                  <text
                                    x={subjX + subjW / 2}
                                    y={subjTopY - roofCapPx - 7}
                                    textAnchor="middle"
                                    className="fill-[#1D4ED8] text-[10px] font-semibold"
                                  >
                                    Bien analysé ({subjectHeight} m · {subjFloorsCount} niv.)
                                  </text>
                                </g>

                                {/* FACING NEIGHBOR ON SELECTED FACADE */}
                                {hasNeighborDrawn ? (
                                  <g>
                                    <polygon
                                      points={`${nbX + 5},${nbTopY - roofCapPx + 2} ${Math.min(svgW - 14, nbX + nbW - 5)},${nbTopY - roofCapPx + 2} ${Math.min(svgW - 10, nbX + nbW)},${nbTopY} ${nbX},${nbTopY}`}
                                      fill="#475569"
                                    />
                                    <rect
                                      x={nbX}
                                      y={nbTopY}
                                      width={Math.min(nbW, svgW - nbX - 10)}
                                      height={nbH}
                                      fill="#F8FAFC"
                                      stroke="#475569"
                                      strokeWidth={1.5}
                                    />
                                    {Array.from({ length: nbFloors }).map((_, flIdx) => {
                                      const nFloorH = nbH / nbFloors;
                                      const fy = nbGroundY - (flIdx + 1) * nFloorH;
                                      return (
                                        <g key={flIdx}>
                                          {flIdx > 0 && (
                                            <line
                                              x1={nbX + 2}
                                              x2={Math.min(svgW - 12, nbX + nbW - 2)}
                                              y1={nbGroundY - flIdx * nFloorH}
                                              y2={nbGroundY - flIdx * nFloorH}
                                              stroke="#E2E8F0"
                                              strokeWidth={0.75}
                                            />
                                          )}
                                          {[11, 35].map((wx, wIdx) => (
                                            <rect
                                              key={wIdx}
                                              x={nbX + wx}
                                              y={fy + nFloorH * 0.25}
                                              width={11}
                                              height={Math.max(4, nFloorH * 0.48)}
                                              rx={1}
                                              fill="#CBD5E1"
                                              fillOpacity={0.75}
                                            />
                                          ))}
                                        </g>
                                      );
                                    })}
                                    <text
                                      x={nbX + Math.min(nbW, svgW - nbX - 10) / 2}
                                      y={nbTopY - roofCapPx - 6}
                                      textAnchor="middle"
                                      className="fill-slate-700 text-[10px] font-semibold"
                                    >
                                      Face {activeDir ?? ''} ({activeFacingH} m · {nbFloors} niv.)
                                    </text>

                                    {/* Ground scale break indicator when distance > 42m */}
                                    {isBrokenHorizontal && (
                                      <g>
                                        <rect x={subjRightX + gapPx / 2 - 8} y={subjGroundY - 6} width={16} height={12} fill="#F1F5F9" />
                                        <line x1={subjRightX + gapPx / 2 - 4} x2={subjRightX + gapPx / 2 + 1} y1={subjGroundY + 5} y2={subjGroundY - 5} stroke="#475569" strokeWidth={1.4} />
                                        <line x1={subjRightX + gapPx / 2 + 1} x2={subjRightX + gapPx / 2 + 6} y1={subjGroundY + 5} y2={subjGroundY - 5} stroke="#475569" strokeWidth={1.4} />
                                      </g>
                                    )}

                                    <line
                                      x1={subjRightX + 3}
                                      x2={nbX - 3}
                                      y1={groundBaseY + 20}
                                      y2={groundBaseY + 20}
                                      stroke="#0F172A"
                                      strokeWidth={1.3}
                                    />
                                    <polygon points={`${subjRightX + 3},${groundBaseY + 20} ${subjRightX + 9},${groundBaseY + 17} ${subjRightX + 9},${groundBaseY + 23}`} fill="#0F172A" />
                                    <polygon points={`${nbX - 3},${groundBaseY + 20} ${nbX - 9},${groundBaseY + 17} ${nbX - 9},${groundBaseY + 23}`} fill="#0F172A" />
                                    <rect
                                      x={subjRightX + gapPx / 2 - 28}
                                      y={groundBaseY + 11}
                                      width={56}
                                      height={18}
                                      rx={3}
                                      fill="#FFFFFF"
                                      stroke="#CBD5E1"
                                    />
                                    <text
                                      x={subjRightX + gapPx / 2}
                                      y={groundBaseY + 23}
                                      textAnchor="middle"
                                      className="fill-slate-900 text-[10px] font-mono font-bold"
                                    >
                                      {activeDist} m
                                    </text>
                                  </g>
                                ) : (
                                  <text
                                    x={subjRightX + 145}
                                    y={groundBaseY + 22}
                                    textAnchor="middle"
                                    className="fill-[#0F766E] text-[10px] font-semibold"
                                  >
                                    Façade {activeDir ?? ''} dégagée (&gt; 100 m sans vis-à-vis)
                                  </text>
                                )}

                                {/* Obstruction angle sightline */}
                                {hasNeighborDrawn && (
                                  <g>
                                    <line
                                      x1={subjRightX}
                                      y1={winY}
                                      x2={nbX}
                                      y2={nbTopY}
                                      stroke={solarSector === 'north' ? '#1D4ED8' : '#64748B'}
                                      strokeWidth={solarSector === 'north' ? 1.8 : 1.1}
                                      strokeDasharray={solarSector === 'north' ? '4 2' : '2 3'}
                                    />
                                    {solarSector === 'north' && (() => {
                                      const pillX = subjRightX + gapPx * 0.5;
                                      const pillY = Math.min(subjGroundY - 14, Math.max(26, (winY + nbTopY) / 2 - 8));
                                      return (
                                        <g>
                                          <rect
                                            x={pillX - 64}
                                            y={pillY - 10}
                                            width={128}
                                            height={15}
                                            rx={3}
                                            fill="#FFFFFF"
                                            fillOpacity={0.92}
                                            stroke="#BFDBFE"
                                            strokeWidth={0.8}
                                          />
                                          <text
                                            x={pillX}
                                            y={pillY + 1}
                                            textAnchor="middle"
                                            className="fill-[#1D4ED8] text-[9.5px] font-mono font-semibold"
                                          >
                                            Masque {activeObstructionAngle}° · Ciel {Math.max(0, 90 - activeObstructionAngle)}°
                                          </text>
                                        </g>
                                      );
                                    })()}
                                  </g>
                                )}

                                {rays.map((ray) => (
                                  <g key={ray.id}>
                                    <line
                                      x1={subjRightX}
                                      y1={winY}
                                      x2={ray.x2}
                                      y2={ray.y2}
                                      stroke={ray.color}
                                      strokeWidth={ray.width}
                                      strokeDasharray={ray.dash}
                                    />
                                    {ray.blocked && (
                                      <circle cx={ray.x2} cy={ray.y2} r={2.8} fill={ray.color} />
                                    )}
                                    <text
                                      x={ray.labelX}
                                      y={ray.labelY}
                                      textAnchor={ray.blocked ? 'middle' : 'start'}
                                      className="text-[9px] font-mono font-semibold"
                                      fill={ray.color === '#EAB308' ? '#A16207' : ray.color}
                                    >
                                      {ray.blocked ? `${ray.deg}° masqué` : ray.label}
                                    </text>
                                  </g>
                                ))}
                              </svg>

                              {/* Orientation-aware Compact Legend */}
                              {solarSector === 'north' ? (
                                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-slate-600">
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="w-3 h-0.5 bg-[#1D4ED8] inline-block" />
                                    Rayon d’obstruction réel ({activeObstructionAngle}°)
                                  </span>
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="w-3 h-3 bg-sky-100 border border-sky-300 inline-block rounded-xs" />
                                    Secteur de ciel libre (lumière diffuse {dirCode === 'N' ? 'toute l’année' : '· rasant été'})
                                  </span>
                                </div>
                              ) : (
                                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-slate-600">
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="w-3 h-0.5 bg-[#D97706] inline-block" />
                                    {solarSector === 'south' ? 'Soleil d’hiver (18°)' : 'Soleil bas d’hiver (~14°)'}
                                  </span>
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="w-3 h-0.5 bg-[#EAB308] inline-block" />
                                    {solarSector === 'south' ? 'Équinoxe (41°)' : 'Équinoxe (~30°)'}
                                  </span>
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="w-3 h-0.5 bg-[#0F766E] inline-block" />
                                    {solarSector === 'south' ? 'Soleil d’été (65°)' : 'Soleil d’été (~50°)'}
                                  </span>
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="w-3 h-3 bg-slate-200 border border-slate-300 inline-block rounded-xs" />
                                    Zone d’ombre hivernale
                                  </span>
                                </div>
                              )}

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
                                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                                  <div className="text-[11px] text-slate-500">Exposition rue &amp; cour</div>
                                  <div className="font-mono font-bold text-slate-900 mt-0.5">
                                    {bdTopo.effectiveVisAVisDistanceM !== null
                                      ? `${bdTopo.effectiveVisAVisDistanceM} m pondéré`
                                      : bdTopo.principalVisAVisDistanceM !== null
                                      ? `${bdTopo.principalVisAVisDistanceM} m (${bdTopo.principalDirection ?? '—'})`
                                      : `> 100 m (${bdTopo.principalDirection ?? '—'})`}
                                  </div>
                                  <div className="text-[11px] text-slate-600 mt-0.5">
                                    {visCat === 'degage'
                                      ? 'Vue dégagée (> 16 m)'
                                      : visCat === 'modere'
                                      ? 'Modéré (9–16 m)'
                                      : 'Proche (< 9 m)'}
                                    {bdTopo.principalVisAVisDistanceM !== null
                                      ? ` · Rue ${bdTopo.principalVisAVisDistanceM} m (${bdTopo.principalDirection ?? '—'})`
                                      : ` · Rue > 100 m (${bdTopo.principalDirection ?? '—'})`}
                                    {bdTopo.closestNeighborDistanceM !== null &&
                                    bdTopo.closestNeighborDistanceM !== bdTopo.principalVisAVisDistanceM
                                      ? ` · Cour ${bdTopo.closestNeighborDistanceM} m`
                                      : ''}
                                  </div>
                                </div>

                                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                                  <div className="text-[11px] text-slate-500">
                                    Masque à cet étage ({evalFloor === 0 ? 'RDC' : `${evalFloor}e`})
                                  </div>
                                  <div className="font-mono font-bold text-slate-900 mt-0.5">
                                    {activeObstructionAngle === 0
                                      ? '0° — Au-dessus des toits'
                                      : `${activeObstructionAngle}° (H = ${hAppart} m)`}
                                  </div>
                                  <div className="text-[11px] text-slate-600 mt-0.5">
                                    {solarSector === 'north'
                                      ? `Lumière diffuse (${dirCode}) · ciel ${Math.max(0, 90 - activeObstructionAngle)}°`
                                      : winterBlockedFloors === 0
                                      ? 'Soleil d’hiver dégagé'
                                      : `Ombre hiver RDC → ${winterBlockedFloors === 1 ? '1er' : `${winterBlockedFloors}e`}`}
                                  </div>
                                </div>

                                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                                  <div className="text-[11px] text-slate-500">Îlot & masques végétaux</div>
                                  <div className="font-mono font-bold text-slate-900 mt-0.5">
                                    {bdTopo.adjoiningCount} mitoyen{bdTopo.adjoiningCount > 1 ? 's' : ''} ·{' '}
                                    {bdTopo.neighborCount60m} vis-à-vis
                                  </div>
                                  <div className="text-[11px] text-slate-600 mt-0.5">
                                    {bdTopo.vegetationScreensCount > 0
                                      ? `${bdTopo.vegetationScreensCount} écran(s) végétal IGN détecté(s)`
                                      : 'Aucun écran arboré IGN en façade'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>

                  {/* Facade-by-Facade Lambert-93 Breakdown Table */}
                  {bdTopo && bdTopo.facades.length > 0 && (
                    <div className="border border-slate-200 rounded-md overflow-hidden bg-white">
                      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-semibold text-slate-900">
                            Décomposition façade par façade (Lambert-93 · EPSG:2154)
                          </h4>
                          <p className="text-[11px] text-slate-500">
                            Cliquez sur une façade pour la visualiser en coupe ci-dessus · Angle recalculé à l’étage {evalFloor === 0 ? 'RDC' : `${evalFloor}e`}
                          </p>
                        </div>
                        <span className="text-[11px] font-mono text-slate-500">
                          {bdTopo.facades.length} façade{bdTopo.facades.length > 1 ? 's' : ''} libre{bdTopo.facades.length > 1 ? 's' : ''}
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px]">
                            <tr>
                              <th className="py-2 px-3">Façade</th>
                              <th className="py-2 px-3 text-right">Linéaire</th>
                              <th className="py-2 px-3 text-right">Distance en face</th>
                              <th className="py-2 px-3 text-right">Hauteur face</th>
                              <th className="py-2 px-3">Végétation IGN</th>
                              <th className="py-2 px-3 text-right">Obstruction ({evalFloor === 0 ? 'RDC' : `${evalFloor}e`})</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {bdTopo.facades.map((fac) => {
                              const fKey = getFacadeKey(fac);
                              const isSel = activeFacade ? getFacadeKey(activeFacade) === fKey : false;
                              const facCat = classifyVisibility(fac.distanceM);
                              const facAngle =
                                fac.distanceM !== null && fac.facingHeightM !== null
                                  ? computeObstructionAngleForFloor(
                                      fac.facingHeightM,
                                      fac.distanceM,
                                      evalFloor,
                                      fac.groundDeltaM ?? 0
                                    )
                                  : 0;
                              const catColor =
                                facCat === 'degage'
                                  ? '#0F766E'
                                  : facCat === 'modere'
                                  ? '#1D4ED8'
                                  : '#D97706';
                              return (
                                <tr
                                  key={fKey}
                                  onClick={() => setSelectedFacadeDir(fKey)}
                                  className={`cursor-pointer transition-colors ${
                                    isSel ? 'bg-blue-50/70' : 'hover:bg-slate-50/80'
                                  }`}
                                >
                                  <td className="py-2 px-3 font-semibold text-slate-900">
                                    Face {fac.direction}
                                    {fac.isCourtyard && (
                                      <span className="ml-1.5 text-[10px] font-medium text-slate-500">
                                        Cour intérieure
                                      </span>
                                    )}
                                    {!fac.isCourtyard && fac.direction === bdTopo.principalDirection && (
                                      <span className="ml-1.5 text-[10px] font-medium text-[#0F766E]">
                                        Principale
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                                    {fac.facadeLengthM} m
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono tabular-nums">
                                    <span className="font-semibold text-slate-900">
                                      {fac.distanceM !== null ? `${fac.distanceM} m` : '> 100 m'}
                                    </span>
                                    <span className="ml-1.5 text-[10px] font-sans font-semibold" style={{ color: catColor }}>
                                      {facCat === 'degage' ? 'Dégagé' : facCat === 'modere' ? 'Modéré' : 'Proche'}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                                    {fac.facingHeightM !== null ? `${fac.facingHeightM} m` : '—'}
                                  </td>
                                  <td className="py-2 px-3 text-[11px] text-slate-600">
                                    {fac.vegetationScreen ?? '—'}
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                                    {facAngle === 0 ? '0° (dégagé)' : `${facAngle}°`}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Luminosity Breakdown Card */}
                  {luminosity && (
                    <div className="border border-slate-200 rounded-md p-4 bg-white space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-semibold text-slate-900">
                            Indice de luminosité naturelle vs secteur
                          </h4>
                          <p className="text-[11px] text-slate-500">
                            {luminosity.crossLightLabel}
                          </p>
                        </div>
                        <div className="text-right font-mono tabular-nums">
                          <span className="text-base font-bold text-[#1D4ED8]">{luminosity.score}</span>
                          <span className="text-xs text-slate-500"> / 100</span>
                          {environmentSummary && (
                            <span className="ml-2 text-[11px] text-slate-600">
                              (Médiane secteur : {environmentSummary.medianLuminosity}/100)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        {[
                          { label: 'Ouverture au ciel', val: luminosity.skyContribution, max: 55, color: '#1D4ED8' },
                          { label: 'Recul vis-à-vis', val: luminosity.distanceContribution, max: 25, color: '#0F766E' },
                          { label: 'Exposition / Traversant', val: luminosity.exposureContribution, max: 20, color: '#D97706' },
                        ].map((part) => (
                          <div key={part.label} className="space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-slate-600">{part.label}</span>
                              <span className="font-mono font-semibold text-slate-900">
                                {part.val}/{part.max}
                              </span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded overflow-hidden">
                              <div
                                className="h-full rounded"
                                style={{
                                  width: `${Math.round((part.val / part.max) * 100)}%`,
                                  backgroundColor: part.color,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Neighbor table BD TOPO — Floor-aware & Parisian thresholds */}
                  {bdTopo && bdTopo.nearestNeighbors.length > 0 && (
                    <div className="border border-slate-200 rounded-md overflow-hidden bg-white">
                      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-semibold text-slate-900">
                            Masques proches identifiés (&lt; 100 m · IGN BD TOPO)
                          </h4>
                          <p className="text-[11px] text-slate-500">
                            Immeubles en vis-à-vis · Angles évalués depuis le {evalFloor === 0 ? 'RDC' : `${evalFloor}e étage`} (H = {hAppart} m)
                          </p>
                        </div>
                        <span className="text-[11px] font-mono text-slate-500">
                          {bdTopo.neighborCount60m} bâtiment{bdTopo.neighborCount60m > 1 ? 's' : ''}
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px]">
                            <tr>
                              <th className="py-2 px-3">Orientation & ensoleillement</th>
                              <th className="py-2 px-3 text-right">Distance façade</th>
                              <th className="py-2 px-3 text-right">Gabarit voisin</th>
                              <th className="py-2 px-3">Obstruction & impact</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {bdTopo.nearestNeighbors.map((nb) => {
                              const dirContext: Record<string, string> = {
                                S: 'Soleil direct toute la journée',
                                SE: 'Soleil matin & midi',
                                SO: 'Soleil après-midi',
                                E: 'Soleil du matin',
                                O: 'Soleil de fin de journée',
                                N: 'Lumière diffuse (pas d’ombre directe)',
                                NE: 'Soleil rasant matin (été)',
                                NO: 'Soleil rasant soir (été)',
                              };
                              const nbAngle = computeObstructionAngleForFloor(
                                nb.heightM,
                                nb.distanceM,
                                evalFloor,
                                nb.groundDeltaM ?? 0
                              );
                              const nbCat = classifyVisibility(nb.distanceM);
                              const severity =
                                nbAngle >= 45
                                  ? { label: 'Fort', color: '#D97706', impact: 'Masque marqué à cet étage' }
                                  : nbAngle >= 22
                                  ? { label: 'Modéré', color: '#1D4ED8', impact: 'Ciel partiellement dégagé' }
                                  : nbAngle === 0
                                  ? { label: 'Nul', color: '#0F766E', impact: 'Au-dessus du toit voisin' }
                                  : { label: 'Faible', color: '#0F766E', impact: 'Vue bien dégagée' };

                              return (
                                <tr key={nb.id} className="hover:bg-slate-50/70">
                                  <td className="py-2.5 px-3">
                                    <div className="font-semibold text-slate-900">
                                      Face {nb.direction}
                                      {nb.vegetationScreen && (
                                        <span className="ml-1.5 text-[10px] font-medium text-[#15803D]">
                                          · {nb.vegetationScreen}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-slate-500">
                                      {dirContext[nb.direction] ?? 'Secteur adjacent'}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                    <div className="font-semibold text-slate-900">{nb.distanceM} m</div>
                                    <div className="text-[10px] font-sans text-slate-500">
                                      {nbCat === 'proche' ? 'Proche (< 9 m)' : nbCat === 'modere' ? 'Modéré (9–16 m)' : 'Dégagé (> 16 m)'}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                    <div className="text-slate-900 font-medium">{nb.heightM} m</div>
                                    <div className="text-[10px] text-slate-500">
                                      {nb.floors ? `${nb.floors} niv.` : 'n/c'}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 min-w-[170px]">
                                    <div className="flex items-center justify-between gap-2 text-[11px] mb-1">
                                      <span className="font-semibold" style={{ color: severity.color }}>
                                        {severity.label} · {nbAngle}°
                                      </span>
                                      <span className="text-slate-500">{severity.impact}</span>
                                    </div>
                                    <div className="h-1.5 bg-slate-100 rounded overflow-hidden">
                                      <div
                                        className="h-full rounded"
                                        style={{
                                          width: `${Math.min(100, Math.round((nbAngle / 90) * 100))}%`,
                                          backgroundColor: severity.color,
                                        }}
                                      />
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500">
                        Seuils parisiens : &lt; 9 m = proche · 9–16 m = rue parisienne · &gt; 16 m = vue dégagée · Angle &lt; 22° = faible obstruction à l’étage sélectionné.
                      </div>
                    </div>
                  )}

                  {/* Redesigned Altimétrie & LiDAR HD (IGN) + Ensoleillement Météo-France */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="border border-slate-200 rounded-md p-4 bg-white space-y-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-semibold text-slate-900">
                          Altimétrie & LiDAR HD (IGN)
                        </h4>
                        <span className="text-[11px] font-medium text-[#0F766E]">
                          {lidar?.lidarCovered ? 'LiDAR HD classifié' : 'RGE Alti'}
                        </span>
                      </div>

                      {/* Visual vertical elevation profile */}
                      <div className="flex items-stretch gap-3 p-3 bg-slate-50 border border-slate-200 rounded">
                        <div className="flex flex-col items-center justify-between py-0.5 w-6 shrink-0" aria-hidden="true">
                          <div className="w-2.5 h-2.5 rounded-full bg-[#1D4ED8]" />
                          <div className="w-1 flex-1 bg-[#1D4ED8]/30 my-1 rounded" />
                          <div className="w-2.5 h-2.5 rounded-xs bg-slate-600" />
                        </div>
                        <div className="flex-1 flex flex-col justify-between gap-2.5 font-mono tabular-nums">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-sans text-[11px] text-slate-600">Faîtage / Toiture (NGF)</span>
                            <span className="font-bold text-[#1D4ED8]">
                              {lidar?.roofAltitudeNgfM !== null && lidar?.roofAltitudeNgfM !== undefined
                                ? `${lidar.roofAltitudeNgfM} m`
                                : '—'}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between gap-2 border-y border-slate-200 py-1.5">
                            <span className="font-sans text-[11px] text-slate-500">Hauteur bâtie mesurée</span>
                            <span className="font-semibold text-slate-900">+{subjectHeight} m</span>
                          </div>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-sans text-[11px] text-slate-600">Altitude du sol (NGF)</span>
                            <span className="font-bold text-slate-900">
                              {lidar?.groundAltitudeNgfM !== null && lidar?.groundAltitudeNgfM !== undefined
                                ? `${lidar.groundAltitudeNgfM} m`
                                : '—'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1 text-[11px] text-slate-600">
                        <p>
                          Cote NGF mesurée au niveau de la rue ({lidar?.groundAltitudeNgfM ?? '—'} m) permettant de comparer la hauteur relative face aux immeubles voisins en pente.
                        </p>
                        {lidar?.lidarSensor && (
                          <div className="font-mono text-slate-500 pt-1">
                            Capteur : {lidar.lidarSensor}
                            {lidar.lidarTileName ? ` · Dalle ${lidar.lidarTileName}` : ''}
                          </div>
                        )}
                        <div className="font-mono text-slate-500">
                          Classes : Sol · Bâtiments · Toitures · Végétation (≥ 10 pts/m²)
                        </div>
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-md p-4 bg-white space-y-3 text-xs flex flex-col justify-between">
                      <div className="space-y-2.5">
                        <h4 className="font-semibold text-slate-900">
                          Ensoleillement & Météo-France
                        </h4>
                        <dl className="divide-y divide-slate-100">
                          <div className="py-1.5 flex justify-between gap-2">
                            <dt className="text-slate-500">Irradiation annuelle (PVGIS)</dt>
                            <dd className="font-mono font-bold text-[#1D4ED8]">
                              {solar?.annualIrradiationKwhSqm
                                ? `${solar.annualIrradiationKwhSqm} kWh/m²/an`
                                : '—'}
                            </dd>
                          </div>
                          <div className="py-1.5 flex justify-between gap-2">
                            <dt className="text-slate-500">Ensoleillement (AROME 7j)</dt>
                            <dd className="font-mono font-semibold text-slate-900">
                              {meteo?.recent7dAvgSunshineHours !== null &&
                              meteo?.recent7dAvgSunshineHours !== undefined
                                ? `${meteo.recent7dAvgSunshineHours} h/jour`
                                : '—'}
                            </dd>
                          </div>
                          <div className="py-1.5 flex justify-between gap-2">
                            <dt className="text-slate-500">Rayonnement global moyen</dt>
                            <dd className="font-mono text-slate-900">
                              {meteo?.recent7dAvgRadiationMjSqm !== null &&
                              meteo?.recent7dAvgRadiationMjSqm !== undefined
                                ? `${meteo.recent7dAvgRadiationMjSqm} MJ/m²`
                                : '—'}
                            </dd>
                          </div>
                          {solar?.optimalSlopeDeg !== null && solar?.optimalSlopeDeg !== undefined && (
                            <div className="py-1.5 flex justify-between gap-2">
                              <dt className="text-slate-500">Inclinaison solaire optimale</dt>
                              <dd className="font-mono text-slate-900">
                                {solar.optimalSlopeDeg}° (azimut {solar.optimalAzimuthDeg ?? 0}°)
                              </dd>
                            </div>
                          )}
                          {bdnb?.solarThermalPotential !== null &&
                            bdnb?.solarThermalPotential !== undefined && (
                              <div className="py-1.5 flex justify-between gap-2">
                                <dt className="text-slate-500">Potentiel thermique (BDNB)</dt>
                                <dd className="font-mono text-slate-900">
                                  {bdnb.solarThermalPotential} MWh/an
                                </dd>
                              </div>
                            )}
                        </dl>
                      </div>
                      <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                        Irradiation horizontale intégrant l’horizon topographique réel + modèle climatique Météo-France.
                      </p>
                    </div>
                  </div>

                  {/* Monthly Solar Irradiation Mini-Chart */}
                  {solar && solar.monthlyKwh.length > 0 && (
                    <div className="border border-slate-200 rounded-md p-3.5">
                      <h4 className="text-xs font-semibold text-slate-900 mb-3">
                        Profil mensuel d’ensoleillement (kWh/m² · PVGIS horizon DEM)
                      </h4>
                      <div className="grid grid-cols-12 gap-1.5 items-end h-24 pt-2">
                        {(() => {
                          const maxKwh = Math.max(1, ...solar.monthlyKwh.map((m) => m.kwh));
                          return solar.monthlyKwh.map((m) => (
                            <div key={m.month} className="flex flex-col items-center gap-1 h-full justify-end">
                              <span className="text-[9px] font-mono text-slate-500">{m.kwh}</span>
                              <div
                                className="w-full bg-amber-400/80 rounded-t-[2px]"
                                style={{ height: `${Math.max(8, (m.kwh / maxKwh) * 60)}%` }}
                              />
                              <span className="text-[10px] font-mono text-slate-600">{m.label}</span>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB 4: CADASTRE & QUARTIER */}
          {activeTab === 'cadastre' && (
            <div className="space-y-6">
              <div>
                <h4 className="text-xs font-semibold text-slate-900 mb-2">
                  Cadastre PCI (DGFiP / IGN)
                </h4>
                <dl className="divide-y divide-slate-100 text-xs border border-slate-200 rounded-md px-4">
                  <div className="py-2.5 flex justify-between gap-4">
                    <dt className="text-slate-500">Identifiant parcelle (IDU)</dt>
                    <dd className="font-mono font-semibold text-slate-900">
                      {cadastre?.idu || transaction.parcelId || '—'}
                    </dd>
                  </div>
                  <div className="py-2.5 flex justify-between gap-4">
                    <dt className="text-slate-500">Section & Numéro</dt>
                    <dd className="font-mono text-slate-900">
                      {cadastre ? `Section ${cadastre.section} · Parcelle ${cadastre.numero}` : '—'}
                    </dd>
                  </div>
                  <div className="py-2.5 flex justify-between gap-4">
                    <dt className="text-slate-500">Contenance cadastrale (surface terrain)</dt>
                    <dd className="font-mono font-semibold text-slate-900">
                      {cadastre?.contenanceSqm ? `${cadastre.contenanceSqm} m²` : '—'}
                    </dd>
                  </div>
                  <div className="py-2.5 flex justify-between gap-4">
                    <dt className="text-slate-500">Emprise au sol bâtie / Taux d’occupation</dt>
                    <dd className="font-mono text-slate-900">
                      {bdnb?.footprintSqm ? `${bdnb.footprintSqm} m²` : '—'}
                      {cadastre?.builtCoveragePct !== null && cadastre?.builtCoveragePct !== undefined
                        ? ` (${cadastre.builtCoveragePct} % bâti · ${100 - cadastre.builtCoveragePct} % cour/libre)`
                        : ''}
                    </dd>
                  </div>
                </dl>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-900 mb-2">
                  Contexte urbain OpenStreetMap (OSM) & Géolocalisation
                </h4>
                <dl className="divide-y divide-slate-100 text-xs border border-slate-200 rounded-md px-4">
                  <div className="py-2.5 flex justify-between gap-4">
                    <dt className="text-slate-500">Quartier / Îlot OSM</dt>
                    <dd className="font-medium text-slate-900 text-right">
                      {[osm?.quarter, osm?.cityBlock, osm?.suburb].filter(Boolean).join(' · ') || '—'}
                    </dd>
                  </div>
                  <div className="py-2.5 flex justify-between gap-4">
                    <dt className="text-slate-500">Coordonnées WGS84</dt>
                    <dd className="font-mono text-slate-900">
                      {transaction.latitude.toFixed(6)}, {transaction.longitude.toFixed(6)}
                    </dd>
                  </div>
                  {osm?.osmId && (
                    <div className="py-2.5 flex justify-between gap-4">
                      <dt className="text-slate-500">Objet OpenStreetMap</dt>
                      <dd className="font-mono text-slate-700">
                        {osm.osmType} #{osm.osmId}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-900 mb-2">
                  Accès directs cartographiques
                </h4>
                <div className="grid grid-cols-2 gap-2.5">
                  <a
                    href={gmapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 text-xs font-medium text-slate-800 border border-slate-200 rounded-md hover:bg-slate-50 inline-flex items-center justify-between"
                  >
                    Google Maps <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                  </a>
                  <a
                    href={streetViewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 text-xs font-medium text-slate-800 border border-slate-200 rounded-md hover:bg-slate-50 inline-flex items-center justify-between"
                  >
                    Google Street View <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                  </a>
                  <a
                    href={geoportailUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 text-xs font-medium text-slate-800 border border-slate-200 rounded-md hover:bg-slate-50 inline-flex items-center justify-between"
                  >
                    Géoportail Cadastre <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                  </a>
                  <a
                    href={osmUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 text-xs font-medium text-slate-800 border border-slate-200 rounded-md hover:bg-slate-50 inline-flex items-center justify-between"
                  >
                    OpenStreetMap <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500">
            Sources : DVF · BDNB · ADEME · IGN BD TOPO & LiDAR · PCI · PVGIS · Météo-France · OSM
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100 transition-colors shrink-0"
          >
            Fermer
          </button>
        </div>
      </aside>
    </div>
  );
}
