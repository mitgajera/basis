"use client";

import { useEffect, useRef, useState } from "react";
import { useNav } from "../lib/api-client";

const RANGES = ["5m","24h", "7d", "All"] as const;
type Range = (typeof RANGES)[number];

export function NavChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const { data } = useNav();
  const [range, setRange] = useState<Range>("7d");
  const [ready, setReady] = useState(false);
  const chartInstance = useRef<unknown>(null);
  const areaSeriesRef = useRef<unknown>(null);

  const history: Array<{ timestamp: number; navPerShare: number }> = data?.history ?? [];
  const current: number = data?.snapshot?.navPerShare ?? data?.snapshot?.nav_per_share ?? 1;

  const delta = (ms: number) => {
    const cutoff = Date.now() - ms;
    // Use the first SANE baseline (NAV is yield-only, always ~1.0+; ignore bad reads)
    const oldest = history.find((h) => h.timestamp >= cutoff && h.navPerShare >= 0.5);
    if (!oldest) return null;
    return ((current - oldest.navPerShare) / oldest.navPerShare) * 100;
  };
  const d24h = delta(24 * 3600_000);
  const d7d  = delta(7 * 24 * 3600_000);

  useEffect(() => {
    if (!chartRef.current) return;
    let destroyed = false;
    import("lightweight-charts").then(({ createChart, ColorType, CrosshairMode, LineStyle }) => {
      if (destroyed || !chartRef.current) return;
      const chart = createChart(chartRef.current, {
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
          scaleMargins: { top: 0.15, bottom: 0.05 },
          textColor: "#44445A",
        },
        timeScale: {
          borderVisible: false,
          timeVisible: true,
          secondsVisible: false,
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: "rgba(0,221,184,0.3)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#12121E" },
          horzLine: { color: "rgba(0,221,184,0.3)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#12121E" },
        },
        width: chartRef.current.clientWidth,
        height: 172,
      });
      const areaSeries = (chart as unknown as { addAreaSeries(o: unknown): unknown }).addAreaSeries({
        lineColor: "#00DDB8",
        topColor: "rgba(0, 221, 184, 0.22)",
        bottomColor: "rgba(0, 221, 184, 0.00)",
        lineWidth: 2,
        lineType: 2,
        priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
        lastValueVisible: true,
        priceLineVisible: false,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: "#00DDB8",
        crosshairMarkerBackgroundColor: "#12121E",
        // Enforce a minimum y-span (±0.5%) so micro NAV moves don't get
        // stretched to full height by autoscale and look dramatic.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        autoscaleInfoProvider: (orig: () => any) => {
          const res = orig();
          if (!res?.priceRange) return res;
          const { minValue, maxValue } = res.priceRange;
          const mid = (minValue + maxValue) / 2;
          const half = Math.max((maxValue - minValue) / 2, 0.005); // ≥1% total band
          return { ...res, priceRange: { minValue: mid - half, maxValue: mid + half } };
        },
      });
      areaSeriesRef.current = areaSeries;
      chartInstance.current = chart;
      setReady(true);
    });

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && chartInstance.current) (chartInstance.current as { applyOptions(o: unknown): void }).applyOptions({ width: Math.floor(w) });
    });
    if (chartRef.current) ro.observe(chartRef.current);

    return () => {
      destroyed = true;
      ro.disconnect();
      setReady(false);
      if (chartInstance.current) {
        (chartInstance.current as { remove(): void }).remove();
        chartInstance.current = null;
        areaSeriesRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!areaSeriesRef.current) return;
    const series = areaSeriesRef.current as { setData(d: Array<{ time: number; value: number }>): void };
    const cutoffMs = range === "All" ? 0 : range === "7d" ? Date.now() - 24 * 7 * 24 * 3600_000 : range === "5m" ? Date.now() - 5 *5 * 60_000 : Date.now() - 24 * 3600_000;
    let sorted = [...history]
      .filter((h) => h.timestamp >= cutoffMs && h.navPerShare >= 0.5 && Number.isFinite(h.navPerShare))
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((h) => ({ time: Math.floor(h.timestamp / 1000), value: h.navPerShare }));

    // Dedupe identical timestamps (lightweight-charts requires strictly increasing time)
    sorted = Array.from(new Map(sorted.map((p) => [p.time, p])).values());

    // Ensure a visible baseline even when the vault has no NAV history yet
    if (sorted.length === 0) {
      const now = Math.floor(Date.now() / 1000);
      sorted = [{ time: now - 3600, value: 1 }, { time: now, value: 1 }];
    } else if (sorted.length === 1) {
      sorted = [{ time: sorted[0]!.time - 60, value: sorted[0]!.value }, ...sorted];
    }

    series.setData(sorted);
    (chartInstance.current as { timeScale(): { fitContent(): void } } | null)?.timeScale().fitContent();
  }, [history, range, ready]);

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-text-disabled font-medium mb-1.5">NAV per Share</p>
          <div className="flex items-baseline gap-2.5">
            <span className="tabular-mono text-[22px] font-semibold text-text-primary leading-none">${current.toFixed(4)}</span>
            {d24h != null && (
              <span className={`tabular-mono text-[11px] font-medium ${d24h >= 0 ? "text-positive" : "text-negative"}`}>
                {d24h >= 0 ? "+" : ""}{d24h.toFixed(3)}%
              </span>
            )}
            {d7d != null && (
              <span className="tabular-mono text-[11px] text-text-disabled">
                {d7d >= 0 ? "+" : ""}{d7d.toFixed(3)}% 7d
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`text-[11px] px-2 py-0.5 rounded-md transition-all duration-150 ${
                range === r ? "bg-white/[0.07] text-text-primary font-medium" : "text-text-disabled hover:text-text-secondary"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Chart with subtle inner glow at top */}
      <div className="relative">
        <div
          className="pointer-events-none absolute top-0 left-0 right-0 h-12 z-10"
          style={{ background: "linear-gradient(to bottom, rgba(0,221,184,0.04), transparent)" }}
        />
        <div ref={chartRef} className="w-full" style={{ height: 172 }} />
      </div>
    </div>
  );
}
