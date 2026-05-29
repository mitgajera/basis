"use client";

import { useStats } from "../lib/api-client";
import { StatCard } from "../components/StatCard";
import { formatUsd } from "../lib/format";

export function DashboardStats() {
  const { data: stats } = useStats();

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard
        label="Total Value Locked"
        value={stats?.tvl != null ? formatUsd(stats.tvl, { compact: true }) : "—"}
        delta={stats?.apr24h != null && stats.apr24h !== 0
          ? { value: `${stats.apr24h >= 0 ? "+" : ""}${stats.apr24h.toFixed(2)}%`, positive: stats.apr24h >= 0 }
          : undefined}
        helper={stats?.apr24h != null ? "24h APR" : undefined}
        loading={stats == null}
        accent
      />
      <StatCard
        label="7-Day APR"
        value={stats?.apr7d != null ? `${stats.apr7d >= 0 ? "+" : ""}${stats.apr7d.toFixed(2)}%` : "—"}
        helper="annualized yield"
        loading={stats == null}
      />
      <StatCard
        label="Open Positions"
        value={stats?.totalTrades != null ? String(stats.totalTrades) : "—"}
        helper={stats?.spreadOpportunities != null && stats.spreadOpportunities > 0
          ? `${stats.spreadOpportunities} spreads seen`
          : "sim mode"}
        loading={stats == null}
      />
      <StatCard
        label="Uptime"
        value={stats?.uptimePct != null ? `${stats.uptimePct.toFixed(0)}%` : "—"}
        helper="keeper process"
        loading={stats == null}
      />
    </div>
  );
}
