"use client";

import { useMemo } from "react";
import { useStats, useUptime, useNav } from "../lib/api-client";
import { formatUsd } from "../lib/format";
import { Sparkline } from "../components/Sparkline";
import { useAnimatedNumber } from "../hooks/useAnimatedNumber";

function DeltaChip({ value, suffix }: { value: number; suffix: string }) {
  const tone = value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
  const sign = value > 0 ? "+" : "";
  return (
    <span className="delta-chip" data-tone={tone}>
      {sign}
      {value.toFixed(2)}% {suffix}
    </span>
  );
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${label} details`}
      className="absolute top-2.5 right-2.5 text-text-disabled hover:text-text-primary transition-colors"
    >
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
        <path
          d="M3 8L8 3M8 3H4M8 3V7"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
}

function MetricCellSkeleton({ hero = false }: { hero?: boolean }) {
  return (
    <div className={`metric-cell space-y-2 ${hero ? "metric-cell--hero" : ""}`}>
      <div className="skeleton h-2.5 w-14" />
      <div className={`skeleton ${hero ? "h-8 w-32" : "h-6 w-20"}`} />
      <div className="skeleton h-2.5 w-20" />
    </div>
  );
}

export function DashboardStats() {
  const { data: stats } = useStats();
  const { data: uptime } = useUptime();
  const { data: nav } = useNav();
  const loading = stats == null;

  const tvl = stats?.tvl;
  const apr24h = stats?.apr24h;
  const apr7d = stats?.apr7d;
  const totalTrades = stats?.totalTrades;
  const spreadOpportunities = stats?.spreadOpportunities;
  const upt = uptime?.uptime24h;

  const tvlAnim = useAnimatedNumber(tvl, 700);
  const apr7dAnim = useAnimatedNumber(apr7d, 500);
  const tradesAnim = useAnimatedNumber(totalTrades, 400);
  const uptAnim = useAnimatedNumber(upt, 500);

  const sparkPoints: number[] = useMemo(() => {
    const history: Array<{ timestamp: number; navPerShare: number }> = nav?.history ?? [];
    const cutoff = Date.now() - 7 * 24 * 3600_000;
    return history
      .filter((h) => h.timestamp >= cutoff && Number.isFinite(h.navPerShare) && h.navPerShare > 0.5)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((h) => h.navPerShare)
      .slice(-80);
  }, [nav]);

  if (loading) {
    return (
      <div className="metrics-strip">
        <MetricCellSkeleton hero />
        <MetricCellSkeleton />
        <MetricCellSkeleton />
        <MetricCellSkeleton />
      </div>
    );
  }

  return (
    <div className="metrics-strip">
      {/* HERO: TVL */}
      <div className="metric-cell metric-cell--hero">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-[0.08em] text-text-tertiary font-medium mb-2">
              Total value locked
            </p>
            <p className="tabular-mono text-[30px] sm:text-[34px] font-medium leading-none tracking-[-0.02em] text-text-primary">
              {tvl != null ? formatUsd(tvlAnim, { compact: true }) : "—"}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {apr24h != null &&
              apr24h !== 0 &&
              (apr7d == null || Math.abs(apr24h - apr7d) > 0.01) ? (
                <DeltaChip value={apr24h} suffix="24h APR" />
              ) : null}
              {apr24h == null || apr24h === 0 ? (
                <span className="text-[11px] text-text-disabled">awaiting data</span>
              ) : null}
            </div>
          </div>
          {sparkPoints.length >= 2 && (
            <Sparkline points={sparkPoints} width={110} height={38} className="shrink-0 mt-1" />
          )}
        </div>
      </div>

      {/* 7d APR */}
      <div className="metric-cell">
        <p className="text-[11px] uppercase tracking-[0.08em] text-text-tertiary font-medium mb-2">
          7-day APR
        </p>
        <p
          className={`tabular-mono text-[22px] font-medium leading-none tracking-tight ${
            apr7d == null ? "text-text-primary" : apr7d >= 0 ? "text-positive" : "text-negative"
          }`}
        >
          {apr7d != null ? `${apr7dAnim >= 0 ? "+" : ""}${apr7dAnim.toFixed(2)}%` : "—"}
        </p>
        <p className="mt-2.5 text-[11px] tabular-mono text-text-disabled">realized funding yield</p>
      </div>

      {/* Trades */}
      <div className="metric-cell">
        <p className="text-[11px] uppercase tracking-[0.08em] text-text-tertiary font-medium mb-2">
          Trades
        </p>
        <p className="tabular-mono text-[22px] font-medium leading-none tracking-tight text-text-primary">
          {totalTrades != null ? Math.round(tradesAnim).toLocaleString() : "—"}
        </p>
        <p className="mt-2.5 text-[11px] tabular-mono text-text-disabled">
          {spreadOpportunities ? `${spreadOpportunities} spreads seen` : "no opportunities yet"}
        </p>
      </div>

      {/* Uptime */}
      <div className="metric-cell">
        <ExternalLink href="https://stats.uptimerobot.com/JrNzCZ12Cu" label="Keeper uptime" />
        <p className="text-[11px] uppercase tracking-[0.08em] text-text-tertiary font-medium mb-2">
          Keeper uptime
        </p>
        <p
          className={`tabular-mono text-[22px] font-medium leading-none tracking-tight ${
            upt == null ? "text-text-primary" : upt >= 99 ? "text-positive" : upt >= 95 ? "text-text-primary" : "text-warning"
          }`}
        >
          {upt != null ? `${uptAnim.toFixed(1)}%` : "—"}
        </p>
        <p className="mt-2.5 text-[11px] tabular-mono text-text-disabled">last 24h</p>
      </div>
    </div>
  );
}
