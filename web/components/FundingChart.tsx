"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFundingRates, useFundingRateHistory, usePnlHistory } from "../lib/api-client";
import { formatUsd } from "../lib/format";
import { basisChartOptions, basisLineSeriesOptions, basisPnlAreaOptions, CHART } from "../lib/chart-theme";
import { useChartCrosshair } from "../hooks/useChartCrosshair";
import { useLiveDots, type LiveDotsSeriesEntry } from "../hooks/useLiveDots";
import type { Asset } from "./AssetPicker";
import { ChartFrame } from "./ChartFrame";
import { ChartLegend, type LegendItem } from "./ChartLegend";
import { SegmentedControl } from "./SegmentedControl";
import { VENUE_CHART_COLORS } from "./VenueLogo";

const LOOKBACKS = [
  { label: "5m", ms: 5 * 60_000 },
  { label: "15m", ms: 15 * 60_000 },
  { label: "1h", ms: 60 * 60_000 },
  { label: "24h", ms: 24 * 3600_000 },
  { label: "7d", ms: 7 * 24 * 3600_000 },
];

type Tab = "funding" | "pnl";
type FundingPoint = { venue: string; asset?: string; annualizedPct: number; lastUpdated: number };
type SeriesApi = {
  setData(d: { time: number; value: number }[]): void;
  applyOptions(o: { visible?: boolean }): void;
  createPriceLine(o: unknown): void;
};
type ChartApi = {
  addLineSeries(o: unknown): SeriesApi;
  addAreaSeries(o: unknown): SeriesApi;
  removeSeries(s: unknown): void;
  timeScale(): {
    fitContent(): void;
    setVisibleRange(r: { from: number; to: number }): void;
  };
  applyOptions(o: unknown): void;
  remove(): void;
};

const CHART_H = 300;
const DRAW_MS = 1500;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

type DataPoint = { time: number; value: number };

/**
 * Progressively reveal a series left-to-right by growing the slice of value
 * points over DRAW_MS, while keeping the cutoff/nowAnchor whitespace points so
 * the x-axis range stays locked to the user's lookback selection.
 */
function animateSeriesDraw(
  series: SeriesApi,
  values: DataPoint[],
  cutoff: number,
  nowAnchor: number
): { cancel: () => void } {
  if (values.length === 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    series.setData([{ time: cutoff }, { time: nowAnchor }] as any);
    return { cancel: () => {} };
  }
  let rafId = 0;
  const startTs = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - startTs) / DRAW_MS);
    const n = Math.max(1, Math.ceil(values.length * easeOut(t)));
    const slice = values.slice(0, n);
    const arr: Array<{ time: number; value?: number }> = [];
    if (slice[0]!.time > cutoff) arr.push({ time: cutoff });
    arr.push(...slice);
    if (slice[slice.length - 1]!.time < nowAnchor) arr.push({ time: nowAnchor });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    series.setData(arr as any);
    if (t < 1) rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
  return { cancel: () => cancelAnimationFrame(rafId) };
}

