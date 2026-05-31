"use client";

import { useEffect, useState } from "react";

type SeriesPriceApi = {
  priceToCoordinate(value: number): number | null;
};

type TimeScaleApi = {
  timeToCoordinate(t: number): number | null;
  subscribeVisibleTimeRangeChange(handler: () => void): void;
  unsubscribeVisibleTimeRangeChange(handler: () => void): void;
};

export type LiveDotsChartApi = {
  timeScale(): TimeScaleApi;
};

export type LiveDotsSeriesEntry = {
  id: string;
  color: string;
  series: SeriesPriceApi;
  lastPoint: { time: number; value: number } | null;
  hidden?: boolean;
};

export type LiveDot = { id: string; x: number; y: number; color: string };

/**
 * Compute pixel coordinates of each series' most recent data point.
 * Re-runs on visible time-range changes (pan / zoom) and on a soft interval
 * to catch chart auto-resize without subscribing to every internal event.
 */
export function useLiveDots(
  chart: LiveDotsChartApi | null,
  entries: LiveDotsSeriesEntry[],
  freshnessMs: number = 60_000
): LiveDot[] {
  const [dots, setDots] = useState<LiveDot[]>([]);

  useEffect(() => {
    if (!chart) {
      setDots([]);
      return;
    }
    const ts = chart.timeScale();

    const recompute = () => {
      const out: LiveDot[] = [];
      const freshCutoffSec = (Date.now() - freshnessMs) / 1000;
      for (const e of entries) {
        if (e.hidden || !e.lastPoint) continue;
        if (e.lastPoint.time < freshCutoffSec) continue; // skip stale series
        const x = ts.timeToCoordinate(e.lastPoint.time);
        const y = e.series.priceToCoordinate(e.lastPoint.value);
        if (
          x != null &&
          y != null &&
          Number.isFinite(x) &&
          Number.isFinite(y)
        ) {
          out.push({ id: e.id, x, y, color: e.color });
        }
      }
      setDots(out);
    };

    recompute();
    ts.subscribeVisibleTimeRangeChange(recompute);
    const interval = window.setInterval(recompute, 500);

    return () => {
      ts.unsubscribeVisibleTimeRangeChange(recompute);
      clearInterval(interval);
    };
  }, [chart, entries, freshnessMs]);

  return dots;
}
