"use client";

import { useEffect, useRef, useState } from "react";
import { useFundingRates, useFundingRateHistory, useTrades } from "../lib/api-client";
import type { Asset } from "./FundingSection";

const VENUE_COLORS: Record<string, string> = {
  backpack:    "#5B9CF6",
  pacifica:    "#E879A0",
  phoenix:     "#F97316",
  drift:       "#EAB308",
  jupiter:     "#22C98A",
  hyperliquid: "#84CC16",
};

const LOOKBACKS = [
  { label: "5m", ms: 5 * 60_000 },
  { label: "15m", ms: 15 * 60_000 },
  { label: "1h",  ms: 60 * 60_000 },
  { label: "24h", ms: 24 * 3600_000 },
  { label: "7d",  ms: 7  * 24 * 3600_000 },
];

type Tab = "funding" | "pnl";
type FundingPoint = { venue: string; asset?: string; annualizedPct: number; lastUpdated: number };
type ChartApi = {
  addLineSeries(o: unknown): SeriesApi;
  removeSeries(s: unknown): void;
  timeScale(): { fitContent(): void };
  applyOptions(o: unknown): void;
  remove(): void;
};
type SeriesApi = { setData(d: { time: number; value: number }[]): void };

const CHART_H = 268;

export function FundingChart({ asset }: { asset: Asset }) {
  const [tab, setTab] = useState<Tab>("funding");
  const [lookbackIdx, setLookbackIdx] = useState(1);
  const lookbackMs = LOOKBACKS[lookbackIdx]!.ms;

  const { data: live } = useFundingRates();
  const { data: history } = useFundingRateHistory(lookbackMs);
  const { data: trades } = useTrades(200);

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
        rightPriceScale: {
          borderVisible: false,
          scaleMargins: { top: 0.12, bottom: 0.08 },
          textColor: "#44445A",
        },
        timeScale: {
          borderVisible: false,
          timeVisible: true,
          secondsVisible: false,
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: "rgba(255,255,255,0.15)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#12121E" },
          horzLine: { color: "rgba(255,255,255,0.15)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#12121E" },
        },
        width: chartRef.current.clientWidth,
        height: CHART_H,
      }) as ChartApi;
    });
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && chartApi.current) chartApi.current.applyOptions({ width: Math.floor(w) });
    });
    ro.observe(chartRef.current);

    return () => {
      destroyed = true;
      ro.disconnect();
      if (chartApi.current) { chartApi.current.remove(); chartApi.current = null; seriesMap.current.clear(); }
    };
  }, []);

  useEffect(() => {
    if (!chartApi.current) return;
    const chart = chartApi.current;
    for (const s of seriesMap.current.values()) { try { chart.removeSeries(s); } catch { /* */ } }
    seriesMap.current.clear();

    const cutoff = Math.floor((Date.now() - lookbackMs) / 1000);

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
      for (const [venue, rawPts] of byVenue) {
        const deduped = Array.from(new Map(rawPts.map((p) => [p.time, p])).values()).sort((a, b) => a.time - b.time);
        const points = deduped.length === 1 ? [{ time: deduped[0]!.time - 60, value: deduped[0]!.value }, ...deduped] : deduped;
        const color = VENUE_COLORS[venue] ?? "#52526A";
        const s = chart.addLineSeries({
          color,
          lineWidth: 2,
          lineType: 2,
          priceFormat: { type: "custom" as never, formatter: (v: number) => v.toFixed(2) + "%" },
          lastValueVisible: true,
          priceLineVisible: false,
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 4,
          crosshairMarkerBorderColor: color,
          crosshairMarkerBackgroundColor: "#0C0C16",
        });
        s.setData(points);
        seriesMap.current.set(venue, s);
      }
    } else {
      // Build a cumulative realized-PnL line from closed trade legs
      type Tr = { openedAt: number; closedAt: number | null; pnlUsd: number | null };
      const closed = ((trades as Tr[]) ?? [])
        .filter((t) => t.pnlUsd != null && Number.isFinite(t.pnlUsd))
        .map((t) => ({ time: Math.floor((t.closedAt ?? t.openedAt) / 1000), pnl: t.pnlUsd! }))
        .filter((t) => t.time >= cutoff)
        .sort((a, b) => a.time - b.time);

      let cum = 0;
      const raw = closed.map((c) => { cum += c.pnl; return { time: c.time, value: cum }; });
      // Collapse identical timestamps to the latest cumulative value (strictly increasing time)
      let pnlPts = Array.from(new Map(raw.map((p) => [p.time, p])).values());

      // Flat $0 baseline when nothing has settled yet
      if (pnlPts.length === 0) {
        const now = Math.floor(Date.now() / 1000);
        pnlPts = [{ time: now - 3600, value: 0 }, { time: now, value: 0 }];
      } else if (pnlPts.length === 1) {
        pnlPts = [{ time: pnlPts[0]!.time - 60, value: 0 }, ...pnlPts];
      }

      const lastVal = pnlPts[pnlPts.length - 1]!.value;
      const color = lastVal >= 0 ? "#1EC996" : "#FF5252";
      const s = chart.addLineSeries({
        color,
        lineWidth: 2,
        lineType: 2,
        priceFormat: { type: "custom" as never, formatter: (v: number) => `${v >= 0 ? "+" : ""}$${v.toFixed(4)}` },
        lastValueVisible: true,
        priceLineVisible: false,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: color,
        crosshairMarkerBackgroundColor: "#0C0C16",
      });
      s.setData(pnlPts);
      seriesMap.current.set("__pnl__", s);
    }
    chart.timeScale().fitContent();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, live, trades, tab, lookbackMs, asset]);

  const liveRates: FundingPoint[] = (live as FundingPoint[]) ?? [];
  const activeVenues = liveRates.filter((r) => !r.asset || r.asset === asset).map((r) => r.venue);

  return (
    <div className="glass-card rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
        <div className="flex items-center gap-1">
          {(["funding", "pnl"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all duration-150 ${
                tab === t ? "bg-white/[0.07] text-text-primary" : "text-text-disabled hover:text-text-secondary"
              }`}
            >
              {t === "funding" ? "Funding" : "PnL"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5">
          {LOOKBACKS.map((l, i) => (
            <button
              key={l.label}
              onClick={() => setLookbackIdx(i)}
              className={`text-[11px] px-2 py-0.5 rounded-md transition-all duration-150 ${
                lookbackIdx === i ? "bg-white/[0.07] text-text-primary font-medium" : "text-text-disabled hover:text-text-secondary"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="relative flex-1">
        {/* Subtle top gradient overlay */}
        <div
          className="pointer-events-none absolute top-0 left-0 right-0 h-16 z-10"
          style={{ background: "linear-gradient(to bottom, rgba(12,12,24,0.3), transparent)" }}
        />
        <div ref={chartRef} className="w-full" style={{ height: CHART_H }} />
      </div>

      {/* Legend */}
      <div className="flex items-center px-4 py-2.5 gap-3 border-t border-white/[0.04] flex-wrap min-h-[34px]">
        {tab === "funding" ? (
          activeVenues.length > 0 ? activeVenues.map((v) => {
            const color = VENUE_COLORS[v] ?? "#52526A";
            return (
              <span key={v} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}60` }} />
                <span className="text-[10px] uppercase tracking-[0.10em] font-medium" style={{ color }}>{v}</span>
              </span>
            );
          }) : <span className="text-[11px] text-text-disabled">Awaiting data…</span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "#00DDB8", boxShadow: "0 0 6px rgba(0,221,184,0.5)" }} />
            <span className="text-[10px] uppercase tracking-[0.10em] font-medium text-accent">Cumulative PnL</span>
          </span>
        )}
      </div>
    </div>
  );
}
