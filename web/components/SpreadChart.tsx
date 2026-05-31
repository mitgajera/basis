"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSpreads, useSpreadHistory } from "../lib/api-client";
import {
  basisChartOptions,
  basisLineSeriesOptions,
  CHART,
  SPREAD_PAIR_COLORS,
} from "../lib/chart-theme";
import { useChartCrosshair } from "../hooks/useChartCrosshair";
import { useLiveDots, type LiveDotsSeriesEntry } from "../hooks/useLiveDots";
import type { Asset } from "./AssetPicker";
import { ChartFrame } from "./ChartFrame";
import { ChartLegend, type LegendItem } from "./ChartLegend";

type SpreadPoint = { longVenue: string; shortVenue: string; spreadAnnualizedPct: number; computedAt?: number };
type SeriesApi = {
  setData(d: { time: number; value: number }[]): void;
  applyOptions(o: { visible?: boolean }): void;
  createPriceLine(o: unknown): void;
};
type ChartApi = {
  addLineSeries(o: unknown): SeriesApi;
  removeSeries(s: unknown): void;
  timeScale(): {
    fitContent(): void;
    setVisibleRange(r: { from: number; to: number }): void;
  };
  applyOptions(o: unknown): void;
  remove(): void;
};

const CHART_H = 200;
const DRAW_MS = 750;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function animateSpreadDraw(
  series: SeriesApi,
  values: Array<{ time: number; value: number }>
): { cancel: () => void } {
  if (values.length === 0) return { cancel: () => {} };
  let rafId = 0;
  const startTs = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - startTs) / DRAW_MS);
    const n = Math.max(1, Math.ceil(values.length * easeOut(t)));
    series.setData(values.slice(0, n));
    if (t < 1) rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
  return { cancel: () => cancelAnimationFrame(rafId) };
}

export function SpreadChart({ asset }: { asset: Asset }) {
  const { data: live } = useSpreads(asset);
  const { data: history } = useSpreadHistory(24 * 3600_000, asset);

  const chartRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<ChartApi | null>(null);
  const [chartApi, setChartApi] = useState<ChartApi | null>(null);
  const seriesMap = useRef<Map<string, SeriesApi>>(new Map());
  const seriesColors = useRef<Map<string, string>>(new Map());
  const seriesLastPoint = useRef<Map<string, { time: number; value: number }>>(new Map());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [seriesVersion, setSeriesVersion] = useState(0);
  const lastSigRef = useRef<string>("");
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

    const sig = asset;
    const shouldAnimate = sig !== lastSigRef.current;
    lastSigRef.current = sig;

    const allPts: SpreadPoint[] = [...(history ?? []), ...(live ?? [])];
    const byPair = new Map<string, { time: number; value: number }[]>();
    for (const p of allPts) {
      if (!Number.isFinite(p.spreadAnnualizedPct) || Math.abs(p.spreadAnnualizedPct) > 150) continue;
      const key = `${p.longVenue} / ${p.shortVenue}`;
      if (!byPair.has(key)) byPair.set(key, []);
      byPair.get(key)!.push({
        time: Math.floor((p.computedAt ?? Date.now()) / 1000),
        value: p.spreadAnnualizedPct,
      });
    }

    let ci = 0;
    let firstSeries: SeriesApi | null = null;
    for (const [key, rawPts] of Array.from(byPair.entries())) {
      const deduped = Array.from(new Map(rawPts.map((p) => [p.time, p])).values()).sort((a, b) => a.time - b.time);
      const points =
        deduped.length === 1 ? [{ time: deduped[0]!.time - 60, value: deduped[0]!.value }, ...deduped] : deduped;
      const color = SPREAD_PAIR_COLORS[ci++ % SPREAD_PAIR_COLORS.length]!;
      const s = chart.addLineSeries(
        basisLineSeriesOptions(color, (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, { lastValue: false })
      );
      if (shouldAnimate) {
        animationsRef.current.push(animateSpreadDraw(s, points));
      } else {
        s.setData(points);
      }
      seriesMap.current.set(key, s);
      seriesColors.current.set(key, color);
      const last = points[points.length - 1];
      if (last) seriesLastPoint.current.set(key, last);
      if (!firstSeries) firstSeries = s;
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
  }, [chartApi, history, live]);

  useEffect(() => {
    for (const [id, series] of Array.from(seriesMap.current.entries())) {
      series.applyOptions({ visible: !hidden.has(id) });
    }
  }, [hidden, seriesVersion]);

  const seriesMeta = useMemo(
    () =>
      Array.from(seriesMap.current.entries()).map(([id, series]) => ({
        id,
        label: id,
        color: seriesColors.current.get(id) ?? CHART.accent,
        series,
        hidden: hidden.has(id),
      })),
    [seriesVersion, hidden]
  );

  const formatValue = useCallback((_id: string, v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, []);

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

  const pairs =
    (live as SpreadPoint[] | undefined)?.map((s, i) => ({
      id: `${s.longVenue} / ${s.shortVenue}`,
      label: `${s.longVenue} / ${s.shortVenue}`,
      pct: s.spreadAnnualizedPct,
      color: SPREAD_PAIR_COLORS[i % SPREAD_PAIR_COLORS.length]!,
    })) ?? [];

  const legendItems: LegendItem[] = pairs.map((p) => ({
    id: p.id,
    label: p.label,
    color: p.color,
    value: `${p.pct >= 0 ? "+" : ""}${p.pct.toFixed(2)}%`,
    hidden: hidden.has(p.id),
  }));

  return (
    <div className="panel overflow-hidden">
      <div className="panel-header">
        <p className="text-[13px] font-medium text-text-secondary">Pairwise spreads</p>
      </div>

      <ChartFrame
        chartRef={chartRef}
        containerRef={containerRef}
        height={CHART_H}
        tooltip={tooltip}
        liveDots={liveDots}
      />

      {legendItems.length > 0 && (
        <div className="px-4 py-2.5 border-t border-border-subtle">
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
        </div>
      )}
    </div>
  );
}
