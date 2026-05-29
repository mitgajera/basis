"use client";

import { useEffect, useRef } from "react";
import { useSpreads, useSpreadHistory } from "../lib/api-client";
import type { Asset } from "./FundingSection";

const PAIR_COLORS = ["#00DDB8", "#F97316", "#5B9CF6", "#A78BFA", "#E879A0", "#EAB308"];

type SpreadPoint = { longVenue: string; shortVenue: string; spreadAnnualizedPct: number; computedAt?: number };
type ChartApi = { addLineSeries(o: unknown): SeriesApi; removeSeries(s: unknown): void; timeScale(): { fitContent(): void }; remove(): void };
type SeriesApi = { setData(d: { time: number; value: number }[]): void };

const CHART_H = 158;

export function SpreadChart({ asset }: { asset: Asset }) {
  const { data: live } = useSpreads(asset);
  const { data: history } = useSpreadHistory(24 * 3600_000, asset);

  const chartRef = useRef<HTMLDivElement>(null);
  const chartApi = useRef<ChartApi | null>(null);
  const seriesMap = useRef<Map<string, SeriesApi>>(new Map());

  useEffect(() => {
    if (!chartRef.current) return;
    let destroyed = false;
    import("lightweight-charts").then(({ createChart, ColorType, CrosshairMode, LineStyle }) => {
      if (destroyed || !chartRef.current) return;
      chartApi.current = createChart(chartRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#44445A",
          fontSize: 10,
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,0.025)", style: LineStyle.Dashed },
          horzLines: { color: "rgba(255,255,255,0.025)", style: LineStyle.Dashed },
        },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.1 } },
        timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: "rgba(255,255,255,0.15)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#12121E" },
          horzLine: { color: "rgba(255,255,255,0.15)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#12121E" },
        },
        width: chartRef.current.clientWidth,
        height: CHART_H,
      }) as ChartApi;
    });
    return () => {
      destroyed = true;
      if (chartApi.current) { chartApi.current.remove(); chartApi.current = null; seriesMap.current.clear(); }
    };
  }, []);

  useEffect(() => {
    if (!chartApi.current) return;
    const chart = chartApi.current;
    for (const s of seriesMap.current.values()) { try { chart.removeSeries(s); } catch { /* */ } }
    seriesMap.current.clear();

    const allPts: SpreadPoint[] = [...(history ?? []), ...(live ?? [])];
    const byPair = new Map<string, { time: number; value: number }[]>();
    for (const p of allPts) {
      const key = `${p.longVenue}↔${p.shortVenue}`;
      if (!byPair.has(key)) byPair.set(key, []);
      byPair.get(key)!.push({ time: Math.floor((p.computedAt ?? Date.now()) / 1000), value: p.spreadAnnualizedPct });
    }

    let ci = 0;
    for (const [key, rawPts] of byPair) {
      const deduped = Array.from(new Map(rawPts.map((p) => [p.time, p])).values()).sort((a, b) => a.time - b.time);
      const points = deduped.length === 1 ? [{ time: deduped[0]!.time - 60, value: deduped[0]!.value }, ...deduped] : deduped;
      const color = PAIR_COLORS[ci++ % PAIR_COLORS.length]!;
      const s = chart.addLineSeries({
        color, lineWidth: 2, lineType: 2,
        priceFormat: { type: "custom" as never, formatter: (v: number) => v.toFixed(2) + "%" },
        lastValueVisible: true, priceLineVisible: false,
        crosshairMarkerVisible: true, crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: color,
        crosshairMarkerBackgroundColor: "#0C0C16",
        title: key,
      });
      s.setData(points);
      seriesMap.current.set(key, s);
    }
    chart.timeScale().fitContent();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, live]);

  const pairs = (live as SpreadPoint[] | undefined)
    ?.map((s) => ({ key: `${s.longVenue}↔${s.shortVenue}`, pct: s.spreadAnnualizedPct })) ?? [];

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
        <span className="text-[10px] uppercase tracking-[0.12em] text-text-disabled font-medium">Spreads</span>
        {pairs.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            {pairs.map(({ key, pct }, i) => {
              const color = PAIR_COLORS[i % PAIR_COLORS.length]!;
              return (
                <span key={key} className="flex items-center gap-1.5 text-[10px]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 5px ${color}60` }} />
                  <span className="tabular-mono font-semibold" style={{ color }}>{pct >= 0 ? "+" : ""}{pct.toFixed(2)}%</span>
                  <span className="text-text-disabled hidden sm:inline">{key}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="relative">
        <div
          className="pointer-events-none absolute top-0 left-0 right-0 h-10 z-10"
          style={{ background: "linear-gradient(to bottom, rgba(12,12,24,0.25), transparent)" }}
        />
        <div ref={chartRef} className="w-full" style={{ height: CHART_H }} />
      </div>
    </div>
  );
}
