"use client";

import { useMemo, useState } from "react";
import { useAllTrades, usePositions, type TradeRecord } from "../lib/api-client";
import { formatUsd, formatRelativeTime } from "../lib/format";
import { VenueLogo } from "./VenueLogo";

const PAGE_SIZE = 25;

const STATUS: Record<string, { label: string; className: string }> = {
  open:   { label: "open",   className: "text-accent bg-accent-muted" },
  closed: { label: "closed", className: "text-text-tertiary bg-white/[0.04]" },
  failed: { label: "failed", className: "text-negative bg-negative-bg" },
  filled: { label: "filled", className: "text-positive bg-positive-bg" },
  simulated: { label: "sim", className: "text-warning bg-warning/10" },
};

const COLS = ["Time", "Asset", "Venue", "Side", "Size", "Entry", "PnL", "Status"];

function tradeTime(t: TradeRecord): number {
  return t.closedAt ?? t.openedAt;
}

function legPnl(
  t: TradeRecord,
  unrealizedByLeg: Map<string, number>
): { value: number | null; isUnrealized: boolean } {
  if (t.pnlUsd != null && Number.isFinite(t.pnlUsd)) {
    return { value: t.pnlUsd, isUnrealized: false };
  }
  if (t.status === "open") {
    const u = unrealizedByLeg.get(`${t.opportunityId}:${t.venue}:${t.side}`);
    if (u != null && Number.isFinite(u)) return { value: u, isUnrealized: true };
  }
  return { value: null, isUnrealized: false };
}

export function TradeHistory() {
  const { data, error, isLoading } = useAllTrades();
  const { data: positions } = usePositions();
  const [page, setPage] = useState(1);

  // Defensive: old keeper returns Array<TradeRecord>, new keeper returns { trades, total, ... }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = data as any;
  const allTrades: TradeRecord[] = Array.isArray(raw) ? raw : raw?.trades ?? [];
  const total: number = allTrades.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const trades = allTrades.slice(start, start + PAGE_SIZE);
  const totalOpen = allTrades.filter((t) => t.status === "open").length;
  const totalClosed = allTrades.filter((t) => t.status === "closed").length;

  const unrealizedByLeg = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of (positions ?? []) as Array<{
      opportunityId?: string;
      venue: string;
      side: string;
      unrealizedPnl: number;
    }>) {
      if (p.opportunityId) {
        m.set(`${p.opportunityId}:${p.venue}:${p.side}`, p.unrealizedPnl);
      }
    }
    return m;
  }, [positions]);

  return (
    <div className="panel overflow-hidden">
      <div className="panel-header flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-[13px] font-medium text-text-secondary">Recent trades</span>
          <p className="text-[11px] text-text-tertiary mt-0.5">Last 24 hours · open and closed legs</p>
        </div>
        {total > 0 && (
          <span className="tabular-mono text-[11px] text-text-disabled">
            {total} legs
            <span className="text-text-disabled/80">
              {" "}
              · {totalOpen} open · {totalClosed} closed
            </span>
          </span>
        )}
      </div>

      {error ? (
        <p className="text-[12px] text-text-disabled p-6 text-center">Keeper unreachable</p>
      ) : (
        <>
          <div className="overflow-auto max-h-[420px]">
            <table className="w-full min-w-[680px]">
              <thead className="sticky top-0 z-10 bg-bg-surface/95 backdrop-blur-md">
                <tr className="border-b border-border-subtle">
                  {COLS.map((h, i) => (
                    <th
                      key={h}
                      className={`table-head py-2.5 px-3 ${i < 3 ? "text-left" : "text-right"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {isLoading && trades.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-[12px] text-text-disabled">
                      Loading…
                    </td>
                  </tr>
                ) : trades.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-[12px] text-text-disabled">
                      No trades in the last 24 hours
                    </td>
                  </tr>
                ) : (
                  trades.map((t) => {
                    const st = STATUS[t.status] ?? {
                      label: t.status,
                      className: "text-text-disabled bg-white/[0.03]",
                    };
                    const { value: pnl, isUnrealized } = legPnl(t, unrealizedByLeg);
                    const ts = tradeTime(t);

                    return (
                      <tr key={`${t.opportunityId}-${t.venue}-${t.side}`} className="row-hover">
                        <td className="tabular-mono py-2.5 px-3 text-[11px] text-text-disabled">
                          <span title={new Date(ts).toLocaleString()}>
                            {formatRelativeTime(ts)}
                          </span>
                          {t.status === "closed" && t.closedAt != null && (
                            <span className="block text-[10px] text-text-disabled/70">closed</span>
                          )}
                        </td>
                        <td className="tabular-mono py-2.5 px-3 text-[11px] text-text-secondary font-medium">
                          {t.asset.replace("-PERP", "")}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="flex items-center gap-1.5">
                            <VenueLogo venue={t.venue} size={14} />
                            <span className="text-[11px] text-text-tertiary capitalize">{t.venue}</span>
                          </span>
                        </td>
                        <td
                          className={`tabular-mono text-right py-2.5 px-3 text-[11px] font-semibold uppercase ${
                            t.side === "long" ? "text-positive" : "text-negative"
                          }`}
                        >
                          {t.side.slice(0, 1)}
                        </td>
                        <td className="tabular-mono text-right py-2.5 px-3 text-[11px] text-text-secondary">
                          {formatUsd(t.sizeUsd, { compact: true })}
                        </td>
                        <td className="tabular-mono text-right py-2.5 px-3 text-[11px] text-text-tertiary">
                          {t.fillPrice != null ? `$${t.fillPrice.toFixed(2)}` : "—"}
                        </td>
                        <td
                          className={`tabular-mono text-right py-2.5 px-3 text-[11px] font-medium ${
                            pnl == null
                              ? "text-text-disabled"
                              : pnl >= 0
                              ? "text-positive"
                              : "text-negative"
                          }`}
                          title={isUnrealized ? "Unrealized (open leg)" : undefined}
                        >
                          {pnl == null
                            ? "—"
                            : `${pnl >= 0 ? "+" : ""}$${Math.abs(pnl) < 1 ? pnl.toFixed(4) : pnl.toFixed(2)}`}
                          {isUnrealized && <span className="text-text-disabled font-normal"> ~</span>}
                        </td>
                        <td className="text-right py-2.5 px-3">
                          <span
                            className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-md ${st.className}`}
                          >
                            {st.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-border-subtle">
              <span className="tabular-mono text-[11px] text-text-disabled">
                {start + 1}–{Math.min(start + PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="pct-chip disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Previous page"
                >
                  Prev
                </button>
                <span className="tabular-mono text-[11px] text-text-tertiary px-1">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="pct-chip disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Next page"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
