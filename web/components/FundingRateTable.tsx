"use client";

import { useEffect, useRef, useState } from "react";
import { useFundingRates } from "../lib/api-client";
import { VenueLogo } from "./VenueLogo";
import type { Asset } from "./FundingSection";

const STALE_MS = 60_000; // a venue feed older than this is shown as stale

const VENUE_COLOR: Record<string, string> = {
  backpack:    "var(--venue-backpack)",
  pacifica:    "var(--venue-pacifica)",
  phoenix:     "var(--venue-phoenix)",
  drift:       "var(--venue-drift)",
  jupiter:     "var(--venue-jupiter)",
  hyperliquid: "var(--venue-hyperliquid)",
};

// ── Rate flash cell ───────────────────────────────────────────────────────────
function RateCell({ value }: { value: number }) {
  const prevRef = useRef(value);
  const [pulse, setPulse] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (value !== prevRef.current) {
      setPulse(value > prevRef.current ? "up" : "down");
      prevRef.current = value;
      const t = setTimeout(() => setPulse(null), 600);
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <td className={`tabular-mono text-right py-2.5 px-3 text-[12px] transition-colors duration-500 text-text-tertiary ${
      pulse === "up" ? "text-positive" : pulse === "down" ? "text-negative" : ""
    }`}>
      {value >= 0 ? "+" : ""}{(value * 100).toFixed(4)}%
    </td>
  );
}

