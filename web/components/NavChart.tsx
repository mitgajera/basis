"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNav } from "../lib/api-client";
import {
  basisAreaSeriesOptions,
  basisChartOptions,
  CHART,
  navAutoscaleProvider,
} from "../lib/chart-theme";
import { useChartCrosshair } from "../hooks/useChartCrosshair";
import { useLiveDots, type LiveDotsSeriesEntry } from "../hooks/useLiveDots";
import { ChartFrame } from "./ChartFrame";
import { SegmentedControl } from "./SegmentedControl";

const RANGES = ["24h", "7d", "30d", "All"] as const;
type Range = (typeof RANGES)[number];
const CHART_H = 220;
const DRAW_MS = 800;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function animateNavDraw(
  series: { setData(d: Array<{ time: number; value: number }>): void },
  values: Array<{ time: number; value: number }>
): { cancel: () => void } {
  if (values.length === 0) return { cancel: () => {} };
  let rafId = 0;
  const startTs = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - startTs) / DRAW_MS);
    const n = Math.max(2, Math.ceil(values.length * easeOut(t)));
    series.setData(values.slice(0, n));
    if (t < 1) rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
  return { cancel: () => cancelAnimationFrame(rafId) };
}

export function NavChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<unknown>(null);
  const areaSeriesRef = useRef<unknown>(null);
  const [chartApi, setChartApi] = useState<unknown>(null);
  const [seriesReady, setSeriesReady] = useState(false);

  const { data } = useNav();
  const [range, setRange] = useState<Range>("7d");
  const lastSigRef = useRef<string>("");
  const animationRef = useRef<{ cancel: () => void } | null>(null);
  const lastPointRef = useRef<{ time: number; value: number } | null>(null);
  const [lastPointVersion, setLastPointVersion] = useState(0);

  const history: Array<{ timestamp: number; navPerShare: number }> = data?.history ?? [];
  const current: number = data?.snapshot?.navPerShare ?? data?.snapshot?.nav_per_share ?? 1;

  const delta = (ms: number) => {
    const cutoff = Date.now() - ms;
    const oldest = history.find((h) => h.timestamp >= cutoff && h.navPerShare >= 0.5);
    if (!oldest) return null;
    return ((current - oldest.navPerShare) / oldest.navPerShare) * 100;
  };
  const d24h = delta(24 * 3600_000);
  const d7d = delta(7 * 24 * 3600_000);

  useEffect(() => {
    if (!chartRef.current) return;
    let destroyed = false;
    import("lightweight-charts").then((lw) => {
      if (destroyed || !chartRef.current) return;
      const chart = lw.createChart(chartRef.current, basisChartOptions(lw, chartRef.current, CHART_H));
      const areaSeries = chart.addAreaSeries({
        ...basisAreaSeriesOptions(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        autoscaleInfoProvider: (orig: () => any) => navAutoscaleProvider(orig),
      });
      areaSeriesRef.current = areaSeries;
      chartApiRef.current = chart;
      setChartApi(chart);
      setSeriesReady(true);
    });

    return () => {
      destroyed = true;
      (chartApiRef.current as { remove(): void } | null)?.remove();
      chartApiRef.current = null;
      areaSeriesRef.current = null;
      setChartApi(null);
      setSeriesReady(false);
    };
  }, []);

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && chartApiRef.current) {
        (chartApiRef.current as { applyOptions(o: unknown): void }).applyOptions({ width: Math.floor(w) });
      }
    });
    if (chartRef.current) ro.observe(chartRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!areaSeriesRef.current) return;
    const series = areaSeriesRef.current as { setData(d: Array<{ time: number; value: number }>): void };
    const cutoffMs =
      range === "All" ? 0 : range === "7d" ? Date.now() - 7 * 24 * 3600_000 : range === "30d" ? Date.now() - 30 * 24 * 3600_000 : Date.now() - 24 * 3600_000;

    let sorted = [...history]
      .filter((h) => h.timestamp >= cutoffMs && h.navPerShare >= 0.5 && Number.isFinite(h.navPerShare))
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((h) => ({ time: Math.floor(h.timestamp / 1000), value: h.navPerShare }));

    sorted = Array.from(new Map(sorted.map((p) => [p.time, p])).values());

    if (sorted.length === 0) {
      const now = Math.floor(Date.now() / 1000);
      sorted = [{ time: now - 3600, value: 1 }, { time: now, value: 1 }];
    } else if (sorted.length === 1) {
      sorted = [{ time: sorted[0]!.time - 60, value: sorted[0]!.value }, ...sorted];
    }

    animationRef.current?.cancel();
    animationRef.current = null;

    const sig = range;
    const shouldAnimate = sig !== lastSigRef.current;
    lastSigRef.current = sig;

    if (shouldAnimate) {
      animationRef.current = animateNavDraw(series, sorted);
    } else {
      series.setData(sorted);
    }
    (chartApiRef.current as { timeScale(): { fitContent(): void } } | null)?.timeScale().fitContent();

    const last = sorted[sorted.length - 1];
    lastPointRef.current = last ? { time: last.time, value: last.value } : null;
    setLastPointVersion((v) => v + 1);
  }, [history, range, chartApi]);

  const seriesMeta = useMemo(
    () =>
      seriesReady && areaSeriesRef.current
        ? [{ id: "nav", label: "NAV", color: CHART.accent, series: areaSeriesRef.current }]
        : [],
    [seriesReady]
  );

  const formatNavValue = useCallback((_id: string, v: number) => `$${v.toFixed(4)}`, []);

  const tooltip = useChartCrosshair(
    chartApi as import("../hooks/useChartCrosshair").CrosshairChartApi | null,
    seriesMeta,
    containerRef,
    formatNavValue
  );

  const liveDotsEntries: LiveDotsSeriesEntry[] = useMemo(
    () =>
      seriesReady && areaSeriesRef.current && lastPointRef.current
        ? [
            {
              id: "nav",
              color: CHART.accent,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              series: areaSeriesRef.current as any,
              lastPoint: lastPointRef.current,
            },
          ]
        : [],
    [seriesReady, lastPointVersion]
  );

  const liveDots = useLiveDots(
    chartApi as import("../hooks/useLiveDots").LiveDotsChartApi | null,
    liveDotsEntries
  );

  return (
    <div className="panel overflow-hidden">
      <div className="panel-header flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-text-secondary mb-1.5">NAV per share</p>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="tabular-mono text-[26px] font-medium text-text-primary leading-none tracking-tight">
              ${current.toFixed(4)}
            </span>
            {d24h != null && (
              <span className={`tabular-mono text-[12px] font-medium ${d24h >= 0 ? "text-positive" : "text-negative"}`}>
                {d24h >= 0 ? "+" : ""}
                {d24h.toFixed(3)}% 24h
              </span>
            )}
            {d7d != null && (
              <span className="tabular-mono text-[12px] text-text-tertiary">
                {d7d >= 0 ? "+" : ""}
                {d7d.toFixed(3)}% 7d
              </span>
            )}
          </div>
        </div>
        <SegmentedControl
          options={RANGES.map((r) => ({ value: r, label: r }))}
          value={range}
          onChange={setRange}
        />
      </div>
      <ChartFrame
        chartRef={chartRef}
        containerRef={containerRef}
        height={CHART_H}
        tooltip={tooltip}
        liveDots={liveDots}
      />
    </div>
  );
}
