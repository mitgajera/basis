"use client";

import { useTrades } from "../lib/api-client";
import { formatUsd, formatRelativeTime } from "../lib/format";

const STATUS_STYLE: Record<string, { dot: string; text: string; bg: string }> = {
  filled:    { dot: "bg-positive",  text: "text-positive",  bg: "bg-positive/8" },
  simulated: { dot: "bg-warning",   text: "text-warning",   bg: "bg-warning/8"  },
  partial:   { dot: "bg-warning",   text: "text-warning",   bg: "bg-warning/8"  },
  failed:    { dot: "bg-negative",  text: "text-negative",  bg: "bg-negative/8" },
};

export function TradeHistory() {
  const { data, error } = useTrades(20);
  const trades: Array<{
    opened_at: number; asset: string; venue: string; side: string;
    size_usd: number; fill_price?: number; status: string;
  }> = data ?? [];

  const cols = ["Time", "Asset", "Venue", "Side", "Size", "Fill", "Status"];

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.04]">
        <span className="text-[10px] uppercase tracking-[0.12em] text-text-disabled font-medium">Trade History</span>
      </div>

      {error ? (
        <p className="text-[11px] text-text-disabled p-5 text-center">Keeper offline</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-border-subtle">
                {cols.map((h, i) => (
                  <th key={h} className={`text-[10px] uppercase tracking-[0.10em] text-text-disabled font-medium py-2 px-3 ${i < 3 ? "text-left" : "text-right"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle/30">
              {trades.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[11px] text-text-disabled">
                    {data ? "No trades yet — running in simulation mode" : "Loading…"}
                  </td>
                </tr>
              ) : (
                trades.map((t, i) => {
                  const st = STATUS_STYLE[t.status] ?? { dot: "bg-text-disabled", text: "text-text-disabled", bg: "" };
                  return (
                    <tr key={i} className="hover:bg-bg-surface-2 transition-colors duration-100">
                      <td className="tabular-mono py-2 px-3 text-[11px] text-text-disabled">{formatRelativeTime(t.opened_at)}</td>
                      <td className="tabular-mono py-2 px-3 text-[11px] text-text-secondary font-medium">{t.asset.replace("-PERP", "")}</td>
                      <td className="py-2 px-3 text-[11px] text-text-tertiary capitalize">{t.venue}</td>
                      <td className={`tabular-mono text-right py-2 px-3 text-[11px] font-bold uppercase ${t.side === "long" ? "text-positive" : "text-negative"}`}>
                        {t.side[0].toUpperCase()}
                      </td>
                      <td className="tabular-mono text-right py-2 px-3 text-[11px] text-text-secondary">
                        {formatUsd(t.size_usd, { compact: true })}
                      </td>
                      <td className="tabular-mono text-right py-2 px-3 text-[11px] text-text-tertiary">
                        {t.fill_price != null ? `$${t.fill_price.toFixed(2)}` : <span className="text-text-disabled">—</span>}
                      </td>
                      <td className="text-right py-2 px-3">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>
                          <span className={`w-1 h-1 rounded-full shrink-0 ${st.dot}`} />
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
