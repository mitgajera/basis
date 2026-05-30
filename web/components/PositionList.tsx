"use client";

import { usePositions } from "../lib/api-client";
import { formatUsd } from "../lib/format";
import { VenueBadge } from "./VenueBadge";

export function PositionList() {
  const { data, error } = usePositions();
  const positions: Array<{
    venue: string;
    asset: string;
    side: string;
    notionalUsd: number;
    entryPrice: number;
    unrealizedPnl: number;
    marginRatio: number;
  }> = data ?? [];

  return (
    <div className="panel overflow-hidden flex flex-col min-h-[300px]">
      <div className="panel-header flex items-center justify-between">
        <span className="text-[11px] font-medium text-text-secondary">Open positions</span>
        {positions.length > 0 && (
          <span className="tabular-mono text-[10px] text-text-disabled px-2 py-0.5 rounded-md bg-white/[0.04]">
            {positions.length}
          </span>
        )}
      </div>

      {error ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <p className="text-[12px] text-text-disabled">Keeper unreachable</p>
        </div>
      ) : positions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1 h-1 rounded-full bg-text-disabled live-dot"
                style={{ animationDelay: `${i * 0.25}s` }}
              />
            ))}
          </div>
          <p className="text-[13px] text-text-secondary font-medium">
            {data ? "No open positions" : "Loading…"}
          </p>
          {data && (
            <p className="text-[11px] text-text-disabled max-w-[240px] leading-relaxed">
              Scanning cross-venue spreads for entry above threshold
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_48px_76px_76px_72px] border-b border-white/[0.04]">
            {["Venue", "Side", "Size", "Entry", "PnL"].map((h, i) => (
              <div
                key={h}
                className={`table-head py-2.5 px-3 ${i > 0 ? "text-right" : ""}`}
              >
                {h}
              </div>
            ))}
          </div>
          <div className="divide-y divide-white/[0.03] overflow-y-auto max-h-[340px]">
            {positions.map((pos, i) => {
              const pnlPct = pos.notionalUsd > 0 ? (pos.unrealizedPnl / pos.notionalUsd) * 100 : 0;
              return (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_48px_76px_76px_72px] row-hover"
                >
                  <div className="py-2.5 px-3 flex items-center gap-2 min-w-0">
                    <VenueBadge venue={pos.venue} size="sm" />
                    <span className="text-[10px] text-text-disabled truncate">
                      {pos.asset.replace("-PERP", "")}
                    </span>
                  </div>
                  <div
                    className={`tabular-mono text-right py-2.5 px-3 text-[11px] font-semibold uppercase ${
                      pos.side === "long" ? "text-positive" : "text-negative"
                    }`}
                  >
                    {pos.side.slice(0, 1)}
                  </div>
                  <div className="tabular-mono text-right py-2.5 px-3 text-[11px] text-text-secondary">
                    {formatUsd(pos.notionalUsd, { compact: true })}
                  </div>
                  <div className="tabular-mono text-right py-2.5 px-3 text-[11px] text-text-tertiary">
                    ${pos.entryPrice.toFixed(2)}
                  </div>
                  <div
                    className={`tabular-mono text-right py-2.5 px-3 text-[11px] font-semibold ${
                      pnlPct >= 0 ? "text-positive" : "text-negative"
                    }`}
                  >
                    {pnlPct >= 0 ? "+" : ""}
                    {pnlPct.toFixed(3)}%
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
