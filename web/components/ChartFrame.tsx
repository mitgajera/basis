"use client";

import type { CrosshairTooltipState } from "../hooks/useChartCrosshair";
import type { LiveDot } from "../hooks/useLiveDots";

export function ChartFrame({
  chartRef,
  containerRef,
  height,
  tooltip,
  liveDots,
  children,
}: {
  chartRef: React.Ref<HTMLDivElement>;
  containerRef: React.Ref<HTMLDivElement>;
  height: number;
  tooltip: CrosshairTooltipState | null;
  liveDots?: LiveDot[];
  children?: React.ReactNode;
}) {
  return (
    <div ref={containerRef} className="relative chart-frame">
      <div ref={chartRef} className="w-full" style={{ height }} />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[var(--bg-surface)] via-[var(--bg-surface)]/60 to-transparent"
        aria-hidden
      />
      {liveDots?.map((d) => (
        <span
          key={d.id}
          className="chart-live-dot"
          style={{ left: d.x, top: d.y, color: d.color }}
          aria-hidden
        />
      ))}
      {tooltip && (
        <div
          className="chart-tooltip pointer-events-none absolute z-20"
          style={{
            left: tooltip.x + 14,
            top: Math.min(Math.max(tooltip.y, 24), height - 24),
            transform: "translateY(-50%)",
          }}
        >
          <p className="tabular-mono text-[10px] text-text-tertiary mb-1.5 pb-1.5 border-b border-border-subtle uppercase tracking-[0.06em]">
            {tooltip.time}
          </p>
          <ul className="space-y-[5px]">
            {tooltip.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="chart-tooltip-dot"
                    style={{ background: item.color, boxShadow: `0 0 0 2px ${item.color}1f` }}
                  />
                  <span className="text-[11px] text-text-secondary truncate capitalize">{item.label}</span>
                </span>
                <span className="tabular-mono text-[11.5px] font-medium text-text-primary shrink-0">
                  {item.value}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {children}
    </div>
  );
}
