"use client";

import { cn } from "../lib/utils";

export type LegendItem = {
  id: string;
  label: string;
  color: string;
  value?: string;
  hidden?: boolean;
};

export function ChartLegend({
  items,
  onToggle,
  className,
}: {
  items: LegendItem[];
  onToggle?: (id: string) => void;
  className?: string;
}) {
  if (items.length === 0) {
    return <span className="text-[11px] text-text-disabled">Awaiting data</span>;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onToggle?.(item.id)}
          disabled={!onToggle}
          className={cn(
            "flex items-center gap-2 text-left transition-opacity duration-200",
            onToggle && "hover:opacity-100 cursor-pointer",
            item.hidden && "opacity-35"
          )}
        >
          <span
            className="h-[3px] w-3 rounded-full shrink-0 transition-opacity"
            style={{ background: item.color, opacity: item.hidden ? 0.35 : 1 }}
          />
          <span className="text-[11px] text-text-secondary capitalize">{item.label}</span>
          {item.value != null && (
            <span
              className="tabular-mono text-[11px] font-medium"
              style={{ color: item.hidden ? "var(--text-disabled)" : item.color }}
            >
              {item.value}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
