"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStats } from "../lib/api-client";
import { formatUsd } from "../lib/format";
import { BrandMark } from "./BrandMark";
import { StatusPill } from "./StatusPill";
import { WalletButton } from "./WalletButton";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/vault", label: "Vault" },
  { href: "/faucet", label: "Faucet" },
];

export function Header() {
  const pathname = usePathname();
  const { data: stats } = useStats();

  return (
    <header className="sticky top-0 z-50 app-header w-full">
      <div className="mx-auto flex h-12 max-w-[1360px] w-full items-center gap-5 px-4 sm:px-6">
        <Link
          href="/"
          className="brand-link flex items-center gap-2 text-[15px] font-semibold tracking-[-0.035em] text-text-primary shrink-0"
        >
          <BrandMark size={20} className="brand-mark" />
          <span>
            basis<span className="text-accent">.</span>
          </span>
        </Link>

        <nav className="flex items-center h-full gap-0.5">
          {NAV.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`relative h-full flex items-center px-3 text-[13px] font-medium transition-colors duration-150 ${
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

        <div className="hidden md:flex items-center gap-3">
          <StatusPill />
          {stats?.tvl != null && (
            <span className="text-[12px] tabular-mono text-text-secondary">
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
