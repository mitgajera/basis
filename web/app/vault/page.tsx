"use client";

import { useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { AppShell } from "../../components/AppShell";
import { BrandMark } from "../../components/BrandMark";
import { DepositCard } from "../../components/DepositCard";
import { SegmentedControl } from "../../components/SegmentedControl";
import { SettlementCard } from "../../components/SettlementCard";
import { Sparkline } from "../../components/Sparkline";
import { WithdrawCard } from "../../components/WithdrawCard";
import { useNav, useStats } from "../../lib/api-client";
import { useUserPosition, useUsdcBalance, useVaultState } from "../../lib/anchor";
import { formatShares, formatUsd } from "../../lib/format";
import { useAnimatedNumber } from "../../hooks/useAnimatedNumber";

type Tab = "deposit" | "withdraw";

export default function VaultPage() {
  const [tab, setTab] = useState<Tab>("deposit");
  const [refreshKey, setRefreshKey] = useState(0);
  const { publicKey } = useWallet();

  const vaultState = useVaultState(refreshKey);
  const userPosition = useUserPosition(publicKey, refreshKey);
  const userUsdcBalance = useUsdcBalance(publicKey);
  const { data: keeperStats } = useStats();
  const { data: nav } = useNav();

  const navPerShare = vaultState?.navPerShare ?? 1;
  const totalShares = vaultState?.totalShares ?? 0;
  const totalAssets = vaultState?.totalAssets ?? 0;
  const userShares = userPosition?.shares ?? 0;
  const userUsdValue = userShares * navPerShare;

  const sparkPoints: number[] = useMemo(() => {
    const history: Array<{ timestamp: number; navPerShare: number }> = nav?.history ?? [];
    const cutoff = Date.now() - 7 * 24 * 3600_000;
    return history
      .filter((h) => h.timestamp >= cutoff && Number.isFinite(h.navPerShare) && h.navPerShare > 0.5)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((h) => h.navPerShare)
      .slice(-100);
  }, [nav]);

  const navAnim = useAnimatedNumber(navPerShare, 600);

  const delta7d = useMemo(() => {
    if (sparkPoints.length < 2) return null;
    const first = sparkPoints[0]!;
    const last = sparkPoints[sparkPoints.length - 1]!;
    return ((last - first) / first) * 100;
  }, [sparkPoints]);

  return (
    <AppShell narrow>
      <div className="space-y-4">
        <div className="text-center pb-1 flex flex-col items-center gap-2">
          <BrandMark size={28} className="text-accent" />
          <h1 className="text-[22px] font-semibold tracking-[-0.035em]">Vault</h1>
          <p className="section-label">Deposit USDC, receive bUSD shares</p>
        </div>

        <div className="panel p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-[0.08em] text-text-tertiary font-medium mb-2">
                Share price
              </p>
              <p className="tabular-mono text-[36px] font-medium text-text-primary leading-none tracking-[-0.02em]">
                {formatUsd(navAnim)}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {delta7d != null && (
                  <span
                    className="delta-chip"
                    data-tone={delta7d > 0 ? "positive" : delta7d < 0 ? "negative" : "neutral"}
                  >
                    {delta7d > 0 ? "+" : ""}
                    {delta7d.toFixed(3)}% 7d
                  </span>
                )}
                <span className="text-[11px] tabular-mono text-text-tertiary">
                  {formatUsd(
                    totalAssets > 0 ? totalAssets / 1_000_000 : keeperStats?.tvl ?? 0,
                    { compact: true }
                  )}{" "}
                  TVL
                </span>
                <span className="text-text-disabled">·</span>
                <span className="text-[11px] tabular-mono text-text-tertiary">
                  {formatShares(
                    totalShares > 0 ? totalShares / 1_000_000 : userShares / 1_000_000
                  )}{" "}
                  bUSD
                </span>
              </div>
            </div>
            {sparkPoints.length >= 2 && (
              <Sparkline points={sparkPoints} width={120} height={48} className="shrink-0 mt-1" />
            )}
          </div>
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
            <div key={tab} className="tab-content">
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
        </div>

        <SettlementCard />

        {publicKey && (
          <div className="panel p-5">
            <p className="text-[11px] uppercase tracking-[0.08em] text-text-tertiary font-medium mb-4">
              Your position
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "bUSD held", value: formatShares(userShares / 1_000_000) },
                { label: "USD value", value: formatUsd(userUsdValue / 1_000_000) },
                {
                  label: "Deposited",
                  value: formatUsd((userPosition?.depositedTotal ?? 0) / 1_000_000),
                },
                {
                  label: "Yield",
                  value: formatUsd(
                    Math.max(
                      0,
                      userUsdValue - (userPosition?.depositedTotal ?? userUsdValue)
                    ) / 1_000_000
                  ),
                  tone: "positive" as const,
                },
              ].map(({ label, value, tone }) => (
                <div key={label}>
                  <p className="text-[11px] uppercase tracking-[0.06em] text-text-disabled font-medium mb-1.5">
                    {label}
                  </p>
                  <p
                    className={`tabular-mono text-[16px] font-medium ${
                      tone === "positive" ? "text-positive" : "text-text-primary"
                    }`}
                  >
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
