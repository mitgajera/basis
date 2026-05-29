"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useStats, useHealth } from "../lib/api-client";
import { formatUsd } from "../lib/format";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/vault", label: "Vault" },
  // { href: "/replay", label: "Replay" },
];

export function Header() {
  const pathname = usePathname();
  const { data: stats } = useStats();
  const { data: health } = useHealth();
  const isLive = health?.ok === true;

  return (
    <header className="sticky top-0 z-50 glass-header">
      <div className="mx-auto flex h-11 max-w-screen-2xl items-center px-6 gap-6">

        {/* Wordmark */}
        <Link href="/" className="font-mono text-[14px] font-bold text-text-primary tracking-tighter shrink-0 select-none">
          basis<span className="text-accent">.</span>
        </Link>

        {/* Divider */}
        <span className="h-4 w-px bg-border-subtle shrink-0" />

        {/* Nav */}
        <nav className="flex items-center gap-0.5">
          {NAV.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`relative px-2.5 py-1 text-[12px] font-medium rounded-md transition-all duration-150 select-none ${
                  active
                    ? "text-text-primary bg-bg-surface-2"
                    : "text-text-disabled hover:text-text-secondary hover:bg-bg-surface"
                }`}
              >
                {label}
                {active && (
                  <span className="absolute bottom-0.5 left-2.5 right-2.5 h-px bg-accent/60 rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* Right cluster */}
        <div className="hidden sm:flex items-center gap-3 text-[11px]">
          {/* Keeper health */}
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isLive ? "bg-positive live-dot" : "bg-text-disabled"}`} />
            <span className={`font-medium ${isLive ? "text-positive" : "text-text-disabled"}`}>
              {isLive ? "live" : "offline"}
            </span>
          </div>

          {stats?.tvl != null && (
            <>
              <span className="h-3 w-px bg-border-default" />
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] uppercase tracking-widest text-text-disabled">TVL</span>
                <span className="tabular-mono text-text-secondary font-semibold">{formatUsd(stats.tvl, { compact: true })}</span>
                {stats.apr24h != null && Math.abs(stats.apr24h) > 0.01 && (
                  <span className={`tabular-mono ${stats.apr24h >= 0 ? "text-positive" : "text-negative"}`}>
                    {stats.apr24h >= 0 ? "+" : ""}{stats.apr24h.toFixed(1)}%
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Wallet */}
        <WalletMultiButton style={{
          background: "var(--bg-surface-2)",
          border: "1px solid var(--border-default)",
          borderRadius: "8px",
          color: "var(--text-primary)",
          fontSize: "11px",
          fontWeight: 500,
          height: "28px",
          padding: "0 10px",
          fontFamily: "var(--font-geist-sans)",
          letterSpacing: "0",
          lineHeight: "28px",
        }} />
      </div>
    </header>
  );
}
