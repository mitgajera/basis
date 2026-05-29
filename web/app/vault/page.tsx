"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Header } from "../../components/Header";
import { DepositCard } from "../../components/DepositCard";
import { WithdrawCard } from "../../components/WithdrawCard";
import { SettlementCard } from "../../components/SettlementCard";
import { useVaultState, useUserPosition, useUsdcBalance } from "../../lib/anchor";
import { useStats } from "../../lib/api-client";
import { formatUsd, formatShares } from "../../lib/format";

type Tab = "deposit" | "withdraw";

export default function VaultPage() {
  const [tab, setTab] = useState<Tab>("deposit");
  const [refreshKey, setRefreshKey] = useState(0);
  const { publicKey } = useWallet();

  const vaultState = useVaultState(refreshKey);
  const userPosition = useUserPosition(publicKey, refreshKey);
  const userUsdcBalance = useUsdcBalance(publicKey);
  const { data: keeperStats } = useStats();

  const navPerShare = vaultState?.navPerShare ?? 1;
  const totalShares = vaultState?.totalShares ?? 0;
  const totalAssets = vaultState?.totalAssets ?? 0;
  const userShares = userPosition?.shares ?? 0;
  // Use navPerShare × userShares so USD value is correct even when vaultState is unavailable
  const userUsdValue = userShares * navPerShare;

  const refresh = () => setRefreshKey((k) => k + 1);

  return (
    <div className="min-h-screen bg-bg-base">
      <Header />
      <main className="mx-auto max-w-xl px-6 py-8 space-y-6">
        {/* Vault overview */}
        <div className="rounded-lg border border-border-subtle bg-bg-surface p-6 space-y-1">
          <p className="uppercase text-[11px] tracking-[0.05em] text-text-tertiary">Vault</p>
          <div className="flex items-baseline gap-2">
            <span className="tabular-mono text-2xl text-text-primary">{formatUsd(navPerShare)}</span>
            <span className="text-text-tertiary text-sm">per bUSD share</span>
          </div>
          <p className="text-xs text-text-tertiary">
            TVL {formatUsd(totalAssets > 0 ? totalAssets / 1_000_000 : (keeperStats?.tvl ?? 0), { compact: true })} ·
            {" "}{formatShares(totalShares > 0 ? totalShares / 1_000_000 : userShares / 1_000_000)} bUSD supply
          </p>
        </div>

        {/* Deposit / Withdraw tabs */}
        <div className="rounded-lg border border-border-subtle bg-bg-surface overflow-hidden">
          <div className="flex border-b border-border-subtle">
            {(["deposit", "withdraw"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-3 text-sm capitalize transition-colors duration-150 ${
                  tab === t
                    ? "text-text-primary border-b-2 border-accent -mb-px"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="p-6">
            {tab === "deposit" ? (
              <DepositCard
                navPerShare={navPerShare}
                totalShares={totalShares}
                totalAssets={totalAssets}
                userUsdcBalance={userUsdcBalance}
                onSuccess={refresh}
              />
            ) : (
              <WithdrawCard
                navPerShare={navPerShare}
                totalShares={totalShares}
                totalAssets={totalAssets}
                userShares={userShares}
                onSuccess={refresh}
              />
            )}
          </div>
        </div>

        {/* On-chain settlement */}
        <SettlementCard />

        {/* User position */}
        {publicKey && (
          <div className="rounded-lg border border-border-subtle bg-bg-surface p-6 space-y-3">
            <p className="uppercase text-[11px] tracking-[0.05em] text-text-tertiary">Your Position</p>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "bUSD held", value: formatShares(userShares / 1_000_000) },
                { label: "USD value", value: formatUsd(userUsdValue / 1_000_000) },
                { label: "Lifetime deposited", value: formatUsd((userPosition?.depositedTotal ?? 0) / 1_000_000) },
                { label: "Unrealized yield", value: formatUsd(Math.max(0, userUsdValue - (userPosition?.depositedTotal ?? userUsdValue)) / 1_000_000) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[11px] text-text-tertiary mb-0.5">{label}</p>
                  <p className="tabular-mono text-sm text-text-primary">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