export function FundingChart({ asset }: { asset: Asset }) {
  const [tab, setTab] = useState<Tab>("funding");
  const [lookbackIdx, setLookbackIdx] = useState(1);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const lookbackMs = LOOKBACKS[lookbackIdx]!.ms;

  const { data: live } = useFundingRates();
  const { data: history } = useFundingRateHistory(lookbackMs);
  const { data: pnlHistory } = usePnlHistory(lookbackMs, tab === "pnl");

  const chartRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<ChartApi | null>(null);
  const [chartApi, setChartApi] = useState<ChartApi | null>(null);
  const seriesMap = useRef<Map<string, SeriesApi>>(new Map());
  const seriesColors = useRef<Map<string, string>>(new Map());
  const seriesLastPoint = useRef<Map<string, { time: number; value: number }>>(new Map());
  const [seriesVersion, setSeriesVersion] = useState(0);
  const hasAnimatedRef = useRef<boolean>(false);
  const animationsRef = useRef<Array<{ cancel: () => void }>>([]);

  useEffect(() => {
    if (!chartRef.current) return;
    let destroyed = false;
    import("lightweight-charts").then((lw) => {
      if (destroyed || !chartRef.current) return;
      const chart = lw.createChart(chartRef.current, basisChartOptions(lw, chartRef.current, CHART_H)) as ChartApi;
      chartApiRef.current = chart;
      setChartApi(chart);
    });

    return () => {
      destroyed = true;
      chartApiRef.current?.remove();
      chartApiRef.current = null;
      setChartApi(null);
      seriesMap.current.clear();
      seriesColors.current.clear();
    };
  }, []);

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && chartApiRef.current) chartApiRef.current.applyOptions({ width: Math.floor(w) });
    });
    if (chartRef.current) ro.observe(chartRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const chart = chartApiRef.current;
    if (!chart) return;

    // Cancel any in-flight draw animations from a previous effect run
    for (const a of animationsRef.current) a.cancel();
    animationsRef.current = [];

    for (const s of Array.from(seriesMap.current.values())) {
      try {
        chart.removeSeries(s);
      } catch {
        /* */
      }
    }
    seriesMap.current.clear();
    seriesColors.current.clear();
    seriesLastPoint.current.clear();

    const cutoff = Math.floor((Date.now() - lookbackMs) / 1000);
    const nowAnchor = Math.floor(Date.now() / 1000);
    let firstSeries: SeriesApi | null = null;

    // Animate the draw only on first successful mount. Subsequent changes
    // (tab / lookback / asset) and background data polls render directly.
    const shouldAnimate = !hasAnimatedRef.current;
    hasAnimatedRef.current = true;

    if (tab === "funding") {
      const pts: FundingPoint[] = [...(history ?? []), ...(live ?? [])];
      const byVenue = new Map<string, { time: number; value: number }[]>();
      for (const p of pts) {
        if (p.asset && p.asset !== asset) continue;
        const t = Math.floor(p.lastUpdated / 1000);
        if (t < cutoff) continue;
        if (!byVenue.has(p.venue)) byVenue.set(p.venue, []);
        byVenue.get(p.venue)!.push({ time: t, value: p.annualizedPct });
      }
      for (const [venue, rawPts] of Array.from(byVenue.entries())) {
        const deduped = Array.from(new Map(rawPts.map((p) => [p.time, p])).values()).sort((a, b) => a.time - b.time);
        const points =
          deduped.length === 1 ? [{ time: deduped[0]!.time - 60, value: deduped[0]!.value }, ...deduped] : deduped;
        const color = VENUE_CHART_COLORS[venue] ?? "#55555F";
        const s = chart.addLineSeries(
          basisLineSeriesOptions(color, (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`)
        );
        if (shouldAnimate) {
          animationsRef.current.push(animateSeriesDraw(s, points, cutoff, nowAnchor));
        } else {
          const firstT = points[0]?.time;
          const lastT = points[points.length - 1]?.time;
          const withAnchors: Array<{ time: number; value?: number }> = [...points];
          if (firstT == null || firstT > cutoff) withAnchors.unshift({ time: cutoff });
          if (lastT == null || lastT < nowAnchor) withAnchors.push({ time: nowAnchor });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          s.setData(withAnchors as any);
        }
        seriesMap.current.set(venue, s);
        seriesColors.current.set(venue, color);
        const last = points[points.length - 1];
        if (last) seriesLastPoint.current.set(venue, last);
        if (!firstSeries) firstSeries = s;
      }
    } else {
      const nowSec = Math.floor(Date.now() / 1000);
      const cutoffSec = cutoff;

      let pnlPts = (pnlHistory?.points ?? [])
        .map((p) => ({ time: Math.floor(p.timestamp / 1000), value: p.value }))
        .filter((p) => p.time >= cutoffSec && Number.isFinite(p.value))
        .sort((a, b) => a.time - b.time);

      pnlPts = Array.from(new Map(pnlPts.map((p) => [p.time, p])).values());

      if (pnlPts.length === 0) {
        pnlPts = [
          { time: cutoffSec, value: 0 },
          { time: nowSec, value: pnlHistory?.total ?? 0 },
        ];
      } else if (pnlPts.length === 1) {
        const only = pnlPts[0]!;
        pnlPts = [
          { time: Math.min(cutoffSec, only.time - 60), value: only.value },
          only,
        ];
        if (only.time < nowSec - 30) {
          pnlPts.push({ time: nowSec, value: only.value });
        }
      } else if (pnlPts[pnlPts.length - 1]!.time < nowSec - 30) {
        pnlPts.push({ time: nowSec, value: pnlPts[pnlPts.length - 1]!.value });
      }

      const lastVal = pnlPts[pnlPts.length - 1]!.value;
      const positive = lastVal >= 0;
      const color = positive ? CHART.positive : CHART.negative;
      const s = chart.addAreaSeries(
        basisPnlAreaOptions(positive, (v) => formatUsd(v, { signed: true }))
      );
      if (shouldAnimate) {
        animationsRef.current.push(animateSeriesDraw(s, pnlPts, cutoff, nowAnchor));
      } else {
        s.setData(pnlPts);
      }
      seriesMap.current.set("__pnl__", s);
      seriesColors.current.set("__pnl__", color);
      const lastPnl = pnlPts[pnlPts.length - 1];
      if (lastPnl) seriesLastPoint.current.set("__pnl__", lastPnl);
      firstSeries = s;
    }

    if (firstSeries) {
      import("lightweight-charts").then(({ LineStyle }) => {
        try {
          firstSeries!.createPriceLine({
            price: 0,
            color: CHART.zeroLine,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: false,
          });
        } catch {
          /* */
        }
      });
    }

    setSeriesVersion((v) => v + 1);
    chart.timeScale().fitContent();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartApi, history, live, pnlHistory, tab, lookbackMs, asset]);

  useEffect(() => {
    for (const [id, series] of Array.from(seriesMap.current.entries())) {
      series.applyOptions({ visible: !hidden.has(id) });
    }
  }, [hidden, seriesVersion]);

  const seriesMeta = useMemo(
    () =>
      Array.from(seriesMap.current.entries()).map(([id, series]) => ({
        id,
        label: id === "__pnl__" ? "Cumulative PnL" : id,
        color: seriesColors.current.get(id) ?? CHART.accent,
        series,
        hidden: hidden.has(id),
      })),
    [seriesVersion, hidden]
  );

  const formatValue = useCallback(
    (id: string, v: number) =>
      id === "__pnl__"
        ? formatUsd(v, { signed: true })
        : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`,
    []
  );

  const tooltip = useChartCrosshair(
    chartApi as import("../hooks/useChartCrosshair").CrosshairChartApi | null,
    seriesMeta,
    containerRef,
    formatValue
  );

  const liveDotsEntries: LiveDotsSeriesEntry[] = useMemo(
    () =>
      Array.from(seriesMap.current.entries()).map(([id, series]) => ({
        id,
        color: seriesColors.current.get(id) ?? CHART.accent,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        series: series as any,
        lastPoint: seriesLastPoint.current.get(id) ?? null,
        hidden: hidden.has(id),
      })),
    [seriesVersion, hidden]
  );

  const liveDots = useLiveDots(
    chartApi as import("../hooks/useLiveDots").LiveDotsChartApi | null,
    liveDotsEntries
  );

  const liveRates: FundingPoint[] = (live as FundingPoint[]) ?? [];

  const legendItems: LegendItem[] = useMemo(() => {
    if (tab === "pnl") {
      const color = seriesColors.current.get("__pnl__") ?? CHART.accent;
      return [{ id: "__pnl__", label: "Cumulative PnL", color }];
    }
    return liveRates
      .filter((r) => !r.asset || r.asset === asset)
      .map((r) => ({
        id: r.venue,
        label: r.venue,
        color: VENUE_CHART_COLORS[r.venue] ?? "#55555F",
        value: `${r.annualizedPct >= 0 ? "+" : ""}${r.annualizedPct.toFixed(2)}%`,
        hidden: hidden.has(r.venue),
      }));
  }, [tab, liveRates, asset, hidden, seriesVersion]);

  return (
    <div className="panel overflow-hidden flex flex-col">
      <div className="panel-header flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          options={[
            { value: "funding", label: "Funding" },
            { value: "pnl", label: "PnL" },
          ]}
          value={tab}
          onChange={setTab}
        />
        <SegmentedControl
          options={LOOKBACKS.map((l, i) => ({ value: String(i), label: l.label }))}
          value={String(lookbackIdx)}
          onChange={(v) => setLookbackIdx(Number(v))}
        />
      </div>

      <ChartFrame
        chartRef={chartRef}
        containerRef={containerRef}
        height={CHART_H}
        tooltip={tooltip}
        liveDots={liveDots}
      />

      <div className="px-4 py-2.5 border-t border-border-subtle min-h-[40px] flex items-center">
        {tab === "funding" ? (
          <ChartLegend
            items={legendItems}
            onToggle={(id) =>
              setHidden((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
          />
        ) : (
          <span className="text-[11px] text-text-tertiary tabular-mono">
            Total {formatUsd(pnlHistory?.total ?? 0, { signed: true })}
            {pnlHistory != null && pnlHistory.unrealized !== 0 && (
              <span className="text-text-disabled">
                {" "}
                · {formatUsd(pnlHistory.realized, { signed: true })} realized ·{" "}
                {formatUsd(pnlHistory.unrealized, { signed: true })} open
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
