import type { DvfTransaction } from '../lib/dvf';
import type { SectorEnvironmentSummary } from '../lib/enrichment';

interface DvfEnvironmentPanelProps {
  summary: SectorEnvironmentSummary | null;
  loading: boolean;
  selectedTx: DvfTransaction | null;
  onFilterByVisibility?: (category: 'all' | 'proche' | 'modere' | 'degage') => void;
  activeVisibilityFilter?: 'all' | 'proche' | 'modere' | 'degage';
}

export function DvfEnvironmentPanel({
  summary,
  loading,
  selectedTx,
  onFilterByVisibility,
  activeVisibilityFilter = 'all',
}: DvfEnvironmentPanelProps) {
  const selectedEnv =
    selectedTx && summary ? summary.byTransactionId[selectedTx.id] ?? null : null;

  const bucketColor: Record<'proche' | 'modere' | 'degage', string> = {
    proche: '#D97706',
    modere: '#1D4ED8',
    degage: '#0F766E',
  };

  const maxBucketCount = summary
    ? Math.max(1, ...summary.visibilityBuckets.map((b) => b.count))
    : 1;

  const activeScore = selectedEnv ? selectedEnv.luminosity.score : summary?.medianLuminosity ?? 0;
  const sectorMedian = summary?.medianLuminosity ?? 0;
  const sectorQ3 = summary?.q3Luminosity ?? 0;

  const deltaLum = selectedEnv ? selectedEnv.luminosity.score - sectorMedian : 0;

  return (
    <section
      id="visibilite"
      aria-label="Analyse de visibilité et luminosité du secteur"
      className="grid grid-cols-1 lg:grid-cols-2 gap-6"
    >
      {/* Chart 1: Visibilité & Absence de Vis-à-Vis */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Visibilité & absence de vis-à-vis (IGN BD TOPO · Lambert-93)
            </h2>
            <p className="text-xs text-slate-500">
              Répartition des {summary?.totalAnalyzed ?? '—'} biens (exposition pondérée rue &amp; cour)
            </p>
          </div>
          {activeVisibilityFilter !== 'all' && onFilterByVisibility && (
            <button
              type="button"
              onClick={() => onFilterByVisibility('all')}
              className="text-xs font-medium text-[#1D4ED8] hover:underline whitespace-nowrap shrink-0"
            >
              Afficher tous
            </button>
          )}
        </div>

        <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
          {loading && !summary ? (
            <div className="space-y-3 py-4">
              <div className="h-9 bg-slate-100 rounded animate-pulse" />
              <div className="h-9 bg-slate-100 rounded animate-pulse" />
              <div className="h-9 bg-slate-100 rounded animate-pulse" />
            </div>
          ) : !summary || summary.totalAnalyzed === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              Données 3D IGN indisponibles pour ce périmètre.
            </div>
          ) : (
            <>
              <div className="space-y-3.5">
                {summary.visibilityBuckets.map((bucket) => {
                  const barPct = Math.round((bucket.count / maxBucketCount) * 100);
                  const isSelectedCat = selectedEnv?.visibilityCategory === bucket.category;
                  const isFiltered = activeVisibilityFilter === bucket.category;
                  const color = bucketColor[bucket.category];

                  return (
                    <div key={bucket.category} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() =>
                              onFilterByVisibility?.(
                                activeVisibilityFilter === bucket.category ? 'all' : bucket.category
                              )
                            }
                            className={`text-left font-medium transition-colors hover:underline ${
                              isFiltered ? 'text-[#1D4ED8]' : 'text-slate-900'
                            }`}
                          >
                            {bucket.label}
                          </button>
                          <span className="text-[11px] text-slate-500 ml-2 hidden sm:inline">
                            {bucket.sublabel}
                          </span>
                        </div>
                        <div className="font-mono tabular-nums text-slate-900 whitespace-nowrap shrink-0">
                          <span className="font-semibold">{bucket.count}</span>
                          <span className="text-slate-500 ml-1">({bucket.pct} %)</span>
                        </div>
                      </div>

                      <div className="relative h-6 bg-slate-100 rounded overflow-hidden flex items-center">
                        <div
                          className="h-full rounded transition-all"
                          style={{
                            width: `${Math.max(bucket.count > 0 ? 4 : 0, barPct)}%`,
                            backgroundColor: color,
                            opacity: isFiltered || !selectedEnv || isSelectedCat ? 0.9 : 0.45,
                          }}
                        />
                        {isSelectedCat && selectedEnv && (
                          <span className="ml-2 text-[11px] font-mono font-semibold text-slate-900 whitespace-nowrap pr-2">
                            Bien sélectionné :{' '}
                            {selectedEnv.effectiveVisAVisM !== null
                              ? `${selectedEnv.effectiveVisAVisM} m`
                              : selectedEnv.principalVisAVisM !== null
                              ? `${selectedEnv.principalVisAVisM} m`
                              : '> 100 m'}
                            {selectedEnv.closestVisAVisM !== null &&
                            selectedEnv.principalVisAVisM !== selectedEnv.closestVisAVisM
                              ? ` (max ${selectedEnv.principalVisAVisM !== null ? `${selectedEnv.principalVisAVisM} m` : '>100m'} · cour ${selectedEnv.closestVisAVisM} m)`
                              : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <span className="font-mono tabular-nums">
                  Recul médian secteur :{' '}
                  <strong className="text-slate-900">
                    {summary.medianVisAVisM !== null ? `${summary.medianVisAVisM} m` : '—'}
                  </strong>
                </span>
                {(() => {
                  const degage = summary.visibilityBuckets.find((b) => b.category === 'degage');
                  return (
                    <span className="font-mono tabular-nums text-[#0F766E] font-medium">
                      Vue dégagée (&gt; 16 m) : {degage?.count ?? 0} bien
                      {(degage?.count ?? 0) > 1 ? 's' : ''} ({degage?.pct ?? 0} %)
                    </span>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Chart 2: Luminosité Naturelle (Secteur & Impact du Vis-à-Vis / Traversant) */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Luminosité naturelle vs secteur & vis-à-vis
            </h2>
            <p className="text-xs text-slate-500">
              {selectedTx
                ? `Comparaison de ${selectedTx.address} face aux biens du périmètre`
                : 'Impact du vis-à-vis et du caractère traversant sur l’apport solaire'}
            </p>
          </div>
          {summary && summary.totalAnalyzed > 0 && (
            <div className="font-mono tabular-nums text-xs font-semibold text-slate-900">
              {selectedEnv ? `${activeScore}/100` : `Médiane ${sectorMedian}/100`}
            </div>
          )}
        </div>

        <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
          {loading && !summary ? (
            <div className="space-y-3 py-4">
              <div className="h-24 bg-slate-100 rounded animate-pulse" />
              <div className="h-12 bg-slate-100 rounded animate-pulse" />
            </div>
          ) : !summary || summary.totalAnalyzed === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              Données d’ensoleillement et masques indisponibles.
            </div>
          ) : (
            <>
              {/* Benchmark Bar: Selected property vs Sector Median vs Top 25% */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-800">
                    {selectedTx
                      ? `Position de ${selectedTx.address}`
                      : 'Indice moyen du secteur (sélectionnez un bien pour comparer)'}
                  </span>
                  {selectedEnv && (
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        deltaLum >= 5
                          ? 'text-[#0F766E]'
                          : deltaLum <= -5
                          ? 'text-amber-700'
                          : 'text-slate-700'
                      }`}
                    >
                      {deltaLum >= 0 ? `+${deltaLum}` : deltaLum} pts vs médiane
                    </span>
                  )}
                </div>

                {/* Scale Bar 0-100 */}
                <div className="relative h-7 bg-slate-100 rounded overflow-hidden">
                  {/* Sector Q3 marker */}
                  <div
                    className="absolute top-0 bottom-0 border-r-2 border-dashed border-[#0F766E]/70 z-10"
                    style={{ left: `${sectorQ3}%` }}
                    title={`Top 25 % secteur (Q3) : ${sectorQ3}/100`}
                  />
                  {/* Sector Median marker */}
                  <div
                    className="absolute top-0 bottom-0 border-r-2 border-slate-900/70 z-10"
                    style={{ left: `${sectorMedian}%` }}
                    title={`Médiane secteur : ${sectorMedian}/100`}
                  />
                  {/* Active property or sector median bar */}
                  <div
                    className="h-full rounded transition-all"
                    style={{
                      width: `${activeScore}%`,
                      backgroundColor:
                        activeScore >= sectorQ3
                          ? '#0F766E'
                          : activeScore < sectorMedian - 5
                          ? '#D97706'
                          : '#1D4ED8',
                    }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-500">
                  <span>0 (Très enclavé)</span>
                  <span>
                    Médiane secteur : <strong className="text-slate-800">{sectorMedian}</strong> · Top 25 % :{' '}
                    <strong className="text-[#0F766E]">{sectorQ3}</strong>
                  </span>
                  <span>100 (Plein ciel)</span>
                </div>
              </div>

              {/* Impact of Vis-a-Vis on Average Luminosity */}
              <div className="pt-2 border-t border-slate-100">
                <div className="text-[11px] font-medium text-slate-600 mb-2">
                  Luminosité moyenne observée selon la proximité du vis-à-vis :
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  {summary.visibilityBuckets.map((b) => (
                    <div
                      key={b.category}
                      className="border border-slate-200 rounded px-2.5 py-2 bg-slate-50/70"
                    >
                      <div className="text-[11px] text-slate-500 truncate">
                        {b.category === 'proche'
                          ? 'Proche (< 9 m)'
                          : b.category === 'modere'
                          ? 'Modéré (9–16 m)'
                          : 'Dégagé (> 16 m)'}
                      </div>
                      <div className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                        {b.avgLuminosity !== null ? `${b.avgLuminosity}/100` : '—'}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {b.count} bien{b.count > 1 ? 's' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedEnv && (
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <span>
                    Ciel dégagé : <strong className="font-mono text-slate-900">{selectedEnv.skyOpennessPct} %</strong>
                    {' · '}
                    Exposition : <strong className="text-slate-900">{selectedEnv.luminosity.crossLightLabel}</strong>
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
