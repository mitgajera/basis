"use client";

import { useEffect, useState, type RefObject } from "react";
import { formatChartTime } from "../lib/chart-theme";

export type CrosshairTooltipItem = {
  id: string;
  label: string;
  color: string;
  value: string;
};

export type CrosshairTooltipState = {
  x: number;
  y: number;
  time: string;
  items: CrosshairTooltipItem[];
};

type SeriesEntry = {
  id: string;
  label: string;
  color: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  series: any;
  hidden?: boolean;
};

export type CrosshairChartApi = {
  subscribeCrosshairMove(handler: (p: CrosshairParam) => void): void;
  unsubscribeCrosshairMove(handler: (p: CrosshairParam) => void): void;
};

type CrosshairParam = {
  time?: number | { year: number; month: number; day: number };
  point?: { x: number; y: number };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  seriesData: Map<any, { value?: number }>;
};

export function useChartCrosshair(
  chart: CrosshairChartApi | null,
  seriesList: SeriesEntry[],
  containerRef: RefObject<HTMLElement | null>,
  formatValue: (id: string, value: number) => string
) {
  const [tooltip, setTooltip] = useState<CrosshairTooltipState | null>(null);

  useEffect(() => {
    if (!chart) return;

    const handler = (param: CrosshairParam) => {
      if (!param.time || !param.point) {
        setTooltip(null);
        return;
      }

      const items: CrosshairTooltipItem[] = [];
      for (const entry of seriesList) {
        if (entry.hidden) continue;
        const data = param.seriesData.get(entry.series);
        const value = data?.value;
        if (value === undefined || !Number.isFinite(value)) continue;
        items.push({
          id: entry.id,
          label: entry.label,
          color: entry.color,
          value: formatValue(entry.id, value),
        });
      }

      if (items.length === 0) {
        setTooltip(null);
        return;
      }

      const container = containerRef.current;
      const maxX = container ? container.clientWidth - 168 : param.point.x;
      const time =
        typeof param.time === "number"
          ? formatChartTime(param.time)
          : formatChartTime(param.time);

      setTooltip({
        x: Math.min(Math.max(param.point.x, 8), maxX),
        y: param.point.y,
        time,
        items: items.sort((a, b) => {
          const av = parseFloat(a.value.replace(/[^0-9.-]/g, "")) || 0;
          const bv = parseFloat(b.value.replace(/[^0-9.-]/g, "")) || 0;
          return bv - av;
        }),
      });
    };

    chart.subscribeCrosshairMove(handler);
    return () => chart.unsubscribeCrosshairMove(handler);
  }, [chart, seriesList, containerRef, formatValue]);

  return tooltip;
}
