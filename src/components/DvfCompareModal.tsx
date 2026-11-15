import { ArrowRight, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DvfTransaction } from '../lib/dvf';
import type { PropertyEnrichmentResult, SectorEnvironmentSummary } from '../lib/enrichment';
import { formatDateFr, formatEuros, formatPricePerSqm, formatSurface } from '../utils/format';

interface DvfCompareModalProps {
  transactions: [DvfTransaction, DvfTransaction] | null;
  sectorMedianPricePerSqm: number | null;
  environmentSummary: SectorEnvironmentSummary | null;
  onClose: () => void;
  onInspectTransaction: (tx: DvfTransaction) => void;
}

function getFloorDisplay(tx: DvfTransaction, enrich: PropertyEnrichmentResult | null): string {
  const records = enrich?.ademeDpe.records ?? [];
  const exactWithFloor = records.find((r) => r.likelyMatch && r.floorNumber !== null);
  const anyWithFloor = records.find((r) => r.floorNumber !== null);
  const match = exactWithFloor ?? anyWithFloor;
  if (match && match.floorNumber !== null) {
    const label = match.floorNumber === 0 ? 'RDC (0)' : `${match.floorNumber}e étage`;
    const suffix = match.likelyMatch ? ' (DPE apparié)' : ' (DPE immeuble)';
    return `${label}${suffix}`;
  }
  const floors = enrich?.bdnb?.floors ?? enrich?.bdTopo?.subjectFloors ?? null;
  if (floors !== null) {
    return `Non précisé (immeuble R+${Math.max(0, floors - 1)})`;
  }
  return tx.natureMutation.toLowerCase().includes('futur') ? 'Non précisé (VEFA)' : 'Non précisé dans DVF/DPE';
}

function getDpeDisplay(enrich: PropertyEnrichmentResult | null): string {
  const records = enrich?.ademeDpe.records ?? [];
  const exact = records.find((r) => r.likelyMatch) ?? records[0];
  if (exact) {
    const conso = exact.consoEpSqm !== null ? ` (${exact.consoEpSqm} kWh/m²)` : '';
    return `DPE ${exact.etiquetteDpe} · GES ${exact.etiquetteGes}${conso}`;
  }
  if (enrich?.bdnb?.dpeClassBuilding) {
    return `Classe immeuble ${enrich.bdnb.dpeClassBuilding} (BDNB)`;
  }
  return 'Non disponible';
}

