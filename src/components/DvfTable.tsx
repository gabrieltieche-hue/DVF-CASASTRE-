import { ArrowDown, ArrowUp, ArrowUpDown, Scale, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DvfTransaction } from '../lib/dvf';
import type { SectorEnvironmentSummary, VisibilityCategory } from '../lib/enrichment';
import { formatDateFr, formatEuros, formatPricePerSqm, formatSurface } from '../utils/format';

export type SortField =
  | 'dateMutation'
  | 'address'
  | 'rooms'
  | 'surfaceBati'
  | 'valeurFonciere'
  | 'pricePerSqm'
  | 'distanceMeters';

export type RoomFilter = 'all' | '1' | '2';

interface DvfTableProps {
  transactions: DvfTransaction[];
  selectedId: string | null;
  onSelectTransaction: (tx: DvfTransaction) => void;
  roomFilter: RoomFilter;
  onRoomFilterChange: (filter: RoomFilter) => void;
  visibilityFilter?: 'all' | VisibilityCategory;
  onVisibilityFilterChange?: (filter: 'all' | VisibilityCategory) => void;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  loading: boolean;
  onResetFilters: () => void;
  compareIds: string[];
  onToggleCompare: (tx: DvfTransaction) => void;
  onOpenCompare: () => void;
  onClearCompare: () => void;
  environmentSummary?: SectorEnvironmentSummary | null;
}

const VISIBILITY_LABEL: Record<VisibilityCategory, { text: string; colorClass: string }> = {
  proche: { text: 'Proche', colorClass: 'text-amber-700' },
  modere: { text: 'Modéré', colorClass: 'text-[#1D4ED8]' },
  degage: { text: 'Dégagé', colorClass: 'text-[#0F766E]' },
};

