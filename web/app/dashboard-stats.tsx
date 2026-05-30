"use client";

import { useStats } from "../lib/api-client";
import { formatUsd } from "../lib/format";

function MetricCell({
  label,
  value,
  sub,
  loading,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="metric-cell space-y-2">
        <div className="skeleton h-2.5 w-12" />
        <div className="skeleton h-7 w-20" />
      </div>
    );
  }

  return (
    <div className="metric-cell">
      <p className="text-[12px] text-text-tertiary mb-1.5">{label}</p>
      <p className="tabular-mono text-[22px] font-medium text-text-primary leading-none tracking-tight">{value}</p>
      {sub && <div className="mt-1.5 text-[11px] tabular-mono text-text-disabled">{sub}</div>}
    </div>
  );
}

export function DashboardStats() {
  const { data: stats } = useStats();
  const loading = stats == null;

  return (
    <div className="metrics-strip">
      <MetricCell
        label="Total value locked"
        value={stats?.tvl != null ? formatUsd(stats.tvl, { compact: true }) : "—"}
        sub={
          stats?.apr24h != null && stats.apr24h !== 0 ? (
            <span className={stats.apr24h >= 0 ? "text-positive" : "text-negative"}>
              {stats.apr24h >= 0 ? "+" : ""}
              {stats.apr24h.toFixed(2)}% 24h APR
            </span>
          ) : undefined
        }
        loading={loading}
      />
      <MetricCell
        label="7-day APR"
        value={stats?.apr7d != null ? `${stats.apr7d >= 0 ? "+" : ""}${stats.apr7d.toFixed(2)}%` : "—"}
        loading={loading}
      />
      <MetricCell
        label="Trades"
        value={stats?.totalTrades != null ? String(stats.totalTrades) : "—"}
        sub={stats?.spreadOpportunities ? `${stats.spreadOpportunities} spreads seen` : undefined}
        loading={loading}
      />
      <MetricCell
        label="Keeper uptime"
        value={stats?.uptimePct != null ? `${stats.uptimePct.toFixed(1)}%` : "—"}
        loading={loading}
      />
    </div>
  );
}
