"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { AppShell } from "../../components/AppShell";
import { DepositCard } from "../../components/DepositCard";
import { WithdrawCard } from "../../components/WithdrawCard";
import { SettlementCard } from "../../components/SettlementCard";
import { SegmentedControl } from "../../components/SegmentedControl";
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
  const userUsdValue = userShares * navPerShare;

  return (
    <AppShell narrow>
      <div className="space-y-4">
        <div className="text-center pb-1">
          <h1 className="text-[20px] font-semibold tracking-[-0.03em]">Vault</h1>
          <p className="section-label mt-1">Deposit USDC, receive bUSD shares</p>
        </div>

        <div className="panel p-5 text-center">
          <p className="text-[12px] text-text-tertiary mb-2">Share price</p>
          <p className="tabular-mono text-[36px] font-medium text-text-primary leading-none tracking-tight">
            {formatUsd(navPerShare)}
          </p>
          <p className="text-[12px] text-text-tertiary mt-3 tabular-mono">
            {formatUsd(totalAssets > 0 ? totalAssets / 1_000_000 : (keeperStats?.tvl ?? 0), { compact: true })} TVL
            <span className="mx-2 text-border-default">·</span>
            {formatShares(totalShares > 0 ? totalShares / 1_000_000 : userShares / 1_000_000)} bUSD
          </p>
        </div>

        <div className="panel overflow-hidden">
          <div className="panel-header flex justify-center">
            <SegmentedControl
              options={[
                { value: "deposit", label: "Deposit" },
                { value: "withdraw", label: "Withdraw" },
              ]}
              value={tab}
              onChange={setTab}
            />
          </div>
          <div className="panel-body">
            {tab === "deposit" ? (
              <DepositCard
                navPerShare={navPerShare}
                totalShares={totalShares}
                totalAssets={totalAssets}
                userUsdcBalance={userUsdcBalance}
                onSuccess={() => setRefreshKey((k) => k + 1)}
              />
            ) : (
              <WithdrawCard
                navPerShare={navPerShare}
                totalShares={totalShares}
                totalAssets={totalAssets}
                userShares={userShares}
                onSuccess={() => setRefreshKey((k) => k + 1)}
              />
            )}
          </div>
        </div>

        <SettlementCard />

        {publicKey && (
          <div className="panel p-5">
            <p className="text-[13px] font-medium text-text-secondary mb-4">Your position</p>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "bUSD held", value: formatShares(userShares / 1_000_000) },
                { label: "USD value", value: formatUsd(userUsdValue / 1_000_000) },
                { label: "Deposited", value: formatUsd((userPosition?.depositedTotal ?? 0) / 1_000_000) },
                {
                  label: "Yield",
                  value: formatUsd(Math.max(0, userUsdValue - (userPosition?.depositedTotal ?? userUsdValue)) / 1_000_000),
                },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[12px] text-text-tertiary mb-1">{label}</p>
                  <p className="tabular-mono text-[15px] font-medium">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
