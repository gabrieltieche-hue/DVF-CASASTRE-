import { useMemo, useState } from 'react';
import {
  computePriceBrackets,
  computePricePrediction,
  computeSurfaceBands,
  type DvfTransaction,
  type PriceBracket,
  type SurfaceBandStat,
  type YearlyTrend,
} from '../lib/dvf';
import { formatDateFr, formatEuros, formatPricePerSqm, formatSurface } from '../utils/format';

interface DvfChartProps {
  transactions: DvfTransaction[];
  yearlyTrends: YearlyTrend[];
  medianPricePerSqm: number | null;
  selectedId: string | null;
  onSelectTransaction: (tx: DvfTransaction) => void;
  minSurface: number;
  maxSurface: number;
}

type ChartMode = 'trend' | 'prediction' | 'brackets' | 'surface';

export function DvfChart({
  transactions,
  yearlyTrends,
  medianPricePerSqm,
  selectedId,
  onSelectTransaction,
  minSurface,
  maxSurface,
}: DvfChartProps) {
  const [mode, setMode] = useState<ChartMode>('trend');
  const [hoveredYear, setHoveredYear] = useState<YearlyTrend | null>(null);
  const [hoveredBracket, setHoveredBracket] = useState<PriceBracket | null>(null);
  const [hoveredBand, setHoveredBand] = useState<SurfaceBandStat | null>(null);
  const [hoveredTx, setHoveredTx] = useState<DvfTransaction | null>(null);

  const brackets = useMemo(() => computePriceBrackets(transactions), [transactions]);
  const surfaceBands = useMemo(
    () => computeSurfaceBands(transactions, minSurface, maxSurface),
    [transactions, minSurface, maxSurface]
  );
  const prediction = useMemo(() => computePricePrediction(yearlyTrends, 2), [yearlyTrends]);

  const trendBounds = useMemo(() => {
    if (yearlyTrends.length === 0) return null;
    const lows = yearlyTrends.map((t) => t.q1PricePerSqm);
    const highs = yearlyTrends.map((t) => t.q3PricePerSqm);
    const rawMin = Math.min(...lows);
    const rawMax = Math.max(...highs);
    const pad = Math.max(800, Math.round((rawMax - rawMin) * 0.45));
    const yMin = Math.max(0, Math.floor((rawMin - pad) / 500) * 500);
    const yMax = Math.ceil((rawMax + pad) / 500) * 500;
    const maxVol = Math.max(1, ...yearlyTrends.map((t) => t.count));
    return { yMin, yMax, maxVol };
  }, [yearlyTrends]);

  const predictionBounds = useMemo(() => {
    if (!prediction) return null;
    const allVals = [
      ...prediction.observed.map((o) => o.medianPricePerSqm),
      ...prediction.projected.map((p) => p.lowerBound),
      ...prediction.projected.map((p) => p.upperBound),
    ];
    const rawMin = Math.min(...allVals);
    const rawMax = Math.max(...allVals);
    const pad = Math.max(700, Math.round((rawMax - rawMin) * 0.35));
    return {
      yMin: Math.max(0, Math.floor((rawMin - pad) / 500) * 500),
      yMax: Math.ceil((rawMax + pad) / 500) * 500,
    };
  }, [prediction]);

  const surfaceBounds = useMemo(() => {
    if (transactions.length === 0) return null;
    const vals = transactions.map((t) => t.pricePerSqm);
    const rawMin = Math.min(...vals);
    const rawMax = Math.max(...vals);
    const pad = Math.max(600, Math.round((rawMax - rawMin) * 0.14));
    return {
      yMin: Math.max(0, Math.floor((rawMin - pad) / 500) * 500),
      yMax: Math.ceil((rawMax + pad) / 500) * 500,
    };
  }, [transactions]);

  const jitteredPoints = useMemo(() => {
    if (surfaceBands.length === 0) return [];
    const byBand = new Map<string, DvfTransaction[]>();
    for (const tx of transactions) {
      const band =
        surfaceBands.find(
          (b, idx) =>
            tx.surfaceBati >= b.minSurface &&
            (idx === surfaceBands.length - 1 ? tx.surfaceBati <= b.maxSurface + 0.99 : tx.surfaceBati <= b.maxSurface)
        ) ?? surfaceBands[0];
      const arr = byBand.get(band.label) ?? [];
      arr.push(tx);
      byBand.set(band.label, arr);
    }

    const out: Array<{ tx: DvfTransaction; bandIdx: number; offsetNorm: number }> = [];
    surfaceBands.forEach((band, bandIdx) => {
      const list = (byBand.get(band.label) ?? []).slice().sort((a, b) => a.pricePerSqm - b.pricePerSqm);
      list.forEach((tx, idx) => {
        const mod = ((idx * 0.6180339) % 1) - 0.5;
        const offsetNorm = list.length === 1 ? 0 : mod * 0.52;
        out.push({ tx, bandIdx, offsetNorm });
      });
    });
    return out;
  }, [transactions, surfaceBands]);

  const width = 480;
  const height = 290;
  const padLeft = 58;
  const padRight = 20;
  const padTop = 24;
  const padBottom = 48;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  return (
    <section
      id="analyse"
      className="h-full flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Analyse des prix au m²</h2>
          <p className="text-xs text-slate-500">
            {mode === 'trend' && 'Médiane annuelle, corridor Q1–Q3 (50 % des ventes) et volume'}
            {mode === 'prediction' && 'Projection tendancielle 2026–2027 (régression pondérée DVF)'}
            {mode === 'brackets' && 'Répartition des ventes par tranche de prix au m²'}
            {mode === 'surface' && `Prix au m² par palier de surface (${minSurface}–${maxSurface} m²)`}
          </p>
        </div>
        <div
          className="flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-md"
          role="group"
          aria-label="Mode de graphique"
        >
          {[
            { id: 'trend', label: 'Évolution' },
            { id: 'prediction', label: 'Prédiction' },
            { id: 'brackets', label: 'Tranches' },
            { id: 'surface', label: 'Surface' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMode(tab.id as ChartMode)}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                mode === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-between p-4">
        {transactions.length === 0 ? (
          <div className="flex-1 min-h-[260px] flex items-center justify-center text-xs text-slate-500">
            Aucune donnée à tracer pour les critères sélectionnés.
          </div>
        ) : mode === 'trend' && trendBounds ? (
          <div className="flex-1 flex flex-col justify-between">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-auto overflow-visible"
              role="img"
              aria-label="Évolution annuelle des prix médians et fourchette interquartile"
            >
              <defs>
                <linearGradient id="dvf-area-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1D4ED8" stopOpacity="0.16" />
                  <stop offset="100%" stopColor="#1D4ED8" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {[0, 0.25, 0.5, 0.75, 1].map((r) => {
                const y = padTop + plotH * (1 - r);
                const val = Math.round(trendBounds.yMin + (trendBounds.yMax - trendBounds.yMin) * r);
                return (
                  <g key={r}>
                    <line
                      x1={padLeft}
                      x2={width - padRight}
                      y1={y}
                      y2={y}
                      stroke="#E2E8F0"
                      strokeWidth="1"
                    />
                    <text
                      x={padLeft - 8}
                      y={y + 3.5}
                      textAnchor="end"
                      className="fill-slate-500 text-[10px] font-mono"
                    >
                      {new Intl.NumberFormat('fr-FR').format(val)} €
                    </text>
                  </g>
                );
              })}

              {(() => {
                const count = yearlyTrends.length;
                const colWidth = plotW / Math.max(count, 1);
                const xFor = (i: number) => padLeft + colWidth * (i + 0.5);
                const yFor = (val: number) => {
                  const clamped = Math.max(trendBounds.yMin, Math.min(trendBounds.yMax, val));
                  return (
                    padTop +
                    plotH * (1 - (clamped - trendBounds.yMin) / (trendBounds.yMax - trendBounds.yMin || 1))
                  );
                };

                const areaPath =
                  count > 1
                    ? [
                        ...yearlyTrends.map((t, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(t.q3PricePerSqm)}`),
                        ...yearlyTrends
                          .slice()
                          .reverse()
                          .map((t, ri) => `L ${xFor(count - 1 - ri)} ${yFor(t.q1PricePerSqm)}`),
                        'Z',
                      ].join(' ')
                    : '';

                const medianPath = yearlyTrends
                  .map((t, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(t.medianPricePerSqm)}`)
                  .join(' ');

                return (
                  <>
                    {areaPath && <path d={areaPath} fill="url(#dvf-area-grad)" />}

                    {yearlyTrends.map((t, i) => {
                      const cx = xFor(i);
                      const yQ3 = yFor(t.q3PricePerSqm);
                      const yQ1 = yFor(t.q1PricePerSqm);
                      const barH = Math.max(4, yQ1 - yQ3);
                      const isHov = hoveredYear?.year === t.year;
                      const volMaxH = 22;
                      const volH = Math.max(3, Math.round((t.count / trendBounds.maxVol) * volMaxH));

                      return (
                        <g
                          key={t.year}
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredYear(t)}
                          onMouseLeave={() => setHoveredYear(null)}
                        >
                          <rect
                            x={padLeft + colWidth * i + 2}
                            y={padTop}
                            width={Math.max(10, colWidth - 4)}
                            height={plotH + 34}
                            fill={isHov ? '#F1F5F9' : 'transparent'}
                            rx={4}
                          />
                          <rect
                            x={cx - 12}
                            y={yQ3}
                            width={24}
                            height={barH}
                            rx={4}
                            fill="#1D4ED8"
                            fillOpacity={isHov ? 0.28 : 0.16}
                            stroke="#1D4ED8"
                            strokeOpacity={0.35}
                            strokeWidth={1}
                          />
                          <rect
                            x={cx - 10}
                            y={padTop + plotH + 26 - volH}
                            width={20}
                            height={volH}
                            rx={2}
                            fill="#CBD5E1"
                          />
                          <text
                            x={cx}
                            y={height - 2}
                            textAnchor="middle"
                            className="fill-slate-700 text-[11px] font-mono font-medium"
                          >
                            {t.year}
                          </text>
                        </g>
                      );
                    })}

                    {count > 1 && (
                      <path
                        d={medianPath}
                        fill="none"
                        stroke="#1D4ED8"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        pointerEvents="none"
                      />
                    )}

                    {yearlyTrends.map((t, i) => {
                      const cx = xFor(i);
                      const cy = yFor(t.medianPricePerSqm);
                      const isHov = hoveredYear?.year === t.year;
                      return (
                        <circle
                          key={`dot-${t.year}`}
                          cx={cx}
                          cy={cy}
                          r={isHov ? 5.5 : 4.5}
                          fill="#FFFFFF"
                          stroke="#1D4ED8"
                          strokeWidth="2.5"
                          pointerEvents="none"
                        />
                      );
                    })}

                    {yearlyTrends.map((t, i) => {
                      const cx = xFor(i);
                      const yMed = yFor(t.medianPricePerSqm);
                      const yQ3 = yFor(t.q3PricePerSqm);
                      const labelY = Math.max(12, Math.min(yMed - 11, yQ3 - 7));
                      return (
                        <text
                          key={`lbl-${t.year}`}
                          x={cx}
                          y={labelY}
                          textAnchor="middle"
                          paintOrder="stroke"
                          stroke="#FFFFFF"
                          strokeWidth={4}
                          strokeLinejoin="round"
                          pointerEvents="none"
                          className="fill-slate-900 text-[10px] font-mono font-semibold"
                        >
                          {new Intl.NumberFormat('fr-FR').format(t.medianPricePerSqm)} €
                        </text>
                      );
                    })}
                  </>
                );
              })()}
            </svg>

            <div className="mt-2 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs min-h-[30px]">
              {hoveredYear ? (
                <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums text-slate-800">
                  <span className="font-semibold text-[#1D4ED8]">{hoveredYear.year}</span>
                  <span aria-hidden="true">·</span>
                  <span>Médiane {formatPricePerSqm(hoveredYear.medianPricePerSqm)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-600">
                    50 % centraux : {new Intl.NumberFormat('fr-FR').format(hoveredYear.q1PricePerSqm)}–
                    {new Intl.NumberFormat('fr-FR').format(hoveredYear.q3PricePerSqm)} €
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-500">{hoveredYear.count} ventes</span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-4 text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-[#1D4ED8] inline-block" aria-hidden="true" />
                    Médiane annuelle
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="w-3 h-2.5 bg-[#1D4ED8]/20 border border-[#1D4ED8]/40 rounded-[2px] inline-block"
                      aria-hidden="true"
                    />
                    Fourchette Q1–Q3
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-2 bg-slate-300 rounded-[2px] inline-block" aria-hidden="true" />
                    Volume annuel
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : mode === 'prediction' ? (
          prediction && predictionBounds ? (
            <div className="flex-1 flex flex-col justify-between">
              <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full h-auto overflow-visible"
                role="img"
                aria-label="Projection tendancielle des prix au m² basée sur les transactions DVF"
              >
                <defs>
                  <linearGradient id="dvf-pred-cone" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#0F766E" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#0F766E" stopOpacity="0.08" />
                  </linearGradient>
                </defs>

                {[0, 0.25, 0.5, 0.75, 1].map((r) => {
                  const y = padTop + plotH * (1 - r);
                  const val = Math.round(
                    predictionBounds.yMin + (predictionBounds.yMax - predictionBounds.yMin) * r
                  );
                  return (
                    <g key={r}>
                      <line
                        x1={padLeft}
                        x2={width - padRight}
                        y1={y}
                        y2={y}
                        stroke="#E2E8F0"
                        strokeWidth="1"
                      />
                      <text
                        x={padLeft - 8}
                        y={y + 3.5}
                        textAnchor="end"
                        className="fill-slate-500 text-[10px] font-mono"
                      >
                        {new Intl.NumberFormat('fr-FR').format(val)} €
                      </text>
                    </g>
                  );
                })}

                {(() => {
                  const obs = prediction.observed;
                  const proj = prediction.projected;
                  const totalPts = obs.length + proj.length;
                  const colW = plotW / Math.max(totalPts, 1);
                  const xForIdx = (i: number) => padLeft + colW * (i + 0.5);
                  const yFor = (val: number) => {
                    const clamped = Math.max(predictionBounds.yMin, Math.min(predictionBounds.yMax, val));
                    return (
                      padTop +
                      plotH *
                        (1 -
                          (clamped - predictionBounds.yMin) /
                            (predictionBounds.yMax - predictionBounds.yMin || 1))
                    );
                  };

                  const lastObs = obs[obs.length - 1];
                  const lastObsIdx = obs.length - 1;
                  const dividerX = (xForIdx(lastObsIdx) + xForIdx(lastObsIdx + 1)) / 2;

                  const obsPath = obs
                    .map((t, i) => `${i === 0 ? 'M' : 'L'} ${xForIdx(i)} ${yFor(t.medianPricePerSqm)}`)
                    .join(' ');

                  const projPath = [
                    `M ${xForIdx(lastObsIdx)} ${yFor(lastObs.medianPricePerSqm)}`,
                    ...proj.map((p, pi) => `L ${xForIdx(obs.length + pi)} ${yFor(p.predictedPricePerSqm)}`),
                  ].join(' ');

                  const conePath = [
                    `M ${xForIdx(lastObsIdx)} ${yFor(lastObs.medianPricePerSqm)}`,
                    ...proj.map((p, pi) => `L ${xForIdx(obs.length + pi)} ${yFor(p.upperBound)}`),
                    ...proj
                      .slice()
                      .reverse()
                      .map((p, ri) => {
                        const origIdx = obs.length + (proj.length - 1 - ri);
                        return `L ${xForIdx(origIdx)} ${yFor(p.lowerBound)}`;
                      }),
                    'Z',
                  ].join(' ');

                  return (
                    <>
                      {/* Projection Zone Shade */}
                      <rect
                        x={dividerX}
                        y={padTop}
                        width={width - padRight - dividerX}
                        height={plotH}
                        fill="#F0FDFA"
                        fillOpacity={0.55}
                      />
                      <line
                        x1={dividerX}
                        x2={dividerX}
                        y1={padTop}
                        y2={padTop + plotH}
                        stroke="#94A3B8"
                        strokeDasharray="3 3"
                        strokeWidth="1"
                      />
                      <text
                        x={dividerX + 6}
                        y={padTop + 12}
                        className="fill-[#0F766E] text-[9px] font-semibold"
                      >
                        Projection
                      </text>

                      {/* Confidence Cone */}
                      <path d={conePath} fill="url(#dvf-pred-cone)" />

                      {/* Historical Line & Projected Dashed Line */}
                      <path
                        d={obsPath}
                        fill="none"
                        stroke="#1D4ED8"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d={projPath}
                        fill="none"
                        stroke="#0F766E"
                        strokeWidth="2.5"
                        strokeDasharray="5 4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />

                      {/* Historical Nodes & Labels */}
                      {obs.map((t, i) => {
                        const cx = xForIdx(i);
                        const cy = yFor(t.medianPricePerSqm);
                        return (
                          <g key={t.year}>
                            <circle
                              cx={cx}
                              cy={cy}
                              r={4}
                              fill="#FFFFFF"
                              stroke="#1D4ED8"
                              strokeWidth="2.5"
                            />
                            <text
                              x={cx}
                              y={Math.max(14, cy - 10)}
                              textAnchor="middle"
                              paintOrder="stroke"
                              stroke="#FFFFFF"
                              strokeWidth={4}
                              className="fill-slate-800 text-[10px] font-mono font-semibold"
                            >
                              {new Intl.NumberFormat('fr-FR').format(t.medianPricePerSqm)} €
                            </text>
                            <text
                              x={cx}
                              y={height - 10}
                              textAnchor="middle"
                              className="fill-slate-600 text-[10px] font-mono"
                            >
                              {t.year}
                            </text>
                          </g>
                        );
                      })}

                      {/* Projected Nodes & Labels */}
                      {proj.map((p, pi) => {
                        const idx = obs.length + pi;
                        const cx = xForIdx(idx);
                        const cy = yFor(p.predictedPricePerSqm);
                        return (
                          <g key={p.year}>
                            <line
                              x1={cx}
                              x2={cx}
                              y1={yFor(p.upperBound)}
                              y2={yFor(p.lowerBound)}
                              stroke="#0F766E"
                              strokeOpacity={0.45}
                              strokeWidth="2"
                            />
                            <circle
                              cx={cx}
                              cy={cy}
                              r={4.5}
                              fill="#0F766E"
                              stroke="#FFFFFF"
                              strokeWidth="2"
                            />
                            <text
                              x={cx}
                              y={Math.max(14, cy - 11)}
                              textAnchor="middle"
                              paintOrder="stroke"
                              stroke="#FFFFFF"
                              strokeWidth={4}
                              className="fill-[#0F766E] text-[10px] font-mono font-bold"
                            >
                              ~{new Intl.NumberFormat('fr-FR').format(p.predictedPricePerSqm)} €
                            </text>
                            <text
                              x={cx}
                              y={height - 10}
                              textAnchor="middle"
                              className="fill-[#0F766E] text-[10px] font-mono font-semibold"
                            >
                              {p.year}*
                            </text>
                          </g>
                        );
                      })}
                    </>
                  );
                })()}
              </svg>

              <div className="mt-2 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-slate-800">
                  <span>
                    Dérive annuelle :{' '}
                    <strong className={prediction.annualSlopeEurSqm >= 0 ? 'text-[#0F766E]' : 'text-amber-700'}>
                      {prediction.annualSlopeEurSqm >= 0 ? '+' : ''}
                      {prediction.annualSlopeEurSqm} €/m²/an ({prediction.annualTrendPct >= 0 ? '+' : ''}
                      {prediction.annualTrendPct} %)
                    </strong>
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-600">R² = {prediction.rSquared}</span>
                </div>
                <span className="text-[11px] text-slate-500">
                  *Tendance statistique indicative (intervalle ±{prediction.rmse} €/m²)
                </span>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-[260px] flex items-center justify-center text-xs text-slate-500">
              Au moins 2 millésimes DVF sont requis pour calculer une projection tendancielle.
            </div>
          )
        ) : mode === 'brackets' ? (
          <div className="flex-1 flex flex-col justify-between">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-auto overflow-visible"
              role="img"
              aria-label="Histogramme des ventes par tranche de prix au mètre carré"
            >
              {(() => {
                const maxCount = Math.max(1, ...brackets.map((b) => b.total));
                const colW = plotW / Math.max(brackets.length, 1);
                const barW = Math.min(44, colW * 0.62);
                const chartH = height - padTop - 36;

                return (
                  <>
                    {[0, 0.25, 0.5, 0.75, 1].map((r) => {
                      const y = padTop + chartH * (1 - r);
                      const v = Math.round(maxCount * r);
                      return (
                        <g key={r}>
                          <line
                            x1={padLeft}
                            x2={width - padRight}
                            y1={y}
                            y2={y}
                            stroke="#E2E8F0"
                            strokeWidth="1"
                          />
                          <text
                            x={padLeft - 8}
                            y={y + 3.5}
                            textAnchor="end"
                            className="fill-slate-500 text-[10px] font-mono"
                          >
                            {v}
                          </text>
                        </g>
                      );
                    })}

                    {brackets.map((b, i) => {
                      const cx = padLeft + colW * (i + 0.5);
                      const x = cx - barW / 2;
                      const hTotal = (b.total / maxCount) * chartH;
                      const hTwo = (b.twoRoomCount / maxCount) * chartH;
                      const hStudio = (b.studioCount / maxCount) * chartH;
                      const yTop = padTop + chartH - hTotal;
                      const isMedianBracket =
                        medianPricePerSqm !== null &&
                        medianPricePerSqm >= b.min &&
                        medianPricePerSqm < b.max;
                      const isHov = hoveredBracket?.label === b.label;

                      return (
                        <g
                          key={b.label}
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredBracket(b)}
                          onMouseLeave={() => setHoveredBracket(null)}
                        >
                          {isMedianBracket && (
                            <rect
                              x={x - 4}
                              y={padTop}
                              width={barW + 8}
                              height={chartH}
                              fill="#EFF6FF"
                              rx={4}
                            />
                          )}
                          {b.twoRoomCount > 0 && (
                            <rect
                              x={x}
                              y={padTop + chartH - hTwo}
                              width={barW}
                              height={hTwo}
                              fill="#1D4ED8"
                              fillOpacity={isHov ? 1 : 0.92}
                              rx={b.studioCount === 0 ? 3 : 0}
                            />
                          )}
                          {b.studioCount > 0 && (
                            <rect
                              x={x}
                              y={yTop}
                              width={barW}
                              height={hStudio}
                              fill="#0F766E"
                              fillOpacity={isHov ? 1 : 0.92}
                              rx={3}
                            />
                          )}
                          {b.total > 0 && (
                            <text
                              x={cx}
                              y={yTop - 6}
                              textAnchor="middle"
                              className="fill-slate-800 text-[10px] font-mono font-semibold"
                            >
                              {b.total}
                            </text>
                          )}
                          <text
                            x={cx}
                            y={height - 10}
                            textAnchor="middle"
                            className={`text-[10px] font-mono ${
                              isMedianBracket ? 'fill-[#1D4ED8] font-bold' : 'fill-slate-600'
                            }`}
                          >
                            {b.label}
                          </text>
                        </g>
                      );
                    })}
                  </>
                );
              })()}
            </svg>

            <div className="mt-2 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 min-h-[30px]">
              {hoveredBracket ? (
                <div className="flex items-center gap-2 font-mono tabular-nums text-slate-800">
                  <span className="font-semibold text-[#1D4ED8]">{hoveredBracket.label} €/m²</span>
                  <span>·</span>
                  <span>
                    {hoveredBracket.total} vente{hoveredBracket.total > 1 ? 's' : ''} (
                    {Math.round((hoveredBracket.total / Math.max(1, transactions.length)) * 100)} %)
                  </span>
                  <span>·</span>
                  <span className="text-slate-600">
                    {hoveredBracket.twoRoomCount} 2P · {hoveredBracket.studioCount} Studio
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-4">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-[2px] bg-[#1D4ED8] inline-block" aria-hidden="true" />
                      2 pièces
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-[2px] bg-[#0F766E] inline-block" aria-hidden="true" />
                      Studio (1P)
                    </span>
                  </div>
                  <span className="font-mono tabular-nums">Tranches en €/m² (colonne bleutée = médiane)</span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-between">
            {surfaceBounds && surfaceBands.length > 0 && (
              <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full h-auto overflow-visible"
                role="img"
                aria-label="Analyse des prix au m² par palier de surface habitable"
              >
                {(() => {
                  const chartH = height - padTop - 36;
                  const bandCount = surfaceBands.length;
                  const colW = plotW / Math.max(bandCount, 1);
                  const xForBand = (i: number) => padLeft + colW * (i + 0.5);
                  const yFor = (val: number) =>
                    padTop +
                    chartH *
                      (1 -
                        (val - surfaceBounds.yMin) /
                          (surfaceBounds.yMax - surfaceBounds.yMin || 1));

                  const medPath = surfaceBands
                    .map((b, i) => `${i === 0 ? 'M' : 'L'} ${xForBand(i)} ${yFor(b.medianPricePerSqm)}`)
                    .join(' ');

                  return (
                    <>
                      {/* Horizontal grid */}
                      {[0, 0.25, 0.5, 0.75, 1].map((r) => {
                        const y = padTop + chartH * (1 - r);
                        const val = Math.round(
                          surfaceBounds.yMin + (surfaceBounds.yMax - surfaceBounds.yMin) * r
                        );
                        return (
                          <g key={r}>
                            <line
                              x1={padLeft}
                              x2={width - padRight}
                              y1={y}
                              y2={y}
                              stroke="#E2E8F0"
                              strokeWidth="1"
                            />
                            <text
                              x={padLeft - 8}
                              y={y + 3.5}
                              textAnchor="end"
                              className="fill-slate-500 text-[10px] font-mono"
                            >
                              {new Intl.NumberFormat('fr-FR').format(val)} €
                            </text>
                          </g>
                        );
                      })}

                      {/* Sector median reference line */}
                      {medianPricePerSqm !== null && (
                        <line
                          x1={padLeft}
                          x2={width - padRight}
                          y1={yFor(medianPricePerSqm)}
                          y2={yFor(medianPricePerSqm)}
                          stroke="#94A3B8"
                          strokeWidth="1.2"
                          strokeDasharray="4 4"
                        />
                      )}

                      {/* Band Q1-Q3 corridors */}
                      {surfaceBands.map((b, i) => {
                        const cx = xForBand(i);
                        const bandBoxW = Math.min(46, colW * 0.62);
                        const yQ3 = yFor(b.q3PricePerSqm);
                        const yQ1 = yFor(b.q1PricePerSqm);
                        const boxH = Math.max(6, yQ1 - yQ3);
                        const isHov = hoveredBand?.label === b.label;

                        return (
                          <g
                            key={b.label}
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredBand(b)}
                            onMouseLeave={() => setHoveredBand(null)}
                          >
                            <rect
                              x={padLeft + colW * i + 2}
                              y={padTop}
                              width={Math.max(12, colW - 4)}
                              height={chartH}
                              fill={isHov ? '#F8FAFC' : 'transparent'}
                              rx={4}
                            />
                            <rect
                              x={cx - bandBoxW / 2}
                              y={yQ3}
                              width={bandBoxW}
                              height={boxH}
                              rx={4}
                              fill="#1D4ED8"
                              fillOpacity={isHov ? 0.18 : 0.1}
                              stroke="#1D4ED8"
                              strokeOpacity={0.28}
                              strokeWidth={1}
                            />
                            <text
                              x={cx}
                              y={height - 10}
                              textAnchor="middle"
                              className="fill-slate-700 text-[10px] font-mono font-medium"
                            >
                              {b.label}
                            </text>
                          </g>
                        );
                      })}

                      {/* Median curve across surface bands */}
                      {bandCount > 1 && (
                        <path
                          d={medPath}
                          fill="none"
                          stroke="#1D4ED8"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          pointerEvents="none"
                        />
                      )}

                      {/* Individual transactions spread cleanly inside their band */}
                      {jitteredPoints.map(({ tx, bandIdx, offsetNorm }) => {
                        const x = xForBand(bandIdx) + offsetNorm * Math.min(44, colW * 0.6);
                        const y = yFor(tx.pricePerSqm);
                        const isSelected = tx.id === selectedId || hoveredTx?.id === tx.id;
                        const color = tx.rooms === 1 ? '#0F766E' : '#1D4ED8';
                        return (
                          <circle
                            key={tx.id}
                            cx={x}
                            cy={y}
                            r={isSelected ? 6 : 3.8}
                            fill={color}
                            fillOpacity={isSelected ? 1 : 0.72}
                            stroke={isSelected ? '#0F172A' : '#FFFFFF'}
                            strokeWidth={isSelected ? 2 : 1}
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredTx(tx)}
                            onMouseLeave={() => setHoveredTx(null)}
                            onClick={() => onSelectTransaction(tx)}
                          />
                        );
                      })}

                      {/* Band median nodes + non-overlapping labels */}
                      {surfaceBands.map((b, i) => {
                        const cx = xForBand(i);
                        const cy = yFor(b.medianPricePerSqm);
                        const yQ3 = yFor(b.q3PricePerSqm);
                        return (
                          <g key={`med-${b.label}`} pointerEvents="none">
                            <circle
                              cx={cx}
                              cy={cy}
                              r={4}
                              fill="#FFFFFF"
                              stroke="#1D4ED8"
                              strokeWidth="2.2"
                            />
                            <text
                              x={cx}
                              y={Math.max(12, Math.min(cy - 10, yQ3 - 7))}
                              textAnchor="middle"
                              paintOrder="stroke"
                              stroke="#FFFFFF"
                              strokeWidth={4}
                              className="fill-slate-900 text-[9.5px] font-mono font-semibold"
                            >
                              {new Intl.NumberFormat('fr-FR').format(b.medianPricePerSqm)} €
                            </text>
                          </g>
                        );
                      })}
                    </>
                  );
                })()}
              </svg>
            )}

            <div className="mt-2 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs min-h-[30px]">
              {hoveredTx ? (
                <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums text-slate-800">
                  <span className="font-sans font-semibold">{hoveredTx.address}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatSurface(hoveredTx.surfaceBati)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatEuros(hoveredTx.valeurFonciere)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#1D4ED8] font-semibold">
                    {formatPricePerSqm(hoveredTx.pricePerSqm)}
                  </span>
                  <span className="text-slate-400 font-sans">({formatDateFr(hoveredTx.dateMutation)})</span>
                </div>
              ) : hoveredBand ? (
                <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums text-slate-800">
                  <span className="font-semibold text-[#1D4ED8]">{hoveredBand.label}</span>
                  <span>·</span>
                  <span>Médiane {formatPricePerSqm(hoveredBand.medianPricePerSqm)}</span>
                  <span>·</span>
                  <span className="text-slate-600">Budget médian {formatEuros(hoveredBand.medianTotalPrice)}</span>
                  <span>·</span>
                  <span className="text-slate-500">{hoveredBand.count} ventes</span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between w-full gap-2 text-slate-500">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-[#1D4ED8] inline-block" aria-hidden="true" />
                      Médiane / palier
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#1D4ED8] inline-block" aria-hidden="true" />
                      2P
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#0F766E] inline-block" aria-hidden="true" />
                      Studio
                    </span>
                  </div>
                  {medianPricePerSqm !== null && (
                    <span className="font-mono text-[11px] text-slate-600">
                      --- Médiane secteur {formatPricePerSqm(medianPricePerSqm)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
