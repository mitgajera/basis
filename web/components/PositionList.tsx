"use client";

import { usePositions } from "../lib/api-client";
import { formatUsd } from "../lib/format";
import { VenueLogo } from "./VenueLogo";

const VENUE_COLOR: Record<string, string> = {
  backpack:    "var(--venue-backpack)",
  pacifica:    "var(--venue-pacifica)",
  phoenix:     "var(--venue-phoenix)",
  drift:       "var(--venue-drift)",
  jupiter:     "var(--venue-jupiter)",
  hyperliquid: "var(--venue-hyperliquid)",
};

export function PositionList() {
  const { data, error } = usePositions();
  const positions: Array<{
    venue: string; asset: string; side: string;
    notionalUsd: number; entryPrice: number; unrealizedPnl: number; marginRatio: number;
  }> = data ?? [];

  return (
    <div className="glass-card rounded-xl overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
        <span className="text-[10px] uppercase tracking-[0.12em] text-text-disabled font-medium">Positions</span>
        {positions.length > 0 && (
          <span className="tabular-mono text-[10px] text-text-disabled px-1.5 py-0.5 rounded bg-bg-surface-2 border border-border-subtle">
            {positions.length}
          </span>
        )}
      </div>

      {error ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <p className="text-[11px] text-text-disabled">Keeper offline</p>
        </div>
      ) : positions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-10 px-6 text-center space-y-3">
          {/* Minimal waiting indicator */}
          <div className="flex items-center gap-1 mb-1">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="w-1 h-1 rounded-full bg-text-disabled"
                style={{ animation: `live-pulse 1.5s ease-in-out infinite`, animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
          <p className="text-[12px] text-text-disabled font-medium">
            {data ? "No open positions" : "Loading…"}
          </p>
          {data && (
            <p className="text-[11px] text-text-disabled/60 max-w-[220px] leading-relaxed">
              Strategy loop scanning for spreads above the entry threshold
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_52px_72px_72px_68px] border-b border-white/[0.04] px-0">
            {["Venue", "Side", "Size", "Entry", "PnL"].map((h, i) => (
              <div key={h} className={`text-[10px] uppercase tracking-[0.10em] text-text-disabled font-medium py-2 px-3 ${i > 0 ? "text-right" : ""}`}>
                {h}
              </div>
            ))}
          </div>
          <div className="divide-y divide-border-subtle/30">
            {positions.map((pos, i) => {
              const color = VENUE_COLOR[pos.venue.toLowerCase()] ?? "#52526A";
              const pnlPct = pos.notionalUsd > 0 ? (pos.unrealizedPnl / pos.notionalUsd) * 100 : 0;
              return (
                <div key={i} className="grid grid-cols-[1fr_52px_72px_72px_68px] hover:bg-bg-surface-2 transition-colors duration-100 group">
                  <div className="py-2 px-3 flex items-center gap-2">
                    <div className="w-[3px] h-4 rounded-full opacity-60 group-hover:opacity-100 transition-opacity shrink-0" style={{ background: color }} />
                    <VenueLogo venue={pos.venue} size={12} />
                    <span className="text-[11px] capitalize font-medium" style={{ color }}>{pos.venue}</span>
                    <span className="text-[10px] text-text-disabled">{pos.asset.replace("-PERP", "")}</span>
                  </div>
                  <div className={`tabular-mono text-right py-2 px-3 text-[11px] font-bold uppercase tracking-wide ${pos.side === "long" ? "text-positive" : "text-negative"}`}>
                    {pos.side[0].toUpperCase()}
                  </div>
                  <div className="tabular-mono text-right py-2 px-3 text-[11px] text-text-secondary">
                    {formatUsd(pos.notionalUsd, { compact: true })}
                  </div>
                  <div className="tabular-mono text-right py-2 px-3 text-[11px] text-text-tertiary">
                    ${pos.entryPrice.toFixed(2)}
                  </div>
                  <div className={`tabular-mono text-right py-2 px-3 text-[11px] font-semibold ${pnlPct >= 0 ? "text-positive" : "text-negative"}`}>
                    {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(3)}%
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
