"use client";

import { useSettlement } from "../lib/api-client";
import { formatUsd } from "../lib/format";

const CLUSTER = process.env.NEXT_PUBLIC_CLUSTER ?? "devnet";

function timeAgo(ms: number | null): string {
  if (!ms) return "never";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function SettlementCard() {
  const { data } = useSettlement();

  const onChainTvl       = data?.onChainTvl ?? null;
  const vaultUsdcBalance = data?.vaultUsdcBalance ?? null;
  const yieldMinted      = data?.totalYieldMinted ?? 0;
  const lastNavTx        = data?.lastNavTx ?? null;
  const lastNavAt        = data?.lastNavAt ?? null;
  const navPerShare      = data?.navPerShare ?? 1;

  // Backed if on-chain total_assets <= physical vault USDC (yield is minted, not phantom)
  const backed = onChainTvl != null && vaultUsdcBalance != null && vaultUsdcBalance + 1e-6 >= onChainTvl;

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.04]">
        <span className="text-[10px] uppercase tracking-[0.12em] text-text-disabled font-medium">On-Chain Settlement</span>
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${data ? "bg-positive live-dot" : "bg-text-disabled"}`} />
          <span className="text-[10px] uppercase tracking-wide text-text-tertiary">devnet</span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px bg-white/[0.04]">
        <Metric label="On-Chain TVL" value={onChainTvl != null ? formatUsd(onChainTvl) : "—"} />
        <Metric label="Vault USDC" value={vaultUsdcBalance != null ? formatUsd(vaultUsdcBalance) : "—"} />
        <Metric label="NAV / Share" value={`$${navPerShare.toFixed(4)}`} />
        <Metric label="Yield Settled" value={formatUsd(yieldMinted)} accent={yieldMinted > 0} />
      </div>

      {/* Backed indicator + last settlement tx */}
      <div className="px-5 py-3 border-t border-white/[0.04] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-tertiary">Yield backing</span>
          <span className={`text-[11px] font-medium flex items-center gap-1.5 ${backed ? "text-positive" : "text-warning"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${backed ? "bg-positive" : "bg-warning"}`} />
            {backed ? "fully backed" : "syncing"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-tertiary">Last settlement</span>
          {lastNavTx ? (
            <a
              href={`https://solscan.io/tx/${lastNavTx}?cluster=${CLUSTER}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] tabular-mono text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
            >
              {timeAgo(lastNavAt)}
              <span className="opacity-60">{lastNavTx.slice(0, 4)}…{lastNavTx.slice(-4)}</span>
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          ) : (
            <span className="text-[11px] text-text-disabled">{timeAgo(lastNavAt)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-bg-surface px-5 py-3">
      <p className="text-[10px] uppercase tracking-[0.10em] text-text-disabled mb-1">{label}</p>
      <p className={`tabular-mono text-[15px] font-semibold ${accent ? "text-positive" : "text-text-primary"}`}>{value}</p>
    </div>
  );
}
