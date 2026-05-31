"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { toast, toastTx } from "../../lib/toast";
import { BrandMark } from "../../components/BrandMark";
import { CooldownRing } from "../../components/CooldownRing";
import { Header } from "../../components/Header";
import { useUsdcBalance } from "../../lib/anchor";
import { requestFaucet, useFaucetStatus } from "../../lib/api-client";
import { formatUsd } from "../../lib/format";

const CLUSTER = process.env.NEXT_PUBLIC_CLUSTER ?? "devnet";

function shortAddr(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "ready";
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

function splitRemaining(ms: number): { primary: string; suffix: string } {
  if (ms <= 0) return { primary: "ready", suffix: "" };
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return { primary: `${h}h`, suffix: `${m}m` };
  if (m > 0) return { primary: `${m}m`, suffix: `${s.toString().padStart(2, "0")}s` };
  return { primary: `${s}s`, suffix: "" };
}

export default function FaucetPage() {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const [loading, setLoading] = useState(false);
  const balance = useUsdcBalance(publicKey);

  const addrStr = publicKey?.toBase58() ?? null;
  const { data: status, mutate: refreshStatus } = useFaucetStatus(addrStr);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!status || status.ready) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status?.ready, status?.lastMintMs]);

  const totalCooldownMs = status?.cooldownMs ?? 2 * 60 * 60_000;
  const remainingMs = status?.lastMintMs != null
    ? Math.max(0, totalCooldownMs - (now - status.lastMintMs))
    : 0;
  const onCooldown = publicKey != null && remainingMs > 0;
  const ringReady = publicKey != null && !onCooldown && !loading;
  const { primary, suffix } = splitRemaining(remainingMs);

  const handleAction = async () => {
    if (!publicKey) { setVisible(true); return; }
    if (onCooldown) return;
    setLoading(true);
    const toastId = toast.loading("Minting devnet tUSDC…", {
      description: `Sending 50 tUSDC to ${shortAddr(publicKey.toBase58())}`,
    });
    try {
      const result = await requestFaucet(publicKey.toBase58());
      if (result.ok && result.sig) {
        const cooldownMs = result.cooldownMs ?? 2 * 60 * 60_000;
        const optimistic = {
          address: publicKey.toBase58(),
          cooldownMs,
          lastMintMs: Date.now(),
          remainingMs: cooldownMs,
          ready: false,
        };
        await refreshStatus(optimistic, { revalidate: true });
        toastTx(result.sig, "Minted 50 tUSDC", {
          id: toastId,
          extra: <span>Next mint available in 2 hours</span>,
        });
      } else if (result.remainingMs != null) {
        const optimistic = {
          address: publicKey.toBase58(),
          cooldownMs: result.cooldownMs ?? 2 * 60 * 60_000,
          lastMintMs: Date.now() - ((result.cooldownMs ?? 2 * 60 * 60_000) - result.remainingMs),
          remainingMs: result.remainingMs,
          ready: false,
        };
        await refreshStatus(optimistic, { revalidate: true });
        toast.error("Cooldown active", {
          id: toastId,
          description: result.message ?? `Try again in ${formatRemaining(result.remainingMs)}`,
        });
      } else {
        toast.error("Faucet failed", { id: toastId, description: result.error ?? "Please try again" });
      }
    } catch (e) {
      toast.error("Faucet error", { id: toastId, description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const buttonLabel =
    loading ? "Minting…" :
    !publicKey ? "Connect Wallet" :
    onCooldown ? `Available in ${formatRemaining(remainingMs)}` :
    "Mint 50 tUSDC";

  return (
    <div className="min-h-screen bg-bg-base">
      <Header />
      <main className="mx-auto max-w-md px-6 py-12">
        <div className="text-center mb-6 flex flex-col items-center gap-2">
          <BrandMark size={26} className="text-accent" />
          <h1 className="text-[22px] font-semibold tracking-[-0.035em]">Devnet faucet</h1>
          <p className="section-label">Test USDC · one mint per wallet every 2 hours</p>
        </div>

        <div className="panel overflow-hidden">
          <div className="panel-body space-y-6">
            <div className="flex flex-col items-center pt-3">
              <CooldownRing
                remainingMs={remainingMs}
                totalMs={totalCooldownMs}
                ready={ringReady}
                size={140}
              >
                <div className="flex flex-col items-center justify-center leading-none">
                  {!publicKey ? (
                    <span className="text-[11px] text-text-disabled uppercase tracking-[0.08em]">
                      no wallet
                    </span>
                  ) : ringReady ? (
                    <>
                      <span className="tabular-mono text-[26px] font-medium text-accent">50</span>
                      <span className="text-[10px] uppercase tracking-[0.1em] text-text-tertiary mt-1.5">
                        tUSDC ready
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="tabular-mono text-[26px] font-medium text-text-primary">
                        {primary}
                      </span>
                      {suffix && (
                        <span className="tabular-mono text-[11px] text-text-tertiary mt-0.5">
                          {suffix}
                        </span>
                      )}
                      <span className="text-[10px] uppercase tracking-[0.1em] text-text-disabled mt-1.5">
                        cooldown
                      </span>
                    </>
                  )}
                </div>
              </CooldownRing>
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-[0.08em] text-text-disabled font-medium">
                Recipient
              </p>
              <div className="field flex items-center justify-between px-3 py-2.5">
                <span className="tabular-mono text-[13px] text-text-primary">
                  {publicKey ? shortAddr(publicKey.toBase58()) : "—"}
                </span>
                {publicKey && (
                  <span className="text-[11px] text-text-tertiary tabular-mono">
                    bal: {formatUsd(balance)}
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleAction}
              disabled={loading || onCooldown}
              className="btn-primary w-full py-3.5 text-[14px] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {buttonLabel}
            </button>

            <div className="space-y-1 pt-1 border-t border-border-subtle">
              <p className="text-[11px] uppercase tracking-[0.06em] text-text-disabled font-medium mt-3">
                Token
              </p>
              <p className="tabular-mono text-[11px] text-text-tertiary break-all">
                BYBc1fivzgzSNRmVXMAq7V2DqP7CqDmPBDC15VYbaup9
              </p>
              <p className="text-[10.5px] text-text-disabled">tUSDC · {CLUSTER} · 6 decimals</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
