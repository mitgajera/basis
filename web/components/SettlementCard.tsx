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

  const onChainTvl = data?.onChainTvl ?? null;
  const vaultUsdcBalance = data?.vaultUsdcBalance ?? null;
  const yieldMinted = data?.totalYieldMinted ?? 0;
  const lastNavTx = data?.lastNavTx ?? null;
  const lastNavAt = data?.lastNavAt ?? null;
  const navPerShare = data?.navPerShare ?? 1;

  const backed = onChainTvl != null && vaultUsdcBalance != null && vaultUsdcBalance + 1e-6 >= onChainTvl;

  return (
    <div className="panel overflow-hidden">
      <div className="panel-header flex items-center justify-between">
        <span className="text-[13px] font-medium text-text-secondary">On-chain settlement</span>
        <span className="text-[11px] text-text-tertiary tabular-mono">devnet</span>
      </div>

      <div className="grid grid-cols-2 gap-px bg-white/[0.04]">
        <Metric label="On-chain TVL" value={onChainTvl != null ? formatUsd(onChainTvl) : "—"} />
        <Metric label="Vault USDC" value={vaultUsdcBalance != null ? formatUsd(vaultUsdcBalance) : "—"} />
        <Metric label="NAV / share" value={`$${navPerShare.toFixed(4)}`} />
        <Metric label="Yield settled" value={formatUsd(yieldMinted)} accent={yieldMinted > 0} />
      </div>

      <div className="px-5 py-3.5 border-t border-white/[0.04] space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-tertiary">Yield backing</span>
          <span className={`text-[11px] font-medium ${backed ? "text-positive" : "text-warning"}`}>
            {backed ? "Fully backed" : "Syncing"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-tertiary">Last settlement</span>
          {lastNavTx ? (
            <a
              href={`https://solscan.io/tx/${lastNavTx}?cluster=${CLUSTER}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] tabular-mono text-accent hover:text-accent-hover transition-colors"
            >
              {timeAgo(lastNavAt)} · {lastNavTx.slice(0, 4)}…{lastNavTx.slice(-4)}
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
    <div className="bg-bg-surface/50 px-5 py-4">
      <p className="text-[12px] text-text-tertiary mb-1.5">{label}</p>
      <p className={`tabular-mono text-[16px] font-semibold ${accent ? "text-positive" : "text-text-primary"}`}>
        {value}
      </p>
    </div>
  );
}
