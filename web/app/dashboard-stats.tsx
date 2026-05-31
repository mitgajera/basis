"use client";

import { useStats, useUptime } from "../lib/api-client";
import { formatUsd } from "../lib/format";

function MetricCell({
  label,
  value,
  sub,
  loading,
  href,
  tone,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  loading?: boolean;
  href?: string;
  tone?: "positive" | "negative";
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
    <div className="metric-cell relative">
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${label} details`}
          className="absolute top-2.5 right-2.5 text-text-disabled hover:text-text-primary transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
            <path d="M3 8L8 3M8 3H4M8 3V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      )}
      <p className="text-[12px] text-text-tertiary mb-1.5">{label}</p>
      <p
        className={`tabular-mono text-[22px] font-medium leading-none tracking-tight ${
          tone === "positive"
            ? "text-positive"
            : tone === "negative"
            ? "text-negative"
            : "text-text-primary"
        }`}
      >
        {value}
      </p>
      {sub && <div className="mt-1.5 text-[11px] tabular-mono text-text-disabled">{sub}</div>}
    </div>
  );
}

export function DashboardStats() {
  const { data: stats } = useStats();
  const { data: uptime } = useUptime();
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
        tone={stats?.apr7d != null ? (stats.apr7d >= 0 ? "positive" : "negative") : undefined}
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
        value={uptime?.uptime24h != null ? `${uptime.uptime24h.toFixed(1)}%` : "—"}
        sub={<span className="text-text-disabled">last 24h</span>}
        loading={loading}
        href="https://stats.uptimerobot.com/JrNzCZ12Cu"
      />
    </div>
  );
}