// ── Annualized with magnitude bar ─────────────────────────────────────────────
function AnnualizedCell({ value, maxAbs }: { value: number; maxAbs: number }) {
  const pct = maxAbs > 0 ? Math.min(Math.abs(value) / maxAbs, 1) : 0;
  const isPos = value >= 0;
  return (
    <td className="py-2.5 px-3">
      <div className="flex items-center justify-end gap-2">
        {/* Mini bar */}
        <div className="w-14 h-1 rounded-full bg-bg-surface-3 overflow-hidden shrink-0">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${pct * 100}%`,
              background: isPos ? "var(--positive)" : "var(--negative)",
              opacity: 0.7,
            }}
          />
        </div>
        <span className={`tabular-mono text-[12px] font-semibold w-16 text-right ${isPos ? "text-positive" : "text-negative"}`}>
          {isPos ? "+" : ""}{value.toFixed(2)}%
        </span>
      </div>
    </td>
  );
}

// ── Mark price — per-digit slot animation ─────────────────────────────────────
function MarkPriceCell({ value }: { value: number }) {
  const str = `$${value.toFixed(2)}`;
  const prevStrRef = useRef(str);
  const prevValRef = useRef(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const [changed, setChanged] = useState<Map<number, "up" | "down">>(new Map());

  useEffect(() => {
    if (str !== prevStrRef.current) {
      const dir: "up" | "down" = value > prevValRef.current ? "up" : "down";
      const prev = prevStrRef.current;
      const diff = new Map<number, "up" | "down">();
      const len = Math.max(prev.length, str.length);
      for (let i = 0; i < len; i++) {
        const pi = prev.length - len + i;
        const ni = str.length - len + i;
        const pc = pi >= 0 ? prev[pi] : "";
        const nc = ni >= 0 ? str[ni] : "";
        if (nc !== pc && /\d/.test(nc ?? "")) diff.set(ni < 0 ? 0 : ni, dir);
      }
      prevStrRef.current = str;
      prevValRef.current = value;
      setFlash(dir);
      setChanged(diff);
      setAnimKey((k) => k + 1);
      const t = setTimeout(() => { setFlash(null); setChanged(new Map()); }, 600);
      return () => clearTimeout(t);
    }
  }, [str, value]);

  return (
    <td className={`tabular-mono text-right py-2.5 px-3 text-[12px] transition-colors duration-500 ${
      flash === "up" ? "text-positive" : flash === "down" ? "text-negative" : "text-text-secondary"
    }`}>
      <span className="inline-flex items-baseline">
        {str.split("").map((ch, i) => {
          const dir = changed.get(i);
          if (dir && /\d/.test(ch)) {
            return (
              <span key={`${animKey}-${i}`} style={{ overflow: "hidden", display: "inline-block", height: "1.15em", lineHeight: "1.15em", verticalAlign: "bottom" }}>
                <span style={{ display: "inline-block", animation: `${dir === "up" ? "digit-up" : "digit-down"} 0.3s ease-out forwards` }}>{ch}</span>
              </span>
            );
          }
          return <span key={i}>{ch}</span>;
        })}
      </span>
    </td>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────
export function FundingRateTable({ asset }: { asset: Asset }) {
  const { data, error } = useFundingRates();

  if (error) {
    return (
      <div className="rounded-xl border border-border-subtle bg-bg-surface p-5 flex items-center justify-center min-h-[200px]">
        <div className="text-center space-y-1">
          <div className="w-2 h-2 rounded-full bg-negative mx-auto mb-3" />
          <p className="text-[11px] text-text-disabled">Keeper offline</p>
        </div>
      </div>
    );
  }

  const allRows: Array<{
    venue: string;
    asset: string;
    hourlyRate: number;
    annualizedPct: number;
    markPrice: number;
    lastUpdated: number;
  }> = data ?? [];

  const rows = allRows
    .filter((r) => !r.asset || r.asset === asset)
    .sort((a, b) => b.annualizedPct - a.annualizedPct);

  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.annualizedPct)), 0.01);

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.12em] text-text-disabled font-medium">Rates</span>
          <span className="text-[10px] text-border-strong">·</span>
          <span className="text-[10px] uppercase tracking-[0.12em] text-text-tertiary">{asset.replace("-PERP", "")}</span>
        </div>
        <div className="flex items-center gap-2">
          {data && rows.length > 0 && (
            <span className="text-[10px] text-text-disabled tabular-mono">{rows.length} venues</span>
          )}
          <span className={`h-1.5 w-1.5 rounded-full ${data ? "bg-positive live-dot" : "bg-text-disabled"}`} />
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_80px_140px_88px] border-b border-white/[0.04]">
        {["Venue", "Hourly", "Annual", "Mark"].map((h, i) => (
          <div key={h} className={`text-[10px] uppercase tracking-[0.10em] text-text-disabled font-medium py-2 px-3 ${i === 0 ? "" : "text-right"}`}>
            {h}
          </div>
        ))}
      </div>

      {/* Rows */}
      {rows.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-[12px] text-text-disabled">{data ? `No data for ${asset}` : "Loading…"}</p>
        </div>
      ) : (
        <table className="w-full">
          <tbody>
            {rows.map((row, idx) => {
              const color = VENUE_COLOR[row.venue.toLowerCase()] ?? "#52525B";
              const isLast = idx === rows.length - 1;
              const stale = row.lastUpdated != null && Date.now() - row.lastUpdated > STALE_MS;
              return (
                <tr
                  key={row.venue}
                  className={`group transition-colors duration-100 hover:bg-bg-surface-2 ${!isLast ? "border-b border-border-subtle/30" : ""} ${stale ? "opacity-40" : ""}`}
                >
                  {/* Venue */}
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-[3px] h-5 rounded-full shrink-0 transition-opacity duration-150 opacity-50 group-hover:opacity-100" style={{ background: color }} />
                      <VenueLogo venue={row.venue} size={14} />
                      <span className="text-[12px] capitalize font-medium tracking-tight" style={{ color }}>
                        {row.venue}
                      </span>
                      {stale && (
                        <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-warning/15 text-warning font-medium">
                          stale
                        </span>
                      )}
                    </div>
                  </td>
                  <RateCell value={row.hourlyRate} />
                  <AnnualizedCell value={row.annualizedPct} maxAbs={maxAbs} />
                  <MarkPriceCell value={row.markPrice} />
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