export function DvfTable({
  transactions,
  selectedId,
  onSelectTransaction,
  roomFilter,
  onRoomFilterChange,
  visibilityFilter = 'all',
  onVisibilityFilterChange,
  searchQuery,
  onSearchQueryChange,
  loading,
  onResetFilters,
  compareIds,
  onToggleCompare,
  onOpenCompare,
  onClearCompare,
  environmentSummary,
}: DvfTableProps) {
  const [sortField, setSortField] = useState<SortField>('dateMutation');
  const [sortAsc, setSortAsc] = useState(false);

  const counts = useMemo(() => {
    const studio = transactions.filter((t) => t.rooms === 1).length;
    const twoRoom = transactions.filter((t) => t.rooms === 2).length;
    return { all: transactions.length, studio, twoRoom };
  }, [transactions]);

  const compareTxs = useMemo(() => {
    return compareIds
      .map((id) => transactions.find((t) => t.id === id))
      .filter((t): t is DvfTransaction => Boolean(t));
  }, [compareIds, transactions]);

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = transactions.filter((tx) => {
      if (roomFilter === '1' && tx.rooms !== 1) return false;
      if (roomFilter === '2' && tx.rooms !== 2) return false;
      if (visibilityFilter !== 'all' && environmentSummary) {
        const env = environmentSummary.byTransactionId[tx.id];
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

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'dateMutation') {
        cmp = a.dateMutation.localeCompare(b.dateMutation);
      } else if (sortField === 'address') {
        cmp = a.address.localeCompare(b.address, 'fr');
      } else {
        cmp = (a[sortField] as number) - (b[sortField] as number);
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [
    transactions,
    roomFilter,
    visibilityFilter,
    environmentSummary,
    searchQuery,
    sortField,
    sortAsc,
  ]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(field === 'address' || field === 'distanceMeters');
    }
  }

  function renderSortIcon(field: SortField) {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />;
    }
    return sortAsc ? (
      <ArrowUp className="w-3.5 h-3.5 text-[#1D4ED8] shrink-0" aria-hidden="true" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-[#1D4ED8] shrink-0" aria-hidden="true" />
    );
  }

  return (
    <section
      id="transactions"
      className="bg-white border border-slate-200 rounded-lg overflow-hidden"
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Registre des transactions DVF
          </h2>
          <div
            className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md"
            role="group"
            aria-label="Filtrer par typologie"
          >
            <button
              type="button"
              onClick={() => onRoomFilterChange('all')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                roomFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Toutes ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => onRoomFilterChange('2')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                roomFilter === '2'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              2 pièces ({counts.twoRoom})
            </button>
            <button
              type="button"
              onClick={() => onRoomFilterChange('1')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                roomFilter === '1'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Studio 1P ({counts.studio})
            </button>
          </div>

          {visibilityFilter !== 'all' && onVisibilityFilterChange && (
            <button
              type="button"
              onClick={() => onVisibilityFilterChange('all')}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#1D4ED8] bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
            >
              Vis-à-vis : {VISIBILITY_LABEL[visibilityFilter].text}
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="relative w-full sm:w-64">
          <Search
            className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <label htmlFor="table-search" className="sr-only">
            Filtrer par rue, parcelle ou année
          </label>
          <input
            id="table-search"
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Rue, parcelle, VEFA ou année…"
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#1D4ED8] focus:bg-white transition-colors"
          />
        </div>
      </div>

      {/* Side-by-side comparison selection bar */}
      {compareTxs.length > 0 && (
        <div
          className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3"
          role="region"
          aria-label="Sélection pour comparaison"
        >
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
              <Scale className="w-3.5 h-3.5 text-[#1D4ED8]" aria-hidden="true" />
              Comparatif ({compareTxs.length}/2) :
            </span>
            {compareTxs.map((tx, idx) => (
              <span
                key={tx.id}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-800"
              >
                <span className="font-mono font-bold text-[#1D4ED8]">
                  {idx === 0 ? 'A' : 'B'}
                </span>
                <span className="font-medium truncate max-w-[180px]">{tx.address}</span>
                <span className="font-mono text-slate-500">{formatSurface(tx.surfaceBati)}</span>
                <button
                  type="button"
                  onClick={() => onToggleCompare(tx)}
                  aria-label={`Retirer ${tx.address} de la comparaison`}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              </span>
            ))}
            {compareTxs.length === 1 && (
              <span className="text-slate-500">
                Sélectionnez un 2e bien dans le tableau pour lancer le comparatif.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClearCompare}
              className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Réinitialiser
            </button>
            <button
              type="button"
              onClick={onOpenCompare}
              disabled={compareTxs.length < 2}
              className="px-3 py-1.5 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-45 rounded-md transition-colors whitespace-nowrap"
            >
              Comparer côte à côte
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600">
              <th className="py-2.5 px-4 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleSort('dateMutation')}
                  className="inline-flex items-center gap-1 hover:text-slate-900"
                >
                  Date {renderSortIcon('dateMutation')}
                </button>
              </th>
              <th className="py-2.5 px-4 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleSort('address')}
                  className="inline-flex items-center gap-1 hover:text-slate-900"
                >
                  Adresse & parcelle {renderSortIcon('address')}
                </button>
              </th>
              <th className="py-2.5 px-4 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleSort('rooms')}
                  className="inline-flex items-center gap-1 hover:text-slate-900"
                >
                  Typologie {renderSortIcon('rooms')}
                </button>
              </th>
              <th className="py-2.5 px-4 text-right whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleSort('surfaceBati')}
                  className="inline-flex items-center justify-end gap-1 hover:text-slate-900 ml-auto"
                >
                  Surface {renderSortIcon('surfaceBati')}
                </button>
              </th>
              <th className="py-2.5 px-4 text-right whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleSort('valeurFonciere')}
                  className="inline-flex items-center justify-end gap-1 hover:text-slate-900 ml-auto"
                >
                  Valeur foncière {renderSortIcon('valeurFonciere')}
                </button>
              </th>
              <th className="py-2.5 px-4 text-right whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleSort('pricePerSqm')}
                  className="inline-flex items-center justify-end gap-1 hover:text-slate-900 ml-auto"
                >
                  Prix / m² {renderSortIcon('pricePerSqm')}
                </button>
              </th>
              <th className="py-2.5 px-4 text-right whitespace-nowrap">Vis-à-vis</th>
              <th className="py-2.5 px-4 text-right whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleSort('distanceMeters')}
                  className="inline-flex items-center justify-end gap-1 hover:text-slate-900 ml-auto"
                >
                  Distance {renderSortIcon('distanceMeters')}
                </button>
              </th>
              <th className="py-2.5 px-4 text-right whitespace-nowrap">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-[13px]">
            {loading ? (
              Array.from({ length: 6 }).map((_, idx) => (
                <tr key={idx} className="h-11">
                  <td className="px-4 py-2"><div className="h-3.5 w-20 bg-slate-100 rounded animate-pulse" /></td>
                  <td className="px-4 py-2"><div className="h-3.5 w-48 bg-slate-100 rounded animate-pulse" /></td>
                  <td className="px-4 py-2"><div className="h-3.5 w-20 bg-slate-100 rounded animate-pulse" /></td>
                  <td className="px-4 py-2"><div className="h-3.5 w-14 bg-slate-100 rounded animate-pulse ml-auto" /></td>
                  <td className="px-4 py-2"><div className="h-3.5 w-20 bg-slate-100 rounded animate-pulse ml-auto" /></td>
                  <td className="px-4 py-2"><div className="h-3.5 w-20 bg-slate-100 rounded animate-pulse ml-auto" /></td>
                  <td className="px-4 py-2"><div className="h-3.5 w-14 bg-slate-100 rounded animate-pulse ml-auto" /></td>
                  <td className="px-4 py-2"><div className="h-3.5 w-12 bg-slate-100 rounded animate-pulse ml-auto" /></td>
                  <td className="px-4 py-2"><div className="h-3.5 w-20 bg-slate-100 rounded animate-pulse ml-auto" /></td>
                </tr>
              ))
            ) : filteredAndSorted.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center">
                  <p className="text-sm font-medium text-slate-800">
                    Aucune transaction trouvée pour ces critères.
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Élargissez le rayon, la plage de surface ou réinitialisez les filtres.
                  </p>
                  <button
                    type="button"
                    onClick={onResetFilters}
                    className="mt-4 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-md transition-colors"
                  >
                    Réinitialiser les critères
                  </button>
                </td>
              </tr>
            ) : (
              filteredAndSorted.map((tx) => {
                const isSelected = tx.id === selectedId;
                const compareIdx = compareIds.indexOf(tx.id);
                const isVefa = tx.natureMutation.toLowerCase().includes('futur');
                const env = environmentSummary?.byTransactionId[tx.id] ?? null;

                return (
                  <tr
                    key={tx.id}
                    className={`h-11 transition-colors cursor-pointer ${
                      compareIdx !== -1
                        ? 'bg-blue-50/40'
                        : isSelected
                        ? 'bg-blue-50/70'
                        : 'hover:bg-slate-50'
                    }`}
                    onClick={() => onSelectTransaction(tx)}
                  >
                    <td className="px-4 py-2 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      <div>{formatDateFr(tx.dateMutation)}</div>
                      {isVefa && (
                        <div className="text-[10px] font-sans font-semibold text-[#0F766E]">
                          VEFA (neuf)
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-medium text-slate-900 leading-tight">{tx.address}</div>
                      <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                        {tx.postalCode} · Parcelle {tx.parcelId || '—'}
                        {tx.dependanceCount > 0 ? ` · +${tx.dependanceCount} annexe${tx.dependanceCount > 1 ? 's' : ''}` : ''}
                        {tx.isBlockSale ? ` · Vente en bloc (${tx.mainUnitsInMutation} lots)` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span
                        className={`text-xs font-medium ${
                          tx.rooms === 1 ? 'text-[#0F766E]' : 'text-[#1D4ED8]'
                        }`}
                      >
                        {tx.roomLabel}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                      <div>{formatSurface(tx.surfaceBati)}</div>
                      {tx.surfaceCarrez !== null && (
                        <div className="text-[11px] text-slate-500">
                          Carrez {formatSurface(tx.surfaceCarrez)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                      {formatEuros(tx.valeurFonciere)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {formatPricePerSqm(tx.pricePerSqm)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                      {env ? (
                        <div>
                          <div className="text-xs font-semibold text-slate-800">
                            {env.effectiveVisAVisM !== null
                              ? `${env.effectiveVisAVisM} m`
                              : env.principalVisAVisM !== null
                              ? `${env.principalVisAVisM} m`
                              : '> 100 m'}
                          </div>
                          <div className={`text-[10px] font-sans font-medium ${VISIBILITY_LABEL[env.visibilityCategory].colorClass}`}>
                            {VISIBILITY_LABEL[env.visibilityCategory].text} · {env.luminosity.score}/100
                          </div>
                          {env.closestVisAVisM !== null &&
                          env.principalVisAVisM !== env.closestVisAVisM && (
                            <div className="text-[10px] text-slate-500">
                              Rue {env.principalVisAVisM !== null ? `${env.principalVisAVisM}m` : '>100m'} · Cour {env.closestVisAVisM}m
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {tx.distanceMeters} m
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleCompare(tx);
                          }}
                          aria-pressed={compareIdx !== -1}
                          aria-label={
                            compareIdx !== -1
                              ? `Retirer ${tx.address} de la comparaison`
                              : `Comparer ${tx.address}`
                          }
                          className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors ${
                            compareIdx !== -1
                              ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {compareIdx === 0 ? 'Bien A' : compareIdx === 1 ? 'Bien B' : 'Comparer'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectTransaction(tx);
                          }}
                          aria-label={`Inspecter la transaction du ${formatDateFr(tx.dateMutation)} à ${tx.address}`}
                          className="text-xs font-medium text-[#1D4ED8] hover:text-[#1E40AF] hover:underline"
                        >
                          Détails
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
