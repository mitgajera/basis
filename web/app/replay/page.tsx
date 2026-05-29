"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Header } from "../../components/Header";
import { ReplayScrubber } from "../../components/ReplayScrubber";
import { VenueLogo } from "../../components/VenueLogo";
import { useReplay } from "../../lib/api-client";
import { StatCard } from "../../components/StatCard";
import { formatUsd } from "../../lib/format";

const VENUE_COLORS: Record<string, string> = {
  pacifica: "#A78BFA",
  phoenix: "#F97316",
  backpack: "#3B82F6",
  drift: "#FACC15",
  jupiter: "#00E5C8",
};

function useDateRange() {
  const [startTs, setStartTs] = useState(() => Date.now() - 6 * 3600_000);
  const [endTs, setEndTs] = useState(() => Date.now());

  const safeSet = (setter: (v: number) => void) => (v: number) => {
    if (isFinite(v)) setter(v);
  };

  return { startTs, endTs, setStartTs: safeSet(setStartTs), setEndTs: safeSet(setEndTs) };
}

export default function ReplayPage() {
  const { startTs, endTs, setStartTs, setEndTs } = useDateRange();
  const { data, isLoading } = useReplay(startTs, endTs);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(5);
  const [currentTs, setCurrentTs] = useState(startTs);
  const rafRef = useRef<number | null>(null);
  const lastRealRef = useRef<number | null>(null);

  type SeriesApi = { setData(d: { time: number; value: number }[]): void };
  type ChartApi = { addLineSeries(o: unknown): SeriesApi; timeScale(): { fitContent(): void }; remove(): void };

  const fundingChartRef = useRef<HTMLDivElement>(null);
  const pnlChartRef = useRef<HTMLDivElement>(null);
  const fundingChart = useRef<ChartApi | null>(null);
  const pnlChart = useRef<ChartApi | null>(null);
  // pre-created series keyed by venue
  const fundingSeriesMap = useRef<Map<string, SeriesApi>>(new Map());
  const pnlSeries = useRef<SeriesApi | null>(null);
  const chartsReady = useRef(false);

  // Init charts + pre-create one series per venue
  useEffect(() => {
    let destroyed = false;
    import("lightweight-charts").then(({ createChart, ColorType, CrosshairMode, LineStyle }) => {
      if (destroyed || !fundingChartRef.current || !pnlChartRef.current) return;

      const chartOpts = (el: HTMLDivElement, h: number) => createChart(el, {
        layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#71717A", fontSize: 11 },
        grid: { vertLines: { color: "#1C1C1E", style: LineStyle.Dashed }, horzLines: { color: "#1C1C1E", style: LineStyle.Dashed } },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.1 } },
        timeScale: { borderVisible: false, timeVisible: true },
        crosshair: { mode: CrosshairMode.Normal },
        width: el.clientWidth,
        height: h,
      }) as ChartApi;

      const fc = chartOpts(fundingChartRef.current!, 220);
      fundingChart.current = fc;
      // Pre-create a series for every known venue so setData works synchronously later
      for (const [venue, color] of Object.entries(VENUE_COLORS)) {
        const s = fc.addLineSeries({
          color, lineWidth: 3, lineType: 2,
          priceFormat: { type: "custom" as never, formatter: (v: number) => v.toFixed(2) + "%" },
          lastValueVisible: true, priceLineVisible: false,
        });
        s.setData([]);
        fundingSeriesMap.current.set(venue, s);
      }

      const pc = chartOpts(pnlChartRef.current!, 160);
      pnlChart.current = pc;
      pnlSeries.current = pc.addLineSeries({
        color: "#00E5C8", lineWidth: 2, lineType: 2,
        priceFormat: { type: "custom" as never, formatter: (v: number) => formatUsd(v, { compact: true }) } as never,
        lastValueVisible: true, priceLineVisible: false,
      });
      pnlSeries.current.setData([]);

      chartsReady.current = true;
    });

    return () => {
      destroyed = true;
      chartsReady.current = false;
      fundingChart.current?.remove(); fundingChart.current = null;
      pnlChart.current?.remove(); pnlChart.current = null;
      fundingSeriesMap.current.clear();
      pnlSeries.current = null;
    };
  }, []);

  // Render data up to currentTs — fully synchronous, no async inside
  useEffect(() => {
    if (!chartsReady.current || !data) return;

    const cutoff = Math.floor(currentTs / 1000);
    const fundingRates: Array<{ venue: string; annualizedPct: number; lastUpdated: number }> = data.fundingRates ?? [];
    const trades: Array<{ opened_at: number; pnl_cumulative?: number }> = data.trades ?? [];

    // Group and filter by playback time
    const byVenue = new Map<string, { time: number; value: number }[]>();
    for (const r of fundingRates) {
      const t = Math.floor(r.lastUpdated / 1000);
      if (t > cutoff) continue;
      if (!byVenue.has(r.venue)) byVenue.set(r.venue, []);
      byVenue.get(r.venue)!.push({ time: t, value: r.annualizedPct });
    }

    // Push data into pre-created series (dedup + sort)
    for (const [venue, s] of fundingSeriesMap.current) {
      const pts = byVenue.get(venue) ?? [];
      const deduped = Array.from(new Map(pts.map((p) => [p.time, p])).values())
        .sort((a, b) => a.time - b.time);
      s.setData(deduped);
    }
    if (byVenue.size > 0) fundingChart.current?.timeScale().fitContent();

    // PnL
    if (pnlSeries.current) {
      const pnlPts = trades
        .filter((t) => t.pnl_cumulative != null && t.opened_at <= currentTs)
        .map((t) => ({ time: Math.floor(t.opened_at / 1000), value: t.pnl_cumulative! }))
        .sort((a, b) => a.time - b.time);
      pnlSeries.current.setData(pnlPts);
      if (pnlPts.length > 0) pnlChart.current?.timeScale().fitContent();
    }
  }, [data, currentTs]);

  // Playback loop
  const tick = useCallback(() => {
    const now = performance.now();
    if (lastRealRef.current === null) {
      lastRealRef.current = now;
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    const realDelta = now - lastRealRef.current;
    lastRealRef.current = now;
    setCurrentTs((ts) => {
      const next = ts + realDelta * speed * 1000;
      if (next >= endTs) {
        setPlaying(false);
        return endTs;
      }
      return next;
    });
    rafRef.current = requestAnimationFrame(tick);
  }, [speed, endTs]);

  useEffect(() => {
    if (playing) {
      lastRealRef.current = null;
      rafRef.current = requestAnimationFrame(tick);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, tick]);

  const stats = {
    opportunities: (data?.spreads ?? []).length,
    entered: (data?.trades ?? []).filter((t: { status: string }) => t.status === "filled" || t.status === "simulated").length,
    winRate: (() => {
      const closed = (data?.trades ?? []).filter((t: { closed_at?: number; pnl?: number }) => t.closed_at != null);
      if (!closed.length) return null;
      const wins = closed.filter((t: { pnl?: number }) => (t.pnl ?? 0) > 0).length;
      return (wins / closed.length) * 100;
    })(),
  };

  return (
    <div className="min-h-screen bg-bg-base">
      <Header />
      <main className="mx-auto max-w-screen-2xl px-6 py-8 space-y-6">
        <div>
          <h1 className="text-lg font-medium text-text-primary">Replay Simulator</h1>
          <p className="text-sm text-text-tertiary mt-0.5">
            Historical funding rate playback with simulated bot decisions.
          </p>
        </div>

        {/* Date pickers + controls */}
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <span className="text-text-tertiary text-xs uppercase tracking-wide">From</span>
            <input
              type="datetime-local"
              value={isFinite(startTs) ? new Date(startTs).toISOString().slice(0, 16) : ""}
              onChange={(e) => setStartTs(new Date(e.target.value).getTime())}
              className="bg-bg-surface border border-border-default rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-border"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <span className="text-text-tertiary text-xs uppercase tracking-wide">To</span>
            <input
              type="datetime-local"
              value={isFinite(endTs) ? new Date(endTs).toISOString().slice(0, 16) : ""}
              onChange={(e) => setEndTs(new Date(e.target.value).getTime())}
              className="bg-bg-surface border border-border-default rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-border"
            />
          </label>
        </div>

        <ReplayScrubber
          startTs={startTs}
          endTs={endTs}
          currentTs={currentTs}
          playing={playing}
          speed={speed}
          onPlay={() => { if (currentTs >= endTs) setCurrentTs(startTs); setPlaying(true); }}
          onPause={() => setPlaying(false)}
          onSeek={setCurrentTs}
          onSpeedChange={setSpeed}
          onSkipStart={() => { setPlaying(false); setCurrentTs(startTs); }}
          onSkipEnd={() => { setPlaying(false); setCurrentTs(endTs); }}
        />

        {isLoading ? (
          <div className="h-[200px] rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center">
            <p className="text-sm text-text-tertiary">Loading historical data...</p>
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-border-subtle bg-bg-surface overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
                <p className="uppercase text-[11px] tracking-[0.05em] text-text-tertiary">Funding Rates</p>
                <div className="flex items-center gap-3">
                  {Object.keys(VENUE_COLORS).map((v) => (
                    <span key={v} className="flex items-center gap-1.5 text-xs text-text-tertiary capitalize">
                      <VenueLogo venue={v} size={14} />{v}
                    </span>
                  ))}
                </div>
              </div>
              <div ref={fundingChartRef} className="w-full h-[200px]" />
            </div>

            <div className="rounded-lg border border-border-subtle bg-bg-surface overflow-hidden">
              <div className="px-6 py-4 border-b border-border-subtle">
                <p className="uppercase text-[11px] tracking-[0.05em] text-text-tertiary">Simulated PnL</p>
              </div>
              <div ref={pnlChartRef} className="w-full h-[160px]" />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <StatCard label="Opportunities" value={String(stats.opportunities)} helper="in range" />
              <StatCard label="Entered" value={String(stats.entered)} helper="trades" />
              <StatCard label="Win Rate" value={stats.winRate != null ? `${stats.winRate.toFixed(1)}%` : "—"} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
