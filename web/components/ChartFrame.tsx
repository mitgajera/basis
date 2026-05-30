"use client";

import type { CrosshairTooltipState } from "../hooks/useChartCrosshair";

export function ChartFrame({
  chartRef,
  containerRef,
  height,
  tooltip,
  children,
}: {
  chartRef: React.Ref<HTMLDivElement>;
  containerRef: React.Ref<HTMLDivElement>;
  height: number;
  tooltip: CrosshairTooltipState | null;
  children?: React.ReactNode;
}) {
  return (
    <div ref={containerRef} className="relative chart-frame">
      <div ref={chartRef} className="w-full" style={{ height }} />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[var(--bg-surface)] via-[var(--bg-surface)]/60 to-transparent"
        aria-hidden
      />
      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 min-w-[140px] max-w-[200px] rounded-lg border border-border-default bg-[#141416]/95 px-2.5 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-md"
          style={{
            left: tooltip.x + 14,
            top: Math.min(Math.max(tooltip.y, 24), height - 24),
            transform: "translateY(-50%)",
          }}
        >
          <p className="tabular-mono text-[10px] text-text-tertiary mb-1.5 border-b border-border-subtle pb-1.5">
            {tooltip.time}
          </p>
          <ul className="space-y-1">
            {tooltip.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ background: item.color }}
                  />
                  <span className="text-[11px] text-text-secondary truncate capitalize">{item.label}</span>
                </span>
                <span className="tabular-mono text-[11px] font-medium text-text-primary shrink-0">
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
