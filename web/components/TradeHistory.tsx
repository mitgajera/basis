"use client";

import { useMemo, useState } from "react";
import { useAllTrades, usePositions, type TradeRecord } from "../lib/api-client";
import { formatUsd, formatRelativeTime } from "../lib/format";
import { AssetIcon } from "./AssetIcon";
import { EmptyState } from "./EmptyState";
import { VenueLogo } from "./VenueLogo";

const PAGE_SIZE = 25;

type SortKey = "time" | "size" | "pnl";
type SortDir = "asc" | "desc";

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

function pnlSortValue(t: TradeRecord, unrealizedByLeg: Map<string, number>): number {
  const { value } = legPnl(t, unrealizedByLeg);
  return value == null ? -Infinity : value;
}

interface ColDef {
  key: string;
  label: string;
  align: "left" | "right";
  sortKey?: SortKey;
}

const COLS: ColDef[] = [
  { key: "time", label: "Time", align: "left", sortKey: "time" },
  { key: "asset", label: "Asset", align: "left" },
  { key: "venue", label: "Venue", align: "left" },
  { key: "side", label: "Side", align: "right" },
  { key: "size", label: "Size", align: "right", sortKey: "size" },
  { key: "entry", label: "Entry", align: "right" },
  { key: "pnl", label: "PnL", align: "right", sortKey: "pnl" },
  { key: "status", label: "Status", align: "right" },
];

export function TradeHistory() {
  const { data, error, isLoading } = useAllTrades();
  const { data: positions } = usePositions();
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = data as any;
  const allTradesRaw: TradeRecord[] = Array.isArray(raw) ? raw : raw?.trades ?? [];

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

  const allTrades = useMemo(() => {
    const out = [...allTradesRaw];
    out.sort((a, b) => {
      let av = 0;
      let bv = 0;
      if (sortKey === "time") {
        av = tradeTime(a);
        bv = tradeTime(b);
      } else if (sortKey === "size") {
        av = a.sizeUsd;
        bv = b.sizeUsd;
      } else {
        av = pnlSortValue(a, unrealizedByLeg);
        bv = pnlSortValue(b, unrealizedByLeg);
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return out;
  }, [allTradesRaw, sortKey, sortDir, unrealizedByLeg]);

  const total = allTrades.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const trades = allTrades.slice(start, start + PAGE_SIZE);
  const totalOpen = allTradesRaw.filter((t) => t.status === "open").length;
  const totalClosed = allTradesRaw.filter((t) => t.status === "closed").length;

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(1);
  };

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
            <span className="text-text-disabled/80"> · {totalOpen} open · {totalClosed} closed</span>
          </span>
        )}
      </div>

      {error ? (
        <EmptyState
          tone="negative"
          title="Keeper unreachable"
          description="Recent trade data isn't reachable right now."
        />
      ) : (
        <>
          <div className="overflow-auto max-h-[420px]">
            <table className="w-full min-w-[720px]">
              <thead className="sticky top-0 z-10 bg-bg-surface/95 backdrop-blur-md">
                <tr className="border-b border-border-subtle">
                  {COLS.map((c) => {
                    const isSortable = c.sortKey != null;
                    const isActive = c.sortKey != null && sortKey === c.sortKey;
                    return (
                      <th
                        key={c.key}
                        className={`table-head py-2.5 px-3 ${c.align === "right" ? "text-right" : "text-left"} ${
                          isSortable ? "table-head--sortable" : ""
                        }`}
                        data-active={isActive || undefined}
                        data-dir={isActive ? sortDir : undefined}
                        onClick={isSortable ? () => handleSort(c.sortKey!) : undefined}
                      >
                        {c.label}
                        {isSortable && isActive && <span className="sort-arrow">▼</span>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {isLoading && trades.length === 0 ? (
                  <tr>
                    <td colSpan={COLS.length} className="py-12 text-center text-[12px] text-text-disabled">
                      Loading…
                    </td>
                  </tr>
                ) : trades.length === 0 ? (
                  <tr>
                    <td colSpan={COLS.length} className="py-12 text-center text-[12px] text-text-disabled">
                      No trades in the last 24 hours
                    </td>
                  </tr>
                ) : (
                  trades.map((t) => {
                    const { value: pnl, isUnrealized } = legPnl(t, unrealizedByLeg);
                    const ts = tradeTime(t);
                    return (
                      <tr
                        key={`${t.opportunityId}-${t.venue}-${t.side}`}
                        className="row-zebra"
                      >
                        <td className="tabular-mono py-2.5 px-3 text-[11px] text-text-disabled">
                          <span title={new Date(ts).toLocaleString()}>
                            {formatRelativeTime(ts)}
                          </span>
                          {t.status === "closed" && t.closedAt != null && (
                            <span className="block text-[10px] text-text-disabled/70">closed</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="flex items-center gap-1.5">
                            <AssetIcon asset={t.asset} size={16} />
                            <span className="tabular-mono text-[11px] text-text-secondary font-medium">
                              {t.asset.replace("-PERP", "")}
                            </span>
                          </span>
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
                          <span className="status-tag" data-status={t.status}>
                            {t.status === "simulated" ? "sim" : t.status}
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
