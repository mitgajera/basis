"use client";

import { useEffect, useRef, useState } from "react";
import { useFundingRates } from "../lib/api-client";
import { VenueBadge } from "./VenueBadge";
import type { Asset } from "./AssetPicker";

const STALE_MS = 60_000;

function RateCell({ value }: { value: number }) {
  const prevRef = useRef(value);
  const [pulse, setPulse] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (value !== prevRef.current) {
      setPulse(value > prevRef.current ? "up" : "down");
      prevRef.current = value;
      const t = setTimeout(() => setPulse(null), 500);
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <td
      className={`tabular-mono text-right py-3 px-3 text-[12px] transition-colors duration-300 ${
        pulse === "up" ? "text-positive bg-positive-bg" : pulse === "down" ? "text-negative bg-negative-bg" : "text-text-tertiary"
      }`}
    >
      {value >= 0 ? "+" : ""}
      {(value * 100).toFixed(4)}%
    </td>
  );
}

function AnnualizedCell({ value, maxAbs }: { value: number; maxAbs: number }) {
  const pct = maxAbs > 0 ? Math.min(Math.abs(value) / maxAbs, 1) : 0;
  const isPos = value >= 0;
  return (
    <td className="py-3 px-3">
      <div className="flex items-center justify-end gap-2.5">
        <div className="w-16 h-[3px] rounded-full bg-white/[0.04] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${pct * 100}%`,
              background: isPos ? "var(--positive)" : "var(--negative)",
              opacity: 0.85,
            }}
          />
        </div>
        <span className={`tabular-mono text-[12px] font-semibold w-[72px] text-right ${isPos ? "text-positive" : "text-negative"}`}>
          {isPos ? "+" : ""}
          {value.toFixed(2)}%
        </span>
      </div>
    </td>
  );
}

export function FundingRateTable({ asset }: { asset: Asset }) {
  const { data, error } = useFundingRates();

  if (error) {
    return (
      <div className="panel p-8 flex items-center justify-center min-h-[200px]">
        <p className="text-[12px] text-text-disabled">Keeper unreachable</p>
      </div>
    );
  }

  type RateRow = {
    venue: string;
    asset?: string;
    hourlyRate: number;
    annualizedPct: number;
    markPrice: number;
    lastUpdated: number;
  };

  const rows = ((data ?? []) as RateRow[])
    .filter((r) => !r.asset || r.asset === asset)
    .sort((a, b) => b.annualizedPct - a.annualizedPct);

  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.annualizedPct)), 0.01);

  return (
    <div className="panel overflow-hidden">
      <div className="panel-header flex items-center justify-between">
        <span className="text-[13px] font-medium text-text-secondary">Venue rates</span>
        <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <span className="text-[10px] tabular-mono text-text-disabled">{rows.length} venues</span>
          )}
          <span className={`h-1.5 w-1.5 rounded-full ${data ? "bg-positive live-dot" : "bg-text-disabled"}`} />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_88px_148px_92px] border-b border-white/[0.04] px-0">
        {["Venue", "Hourly", "Annual", "Mark"].map((h, i) => (
          <div
            key={h}
            className={`text-[10px] uppercase tracking-[0.12em] text-text-disabled font-medium py-2.5 px-3 ${i > 0 ? "text-right" : ""}`}
          >
            {h}
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="py-14 text-center text-[12px] text-text-disabled">
          {data ? `No rates for ${asset}` : "Loading…"}
        </p>
      ) : (
        <table className="w-full">
          <tbody>
            {rows.map((row, idx) => {
              const stale = row.lastUpdated != null && Date.now() - row.lastUpdated > STALE_MS;
              return (
                <tr
                  key={row.venue}
                  className={`group row-hover ${
                    idx < rows.length - 1 ? "border-b border-white/[0.03]" : ""
                  } ${stale ? "opacity-45" : ""}`}
                >
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <VenueBadge venue={row.venue} />
                      {stale && (
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-warning/10 text-warning font-medium">
                          stale
                        </span>
                      )}
                    </div>
                  </td>
                  <RateCell value={row.hourlyRate} />
                  <AnnualizedCell value={row.annualizedPct} maxAbs={maxAbs} />
                  <td className="tabular-mono text-right py-3 px-3 text-[12px] text-text-secondary">
                    ${row.markPrice.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
