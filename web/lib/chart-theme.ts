/** Shared lightweight-charts styling aligned with Basis design tokens */

export const CHART = {
  accent: "#34D399",
  accentMuted: "rgba(52, 211, 153, 0.14)",
  accentFade: "rgba(52, 211, 153, 0)",
  positive: "#34D399",
  negative: "#F87171",
  text: "#63636E",
  labelBg: "#17171A",
  markerBg: "#0B0B0C",
  grid: "rgba(255, 255, 255, 0.045)",
  crosshair: "rgba(52, 211, 153, 0.4)",
  zeroLine: "rgba(255, 255, 255, 0.1)",
  font: "var(--font-mono), ui-monospace, monospace",
  fontSize: 11,
} as const;

export const SPREAD_PAIR_COLORS = [
  "#34D399",
  "#60A5FA",
  "#F472B6",
  "#FBBF24",
  "#A78BFA",
  "#FB923C",
] as const;

export type LwcModule = typeof import("lightweight-charts");

export function basisChartOptions(
  lw: LwcModule,
  el: HTMLElement,
  height: number,
  opts?: { magnet?: boolean }
) {
  const { ColorType, CrosshairMode, LineStyle } = lw;
  return {
    layout: {
      background: { type: ColorType.Solid, color: "transparent" },
      textColor: CHART.text,
      fontSize: CHART.fontSize,
      fontFamily: CHART.font,
    },
    grid: {
      vertLines: { color: CHART.grid, style: LineStyle.Dotted },
      horzLines: { color: CHART.grid, style: LineStyle.Dotted },
    },
    rightPriceScale: {
      borderVisible: false,
      scaleMargins: { top: 0.16, bottom: 0.12 },
      minimumWidth: 58,
      autoScale: true,
    },
    timeScale: {
      borderVisible: false,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 10,
      barSpacing: 7,
      minBarSpacing: 4,
    },
    handleScroll: { vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: { time: true, price: true } },
    crosshair: {
      mode: opts?.magnet === false ? CrosshairMode.Normal : CrosshairMode.Magnet,
      vertLine: {
        color: CHART.crosshair,
        width: 1 as const,
        style: LineStyle.Dashed,
        labelBackgroundColor: CHART.labelBg,
      },
      horzLine: {
        color: CHART.crosshair,
        width: 1 as const,
        style: LineStyle.Dashed,
        labelBackgroundColor: CHART.labelBg,
      },
    },
    width: Math.floor(el.clientWidth),
    height,
  };
}

export function basisLineSeriesOptions(
  color: string,
  formatter: (v: number) => string,
  options?: { lastValue?: boolean; lineWidth?: number }
) {
  return {
    color,
    lineWidth: (options?.lineWidth ?? 2) as 2,
    lineType: 2 as const,
    priceFormat: { type: "custom" as const, formatter },
    lastValueVisible: options?.lastValue ?? true,
    priceLineVisible: false,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 5,
    crosshairMarkerBorderColor: color,
    crosshairMarkerBorderWidth: 2,
    crosshairMarkerBackgroundColor: CHART.markerBg,
  };
}

export function basisAreaSeriesOptions(formatter?: (v: number) => string) {
  return {
    lineColor: CHART.accent,
    topColor: CHART.accentMuted,
    bottomColor: CHART.accentFade,
    lineWidth: 2 as const,
    lineType: 2 as const,
    priceFormat: {
      type: "price" as const,
      precision: 4,
      minMove: 0.0001,
      ...(formatter ? {} : {}),
    },
    lastValueVisible: true,
    priceLineVisible: false,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 5,
    crosshairMarkerBorderColor: CHART.accent,
    crosshairMarkerBorderWidth: 2,
    crosshairMarkerBackgroundColor: CHART.markerBg,
  };
}

export function formatChartTime(time: number | { year: number; month: number; day: number }): string {
  let ms: number;
  if (typeof time === "number") {
    ms = time * 1000;
  } else {
    ms = Date.UTC(time.year, time.month - 1, time.day);
  }
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function navAutoscaleProvider(orig: () => { priceRange?: { minValue: number; maxValue: number } }) {
  const res = orig();
  if (!res?.priceRange) return res;
  const { minValue, maxValue } = res.priceRange;
  const mid = (minValue + maxValue) / 2;
  const half = Math.max((maxValue - minValue) / 2, 0.005);
  return { ...res, priceRange: { minValue: mid - half, maxValue: mid + half } };
}
