"use client";

import { useTrades } from "../lib/api-client";
import { formatUsd, formatRelativeTime } from "../lib/format";

const STATUS_STYLE: Record<string, { dot: string; text: string; bg: string }> = {
  open:   { dot: "bg-accent",    text: "text-accent",    bg: "bg-accent/8"   },
  closed: { dot: "bg-text-tertiary", text: "text-text-tertiary", bg: "bg-white/[0.03]" },
  failed: { dot: "bg-negative",  text: "text-negative",  bg: "bg-negative/8" },
};

type Trade = {
  opportunityId: string;
  venue: string;
  asset: string;
  side: string;
  sizeUsd: number;
  fillPrice: number | null;
  exitPrice: number | null;
  feeUsd: number;
  pnlUsd: number | null;
  status: string;
  openedAt: number;
  closedAt: number | null;
};

export function TradeHistory() {
  const { data, error } = useTrades(20);
  const trades: Trade[] = (data as Trade[]) ?? [];

  const cols = ["Time", "Asset", "Venue", "Side", "Size", "Entry", "PnL", "Status"];

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.12em] text-text-disabled font-medium">Trade History</span>
        {trades.length > 0 && (
          <span className="tabular-mono text-[10px] text-text-disabled">{trades.length} legs</span>
        )}
      </div>

      {error ? (
        <p className="text-[11px] text-text-disabled p-5 text-center">Keeper offline</p>
      ) : (
        <div className="overflow-auto max-h-[360px]">
          <table className="w-full min-w-[660px]">
            <thead className="sticky top-0 z-10 bg-bg-surface/95 backdrop-blur-sm">
              <tr className="border-b border-white/[0.04]">
                {cols.map((h, i) => (
                  <th key={h} className={`text-[10px] uppercase tracking-[0.10em] text-text-disabled font-medium py-2 px-3 ${i < 3 ? "text-left" : "text-right"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {trades.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[11px] text-text-disabled">
                    {data ? "No trades yet — waiting for a spread above threshold" : "Loading…"}
                  </td>
                </tr>
              ) : (
                trades.map((t, i) => {
                  const st = STATUS_STYLE[t.status] ?? { dot: "bg-text-disabled", text: "text-text-disabled", bg: "" };
                  return (
                    <tr key={i} className="hover:bg-white/[0.02] transition-colors duration-100">
                      <td className="tabular-mono py-2 px-3 text-[11px] text-text-disabled">{formatRelativeTime(t.openedAt)}</td>
                      <td className="tabular-mono py-2 px-3 text-[11px] text-text-secondary font-medium">{t.asset.replace("-PERP", "")}</td>
                      <td className="py-2 px-3 text-[11px] text-text-tertiary capitalize">{t.venue}</td>
                      <td className={`tabular-mono text-right py-2 px-3 text-[11px] font-bold uppercase ${t.side === "long" ? "text-positive" : "text-negative"}`}>
                        {t.side[0].toUpperCase()}
                      </td>
                      <td className="tabular-mono text-right py-2 px-3 text-[11px] text-text-secondary">
                        {formatUsd(t.sizeUsd, { compact: true })}
                      </td>
                      <td className="tabular-mono text-right py-2 px-3 text-[11px] text-text-tertiary">
                        {t.fillPrice != null ? `$${t.fillPrice.toFixed(2)}` : <span className="text-text-disabled">—</span>}
                      </td>
                      <td className={`tabular-mono text-right py-2 px-3 text-[11px] font-medium ${
                        t.pnlUsd == null ? "text-text-disabled" : t.pnlUsd >= 0 ? "text-positive" : "text-negative"
                      }`}>
                        {t.pnlUsd == null ? "—" : `${t.pnlUsd >= 0 ? "+" : ""}$${t.pnlUsd.toFixed(4)}`}
                      </td>
                      <td className="text-right py-2 px-3">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>
                          <span className={`w-1 h-1 rounded-full shrink-0 ${st.dot} ${t.status === "open" ? "live-dot" : ""}`} />
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