export function DvfCompareModal({
  transactions,
  sectorMedianPricePerSqm,
  environmentSummary,
  onClose,
  onInspectTransaction,
}: DvfCompareModalProps) {
  const [enrichA, setEnrichA] = useState<PropertyEnrichmentResult | null>(null);
  const [enrichB, setEnrichB] = useState<PropertyEnrichmentResult | null>(null);
  const [loading, setLoading] = useState(false);

  const txA = transactions?.[0] ?? null;
  const txB = transactions?.[1] ?? null;

  useEffect(() => {
    if (!txA || !txB) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [txA, txB, onClose]);

  useEffect(() => {
    if (!txA || !txB) {
      setEnrichA(null);
      setEnrichB(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setEnrichA(null);
    setEnrichB(null);

    const fetchFor = async (tx: DvfTransaction) => {
      const qs = new URLSearchParams({
        lat: String(tx.latitude),
        lon: String(tx.longitude),
        address: tx.address,
        postalCode: tx.postalCode,
        cityCode: tx.cityCode,
        parcelId: tx.parcelId,
        surfaceBati: String(tx.surfaceBati),
      });
      const res = await fetch(`/api/property/enrich?${qs.toString()}`);
      if (!res.ok) return null;
      return (await res.json()) as PropertyEnrichmentResult;
    };

    Promise.all([fetchFor(txA), fetchFor(txB)])
      .then(([resA, resB]) => {
        if (!cancelled) {
          setEnrichA(resA);
          setEnrichB(resB);
        }
      })
      .catch(() => {
        // Keep partial DVF comparison visible even if external enrichment fails
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [txA, txB]);

  if (!txA || !txB) return null;

  const envA = environmentSummary?.byTransactionId[txA.id] ?? null;
  const envB = environmentSummary?.byTransactionId[txB.id] ?? null;

  const diffPriceSqm = txA.pricePerSqm - txB.pricePerSqm;
  const diffSurface = Math.round((txA.surfaceBati - txB.surfaceBati) * 10) / 10;
  const diffTotal = txA.valeurFonciere - txB.valeurFonciere;

  const lumA = enrichA?.luminosity?.score ?? envA?.luminosity.score ?? null;
  const lumB = enrichB?.luminosity?.score ?? envB?.luminosity.score ?? null;
  const visA =
    enrichA?.bdTopo?.effectiveVisAVisDistanceM ??
    envA?.effectiveVisAVisM ??
    enrichA?.bdTopo?.principalVisAVisDistanceM ??
    envA?.principalVisAVisM ??
    null;
  const visB =
    enrichB?.bdTopo?.effectiveVisAVisDistanceM ??
    envB?.effectiveVisAVisM ??
    enrichB?.bdTopo?.principalVisAVisDistanceM ??
    envB?.principalVisAVisM ??
    null;
  const rueA = enrichA?.bdTopo?.principalVisAVisDistanceM ?? envA?.principalVisAVisM ?? null;
  const rueB = enrichB?.bdTopo?.principalVisAVisDistanceM ?? envB?.principalVisAVisM ?? null;
  const courA = enrichA?.bdTopo?.closestNeighborDistanceM ?? envA?.closestVisAVisM ?? null;
  const courB = enrichB?.bdTopo?.closestNeighborDistanceM ?? envB?.closestVisAVisM ?? null;
  const skyA = enrichA?.bdTopo?.skyOpennessPct ?? envA?.skyOpennessPct ?? null;
  const skyB = enrichB?.bdTopo?.skyOpennessPct ?? envB?.skyOpennessPct ?? null;

  const formatVis = (
    eff: number | null,
    rue: number | null,
    cour: number | null,
    loaded: boolean
  ) => {
    if (!loaded) return '—';
    const base = eff !== null ? `${eff} m pondéré` : rue !== null ? `${rue} m` : '> 100 m (dégagé)';
    const parts: string[] = [];
    if (rue !== null && rue !== eff) parts.push(`rue ${rue} m`);
    if (cour !== null && (rue === null || cour < rue)) parts.push(`cour ${cour} m`);
    return parts.length > 0 ? `${base} (${parts.join(' · ')})` : base;
  };

  const rows: Array<{
    label: string;
    valA: string;
    valB: string;
    delta?: string;
    highlight?: 'A' | 'B' | null;
    requiresEnrich?: boolean;
  }> = [
    {
      label: 'Date de mutation',
      valA: formatDateFr(txA.dateMutation),
      valB: formatDateFr(txB.dateMutation),
    },
    {
      label: 'Nature d’acte',
      valA: txA.natureMutation.toLowerCase().includes('futur') ? 'VEFA (Vente sur plan)' : txA.natureMutation,
      valB: txB.natureMutation.toLowerCase().includes('futur') ? 'VEFA (Vente sur plan)' : txB.natureMutation,
    },
    {
      label: 'Typologie',
      valA: txA.roomLabel,
      valB: txB.roomLabel,
    },
    {
      label: 'Surface réelle bâtie',
      valA: formatSurface(txA.surfaceBati),
      valB: formatSurface(txB.surfaceBati),
      delta:
        diffSurface === 0
          ? 'Identique'
          : `${diffSurface > 0 ? '+' : ''}${new Intl.NumberFormat('fr-FR').format(diffSurface)} m²`,
      highlight: diffSurface > 0 ? 'A' : diffSurface < 0 ? 'B' : null,
    },
    {
      label: 'Surface Loi Carrez',
      valA: txA.surfaceCarrez !== null ? formatSurface(txA.surfaceCarrez) : 'Non renseignée',
      valB: txB.surfaceCarrez !== null ? formatSurface(txB.surfaceCarrez) : 'Non renseignée',
    },
    {
      label: 'Valeur foncière',
      valA: formatEuros(txA.valeurFonciere),
      valB: formatEuros(txB.valeurFonciere),
      delta: `${diffTotal > 0 ? '+' : ''}${formatEuros(diffTotal)}`,
    },
    {
      label: 'Prix au m²',
      valA: formatPricePerSqm(txA.pricePerSqm),
      valB: formatPricePerSqm(txB.pricePerSqm),
      delta: `${diffPriceSqm > 0 ? '+' : ''}${formatPricePerSqm(diffPriceSqm)}`,
      highlight: diffPriceSqm < 0 ? 'A' : diffPriceSqm > 0 ? 'B' : null,
    },
    {
      label: 'Écart vs médiane secteur',
      valA:
        sectorMedianPricePerSqm
          ? `${Math.round(((txA.pricePerSqm - sectorMedianPricePerSqm) / sectorMedianPricePerSqm) * 100) > 0 ? '+' : ''}${Math.round(((txA.pricePerSqm - sectorMedianPricePerSqm) / sectorMedianPricePerSqm) * 100)} %`
          : '—',
      valB:
        sectorMedianPricePerSqm
          ? `${Math.round(((txB.pricePerSqm - sectorMedianPricePerSqm) / sectorMedianPricePerSqm) * 100) > 0 ? '+' : ''}${Math.round(((txB.pricePerSqm - sectorMedianPricePerSqm) / sectorMedianPricePerSqm) * 100)} %`
          : '—',
    },
    {
      label: 'Étage estimé (ADEME DPE / BDNB)',
      valA: loading && !enrichA ? 'Chargement…' : getFloorDisplay(txA, enrichA),
      valB: loading && !enrichB ? 'Chargement…' : getFloorDisplay(txB, enrichB),
      requiresEnrich: true,
    },
    {
      label: 'Performance énergétique (DPE / GES)',
      valA: loading && !enrichA ? 'Chargement…' : getDpeDisplay(enrichA),
      valB: loading && !enrichB ? 'Chargement…' : getDpeDisplay(enrichB),
      requiresEnrich: true,
    },
    {
      label: 'Construction & gabarit (BDNB / IGN)',
      valA:
        loading && !enrichA
          ? 'Chargement…'
          : [
              enrichA?.bdnb?.constructionYear ?? 'Année n/c',
              (enrichA?.bdnb?.floors ?? enrichA?.bdTopo?.subjectFloors)
                ? `${enrichA?.bdnb?.floors ?? enrichA?.bdTopo?.subjectFloors} niv.`
                : null,
              (enrichA?.bdTopo?.subjectHeightM ?? enrichA?.bdnb?.meanHeightM)
                ? `${enrichA?.bdTopo?.subjectHeightM ?? enrichA?.bdnb?.meanHeightM} m`
                : null,
            ]
              .filter(Boolean)
              .join(' · '),
      valB:
        loading && !enrichB
          ? 'Chargement…'
          : [
              enrichB?.bdnb?.constructionYear ?? 'Année n/c',
              (enrichB?.bdnb?.floors ?? enrichB?.bdTopo?.subjectFloors)
                ? `${enrichB?.bdnb?.floors ?? enrichB?.bdTopo?.subjectFloors} niv.`
                : null,
              (enrichB?.bdTopo?.subjectHeightM ?? enrichB?.bdnb?.meanHeightM)
                ? `${enrichB?.bdTopo?.subjectHeightM ?? enrichB?.bdnb?.meanHeightM} m`
                : null,
            ]
              .filter(Boolean)
              .join(' · '),
      requiresEnrich: true,
    },
    {
      label: 'Exposition / Traversant',
      valA:
        loading && !enrichA
          ? 'Chargement…'
          : enrichA?.bdnb?.traversing || enrichA?.luminosity?.crossLightLabel || envA?.luminosity.crossLightLabel || '—',
      valB:
        loading && !enrichB
          ? 'Chargement…'
          : enrichB?.bdnb?.traversing || enrichB?.luminosity?.crossLightLabel || envB?.luminosity.crossLightLabel || '—',
    },
    {
      label: 'Vis-à-vis pondéré (rue / cour)',
      valA: formatVis(visA, rueA, courA, Boolean(enrichA || envA)),
      valB: formatVis(visB, rueB, courB, Boolean(enrichB || envB)),
      highlight:
        (visA ?? 100) > (visB ?? 100) ? 'A' : (visB ?? 100) > (visA ?? 100) ? 'B' : null,
    },
    {
      label: 'Dégagement ciel & Luminosité',
      valA: `${skyA !== null ? `${skyA} % ciel · ` : ''}${lumA !== null ? `${lumA}/100` : '—'}`,
      valB: `${skyB !== null ? `${skyB} % ciel · ` : ''}${lumB !== null ? `${lumB}/100` : '—'}`,
      delta: lumA !== null && lumB !== null ? `${lumA - lumB > 0 ? '+' : ''}${lumA - lumB} pts` : undefined,
      highlight: lumA !== null && lumB !== null ? (lumA > lumB ? 'A' : lumB > lumA ? 'B' : null) : null,
    },
    {
      label: 'Ensoleillement PVGIS (horizon)',
      valA:
        loading && !enrichA
          ? 'Chargement…'
          : enrichA?.solar?.annualIrradiationKwhSqm
          ? `${enrichA.solar.annualIrradiationKwhSqm} kWh/m²/an`
          : '—',
      valB:
        loading && !enrichB
          ? 'Chargement…'
          : enrichB?.solar?.annualIrradiationKwhSqm
          ? `${enrichB.solar.annualIrradiationKwhSqm} kWh/m²/an`
          : '—',
    },
    {
      label: 'Annexes & Distance au centre',
      valA: `${txA.dependanceCount > 0 ? `${txA.dependanceCount} annexe(s)` : 'Sans annexe'} · ${txA.distanceMeters} m`,
      valB: `${txB.dependanceCount > 0 ? `${txB.dependanceCount} annexe(s)` : 'Sans annexe'} · ${txB.distanceMeters} m`,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-slate-900/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compare-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] bg-white border border-slate-200 rounded-lg flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 bg-white">
          <div>
            <h3 id="compare-modal-title" className="text-base font-bold text-slate-900">
              Comparatif côte à côte — Bien A vs Bien B
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Croisement des caractéristiques DVF, DPE ADEME, BDNB et vis-à-vis IGN BD TOPO
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le comparatif"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary Header Cards */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { label: 'Bien A', tx: txA, color: '#1D4ED8', lum: lumA },
            { label: 'Bien B', tx: txB, color: '#0F766E', lum: lumB },
          ].map(({ label, tx, color, lum }) => (
            <div key={tx.id} className="bg-white border border-slate-200 rounded-md p-3.5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-mono font-bold" style={{ color }}>
                  {label} · {formatDateFr(tx.dateMutation)}
                </div>
                <div className="text-sm font-bold text-slate-900 truncate mt-0.5">{tx.address}</div>
                <div className="text-xs text-slate-600 font-mono tabular-nums mt-1">
                  {tx.roomLabel} · {formatSurface(tx.surfaceBati)} ·{' '}
                  <strong className="text-slate-900">{formatPricePerSqm(tx.pricePerSqm)}</strong>
                  {lum !== null ? ` · Lum. ${lum}/100` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onInspectTransaction(tx);
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#1D4ED8] hover:underline whitespace-nowrap shrink-0"
              >
                Fiche 3D <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Comparison Table */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                <th className="py-2 pr-4 text-left w-[30%]">Critère</th>
                <th className="py-2 px-3 text-left w-[27%] text-[#1D4ED8]">Bien A ({txA.address.split(' ')[0]}…)</th>
                <th className="py-2 px-3 text-left w-[27%] text-[#0F766E]">Bien B ({txB.address.split(' ')[0]}…)</th>
                <th className="py-2 pl-3 text-right w-[16%]">Écart A − B</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.label} className="hover:bg-slate-50/70">
                  <td className="py-2.5 pr-4 font-medium text-slate-600">{row.label}</td>
                  <td
                    className={`py-2.5 px-3 font-mono tabular-nums ${
                      row.highlight === 'A' ? 'font-bold text-[#1D4ED8]' : 'text-slate-900'
                    }`}
                  >
                    {row.valA}
                  </td>
                  <td
                    className={`py-2.5 px-3 font-mono tabular-nums ${
                      row.highlight === 'B' ? 'font-bold text-[#0F766E]' : 'text-slate-900'
                    }`}
                  >
                    {row.valB}
                  </td>
                  <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-slate-600">
                    {row.delta ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500">
            Astuce : cliquez sur « Fiche 3D » pour ouvrir l’analyse complète d’un des deux biens.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
