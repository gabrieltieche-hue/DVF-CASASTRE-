import { AlertCircle, Download } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DvfChart } from './components/DvfChart';
import { DvfCompareModal } from './components/DvfCompareModal';
import { DvfDetailDrawer } from './components/DvfDetailDrawer';
import { DvfEnvironmentPanel } from './components/DvfEnvironmentPanel';
import { DvfMap } from './components/DvfMap';
import { DvfTable, type RoomFilter } from './components/DvfTable';
import { FilterSidebar, type ExtractionFormState } from './components/FilterSidebar';
import {
  computeSummaryStats,
  transactionsToCsv,
  type DvfExtractionResult,
  type DvfTransaction,
} from './lib/dvf';
import type { SectorEnvironmentSummary, VisibilityCategory } from './lib/enrichment';
import { formatEuros, formatPricePerSqm, formatSurface } from './utils/format';

const DEFAULT_FORM_STATE: ExtractionFormState = {
  address: '70 Rue Olivier de Serres, 75015 Paris',
  radiusMeters: '200',
  minSurface: '35',
  maxSurface: '45',
  rooms: [1, 2],
  years: [2021, 2022, 2023, 2024, 2025],
  includeBlockSales: false,
};

export default function App() {
  const [formState, setFormState] = useState<ExtractionFormState>(DEFAULT_FORM_STATE);
  const [result, setResult] = useState<DvfExtractionResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTx, setSelectedTx] = useState<DvfTransaction | null>(null);
  const [inspectedTx, setInspectedTx] = useState<DvfTransaction | null>(null);
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState<string>(
    () => (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || ''
  );
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState<boolean>(false);

  // Instant client-side sub-filters on the extracted result
  const [roomFilter, setRoomFilter] = useState<RoomFilter>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | VisibilityCategory>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Sector 3D visibility & luminosity analysis (IGN BD TOPO batch)
  const [sectorEnv, setSectorEnv] = useState<SectorEnvironmentSummary | null>(null);
  const [envLoading, setEnvLoading] = useState<boolean>(false);

  // Side-by-side comparison state (max 2 transactions)
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState<boolean>(false);

  const runExtraction = useCallback(async (params: ExtractionFormState) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        address: params.address.trim(),
        radius: params.radiusMeters,
        minSurface: params.minSurface,
        maxSurface: params.maxSurface,
        rooms: params.rooms.join(','),
        years: params.years.join(','),
        includeBlockSales: String(params.includeBlockSales),
      });

      const res = await fetch(`/api/dvf/extract?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || `Erreur HTTP ${res.status}`);
      }

      setResult(json as DvfExtractionResult);
      setRoomFilter('all');
      setVisibilityFilter('all');
      setSearchQuery('');
      setSelectedTx(null);
      setInspectedTx(null);
      setCompareIds([]);
      setCompareOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur lors de l’extraction DVF.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runExtraction(DEFAULT_FORM_STATE);
  }, [runExtraction]);

  useEffect(() => {
    const onQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  useEffect(() => {
    if (googleMapsApiKey) return;
    let cancelled = false;
    fetch('/api/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { googleMapsApiKey?: string } | null) => {
        if (!cancelled && data?.googleMapsApiKey) {
          setGoogleMapsApiKey(data.googleMapsApiKey);
        }
      })
      .catch(() => {
        // Ignore transient config read errors; handled by map fallback state
      });
    return () => {
      cancelled = true;
    };
  }, [googleMapsApiKey]);

  const handleReset = useCallback(() => {
    setFormState(DEFAULT_FORM_STATE);
    runExtraction(DEFAULT_FORM_STATE);
  }, [runExtraction]);

  // Fetch batch IGN BD TOPO 3D vis-a-vis & luminosity summary for extracted transactions
  useEffect(() => {
    if (!result || result.transactions.length === 0) {
      setSectorEnv(null);
      return;
    }

    let cancelled = false;
    setEnvLoading(true);

    fetch('/api/dvf/environment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        centerLat: result.center.latitude,
        centerLon: result.center.longitude,
        radiusMeters: result.query.radiusMeters,
        items: result.transactions.map((t) => ({
          id: t.id,
          lat: t.latitude,
          lon: t.longitude,
        })),
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SectorEnvironmentSummary | null) => {
        if (!cancelled && data) {
          setSectorEnv(data);
        }
      })
      .catch(() => {
        // Non-blocking enrichment: keep DVF workspace functional if IGN WFS times out
      })
      .finally(() => {
        if (!cancelled) setEnvLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [result]);

  const handleToggleCompare = useCallback((tx: DvfTransaction) => {
    setCompareIds((prev) => {
      if (prev.includes(tx.id)) {
        return prev.filter((id) => id !== tx.id);
      }
      if (prev.length >= 2) {
        return [prev[1], tx.id];
      }
      return [...prev, tx.id];
    });
  }, []);

  const comparePair = useMemo<[DvfTransaction, DvfTransaction] | null>(() => {
    if (!result || compareIds.length < 2) return null;
    const a = result.transactions.find((t) => t.id === compareIds[0]);
    const b = result.transactions.find((t) => t.id === compareIds[1]);
    return a && b ? [a, b] : null;
  }, [result, compareIds]);

  const filteredTransactions = useMemo(() => {
    if (!result) return [];
    const q = searchQuery.trim().toLowerCase();
    return result.transactions.filter((tx) => {
      if (roomFilter === '1' && tx.rooms !== 1) return false;
      if (roomFilter === '2' && tx.rooms !== 2) return false;
      if (visibilityFilter !== 'all' && sectorEnv) {
        const env = sectorEnv.byTransactionId[tx.id];
        if (!env || env.visibilityCategory !== visibilityFilter) return false;
      }
      if (!q) return true;
      return (
        tx.address.toLowerCase().includes(q) ||
        tx.parcelId.toLowerCase().includes(q) ||
        tx.idMutation.toLowerCase().includes(q) ||
        tx.natureMutation.toLowerCase().includes(q) ||
        String(tx.year).includes(q)
      );
    });
  }, [result, roomFilter, visibilityFilter, sectorEnv, searchQuery]);

  const activeStats = useMemo(
    () => computeSummaryStats(filteredTransactions),
    [filteredTransactions]
  );

  function handleExportCsv() {
    if (filteredTransactions.length === 0) return;
    const csv = transactionsToCsv(filteredTransactions);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeCity = result?.center.postalCode || 'dvf';
    a.download = `dvf-${safeCity}-rayon-${result?.query.radiusMeters ?? 200}m.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const activeCenterLabel = result?.center.label || formState.address;
  const activeRadius = result?.query.radiusMeters ?? (Number(formState.radiusMeters) || 200);
  const activeMinSurf = result?.query.minSurface ?? (Number(formState.minSurface) || 35);
  const activeMaxSurf = result?.query.maxSurface ?? (Number(formState.maxSurface) || 45);

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Strict 3-zone Top Bar Contract */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-8 sticky top-0 z-30">
        <a
          href="#synthese"
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          DVF Cadastre
        </a>

        <nav
          aria-label="Sections principales"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
        >
          <a href="#synthese" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
            Synthèse
          </a>
          <a href="#carte" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
            Carte
          </a>
          <a href="#analyse" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
            Analyse €/m²
          </a>
          <a href="#visibilite" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
            Visibilité & Lumière
          </a>
          <a href="#transactions" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
            Transactions
          </a>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={loading || filteredTransactions.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Exporter CSV
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row">
        <FilterSidebar
          form={formState}
          onChange={setFormState}
          onSubmit={runExtraction}
          onReset={handleReset}
          loading={loading}
          excludedBlockSalesCount={result?.excludedBlockSalesCount ?? 0}
        />

        <main className="flex-1 min-w-0 p-4 sm:p-6 space-y-6 max-w-[1440px]">
          {/* Contextual header */}
          <div id="synthese" className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight text-balance">
              Transactions DVF — {activeCenterLabel}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Rayon {activeRadius} m
              <span aria-hidden="true"> · </span>
              Appartements {formState.rooms.map((r) => (r === 1 ? 'Studio (1P)' : `${r} pièces`)).join(' & ')}
              <span aria-hidden="true"> · </span>
              {activeMinSurf}–{activeMaxSurf} m²
              <span aria-hidden="true"> · </span>
              Source DGFiP / Etalab Geo-DVF
              {result && result.yearsLoaded.length > 0 && (
                <>
                  <span aria-hidden="true"> · </span>
                  Millésimes {result.yearsLoaded[0]}–{result.yearsLoaded[result.yearsLoaded.length - 1]}
                </>
              )}
            </p>
          </div>

          {/* Error state */}
          {error && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-900"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Échec de l’extraction DVF</p>
                  <p className="text-xs text-red-800 mt-0.5">{error}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => runExtraction(formState)}
                className="px-3 py-1.5 text-xs font-medium bg-white border border-red-200 text-red-800 hover:bg-red-100 rounded-md transition-colors whitespace-nowrap"
              >
                Réessayer
              </button>
            </div>
          )}

          {/* 4-column flat KPI strip */}
          <section
            aria-label="Indicateurs synthétiques"
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white border border-slate-200 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200"
          >
            <div className="p-4 sm:p-5">
              <div className="text-xs font-medium text-slate-500">Transactions extraites</div>
              <div
                className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1"
                data-testid="kpi-count"
              >
                {loading ? '—' : activeStats.count}
              </div>
              <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                {loading
                  ? 'Interrogation Etalab…'
                  : `${activeStats.studioCount} studio${activeStats.studioCount > 1 ? 's' : ''} · ${activeStats.twoRoomCount} deux-pièces`}
              </div>
            </div>

            <div className="p-4 sm:p-5">
              <div className="text-xs font-medium text-slate-500">Prix médian / m²</div>
              <div
                className="text-2xl font-bold font-mono tabular-nums text-[#1D4ED8] mt-1"
                data-testid="kpi-median-sqm"
              >
                {loading ? '—' : formatPricePerSqm(activeStats.medianPricePerSqm)}
              </div>
              <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                {loading ? 'Calcul en cours…' : `Moyenne ${formatPricePerSqm(activeStats.meanPricePerSqm)}`}
              </div>
            </div>

            <div className="p-4 sm:p-5">
              <div className="text-xs font-medium text-slate-500">Fourchette observée / m²</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {loading || activeStats.minPricePerSqm === null
                  ? '—'
                  : `${new Intl.NumberFormat('fr-FR').format(activeStats.minPricePerSqm)} – ${new Intl.NumberFormat('fr-FR').format(activeStats.maxPricePerSqm ?? 0)} €`}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Étendue min – max sur le périmètre
              </div>
            </div>

            <div className="p-4 sm:p-5">
              <div className="text-xs font-medium text-slate-500">Prix médian d’acquisition</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                {loading ? '—' : formatEuros(activeStats.medianPrice)}
              </div>
              <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                {loading ? '—' : `Surface moyenne ${formatSurface(activeStats.meanSurface)}`}
              </div>
            </div>
          </section>

          {/* Map & Analytics Split */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-7 flex flex-col">
              <DvfMap
                apiKey={googleMapsApiKey}
                center={result?.center ?? null}
                radiusMeters={activeRadius}
                transactions={filteredTransactions}
                selectedId={inspectedTx?.id ?? selectedTx?.id ?? null}
                onSelectTransaction={setSelectedTx}
                onInspectTransaction={(tx) => {
                  setSelectedTx(tx);
                  setInspectedTx(tx);
                }}
                loading={loading}
              />
            </div>

            <div className="lg:col-span-5 flex flex-col">
              <DvfChart
                transactions={filteredTransactions}
                yearlyTrends={activeStats.yearlyTrends}
                medianPricePerSqm={activeStats.medianPricePerSqm}
                selectedId={inspectedTx?.id ?? selectedTx?.id ?? null}
                onSelectTransaction={(tx) => {
                  setSelectedTx(tx);
                  setInspectedTx(tx);
                }}
                minSurface={activeMinSurf}
                maxSurface={activeMaxSurf}
              />
            </div>
          </div>

          {/* Visibilité (Vis-à-vis) & Luminosité Charts */}
          <DvfEnvironmentPanel
            summary={sectorEnv}
            loading={loading || envLoading}
            selectedTx={inspectedTx ?? selectedTx}
            activeVisibilityFilter={visibilityFilter}
            onFilterByVisibility={setVisibilityFilter}
          />

          {/* Full DVF Table */}
          <DvfTable
            transactions={result?.transactions ?? []}
            selectedId={inspectedTx?.id ?? selectedTx?.id ?? null}
            onSelectTransaction={(tx) => {
              setSelectedTx(tx);
              setInspectedTx(tx);
            }}
            roomFilter={roomFilter}
            onRoomFilterChange={setRoomFilter}
            visibilityFilter={visibilityFilter}
            onVisibilityFilterChange={setVisibilityFilter}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            loading={loading}
            onResetFilters={handleReset}
            compareIds={compareIds}
            onToggleCompare={handleToggleCompare}
            onOpenCompare={() => setCompareOpen(true)}
            onClearCompare={() => {
              setCompareIds([]);
              setCompareOpen(false);
            }}
            environmentSummary={sectorEnv}
          />
        </main>
      </div>

      <DvfDetailDrawer
        transaction={inspectedTx}
        allTransactions={result?.transactions ?? []}
        sectorMedianPricePerSqm={activeStats.medianPricePerSqm}
        environmentSummary={sectorEnv}
        centerLabel={activeCenterLabel}
        onSelectComparable={(tx) => {
          setSelectedTx(tx);
          setInspectedTx(tx);
        }}
        onClose={() => setInspectedTx(null)}
      />

      <DvfCompareModal
        transactions={compareOpen ? comparePair : null}
        sectorMedianPricePerSqm={activeStats.medianPricePerSqm}
        environmentSummary={sectorEnv}
        onClose={() => setCompareOpen(false)}
        onInspectTransaction={(tx) => {
          setSelectedTx(tx);
          setInspectedTx(tx);
        }}
      />
    </div>
  );
}
