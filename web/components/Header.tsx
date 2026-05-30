"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStats, useHealth } from "../lib/api-client";
import { formatUsd } from "../lib/format";
import { WalletButton } from "./WalletButton";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/vault", label: "Vault" },
  { href: "/faucet", label: "Faucet" },
  // { href: "/replay", label: "Replay" },  // hidden from UI; route still works
];

export function Header() {
  const pathname = usePathname();
  const { data: stats } = useStats();
  const { data: health } = useHealth();
  const isLive = health?.ok === true;

  return (
    <header className="sticky top-0 z-50 app-header w-full">
      <div className="mx-auto flex h-12 max-w-[1360px] w-full items-center gap-5 px-4 sm:px-6">
        <Link
          href="/"
          className="text-[15px] font-bold tracking-[-0.04em] text-text-primary shrink-0"
        >
          basis<span className="text-accent">.</span>
        </Link>

        <nav className="flex items-center h-full gap-1">
          {NAV.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`relative h-full flex items-center px-3 text-[13px] font-medium transition-colors duration-200 ${
                  active ? "text-text-primary" : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                {label}
                {active && (
                  <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-accent" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        <div className="hidden md:flex items-center gap-4 text-[12px] tabular-mono">
          <span className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-positive live-dot" : "bg-text-disabled"}`} />
            <span className={isLive ? "text-positive font-medium" : "text-text-disabled"}>
              {isLive ? "Live" : "Offline"}
            </span>
          </span>
          {stats?.tvl != null && (
            <span className="text-text-secondary">
              <span className="text-text-tertiary mr-1.5">TVL</span>
              {formatUsd(stats.tvl, { compact: true })}
            </span>
          )}
        </div>

        <WalletButton />
      </div>
    </header>
  );
}
