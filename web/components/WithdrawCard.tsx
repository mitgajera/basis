"use client";

import { useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { useVaultProgram, getVaultPDA, getUserPositionPDA, USDC_MINT, PROGRAM_ID } from "../lib/anchor";
import { formatUsd, formatShares } from "../lib/format";

const CLUSTER = process.env.NEXT_PUBLIC_CLUSTER ?? "devnet";

interface WithdrawCardProps {
  navPerShare: number;
  totalShares: number;
  totalAssets: number;
  userShares: number;
  onSuccess?: () => void;
}

export function WithdrawCard({ navPerShare, totalShares, totalAssets, userShares, onSuccess }: WithdrawCardProps) {
  const { publicKey } = useWallet();
  const program = useVaultProgram();
  const [shares, setShares] = useState("");
  const [loading, setLoading] = useState(false);

  const sharesNum = parseFloat(shares) || 0;
  const usdcPreview = totalShares > 0
    ? (sharesNum * totalAssets) / totalShares
    : 0;
  const insufficient = sharesNum > userShares;
  const canWithdraw = sharesNum > 0 && !insufficient && !!publicKey && !!program;

  const setPct = (pct: number) => {
    setShares(((userShares * pct) / 100).toFixed(4));
  };

  const handleWithdraw = async () => {
    if (!program || !publicKey) return;
    setLoading(true);
    const toastId = toast.loading("Submitting withdrawal...");
    try {
      const [vaultPda] = getVaultPDA();
      const [userPositionPda] = getUserPositionPDA(publicKey);
      const [vaultUsdcAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_usdc"), vaultPda.toBuffer()],
        PROGRAM_ID
      );
      const [shareMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("share_mint"), vaultPda.toBuffer()],
        PROGRAM_ID
      );
      const userUsdcAccount = getAssociatedTokenAddressSync(USDC_MINT, publicKey);
      const userShareAccount = getAssociatedTokenAddressSync(shareMint, publicKey);

      const sig = await program.methods
        .withdraw(new BN(Math.floor(sharesNum * 1_000_000)))
        .accounts({
          user: publicKey,
          vault: vaultPda,
          userPosition: userPositionPda,
          userUsdc: userUsdcAccount,
          vaultUsdc: vaultUsdcAccount,
          shareMint,
          userShareAccount,
        })
        .rpc();

      toast.success("Withdrawal confirmed", {
        id: toastId,
        action: {
          label: "Solscan",
          onClick: () => window.open(`https://solscan.io/tx/${sig}?cluster=${CLUSTER}`),
        },
      });
      setShares("");
      onSuccess?.();
    } catch (e: unknown) {
      toast.error(`Withdrawal failed: ${(e as Error).message}`, { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-text-tertiary mb-1.5">You burn</label>
        <div className="flex items-center gap-2 border border-border-default rounded-md bg-bg-surface-2 px-3 py-2">
          <input
            type="number"
            min="0"
            step="0.0001"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            placeholder="0.0000"
            className="flex-1 bg-transparent tabular-mono text-text-primary outline-none text-sm"
          />
          <span className="text-text-tertiary text-xs">bUSD</span>
        </div>
        <div className="flex gap-1 mt-1.5">
          {[25, 50, 75, 100].map((p) => (
            <button
              key={p}
              onClick={() => setPct(p)}
              className="text-[11px] px-2 py-0.5 rounded border border-border-subtle text-text-tertiary hover:border-border-default hover:text-text-secondary transition-colors duration-150"
            >
              {p === 100 ? "Max" : `${p}%`}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs text-text-tertiary mb-1.5">You receive</label>
        <div className="flex items-center gap-2 border border-border-subtle rounded-md bg-bg-surface-2 px-3 py-2 opacity-60">
          <span className="flex-1 tabular-mono text-text-primary text-sm">
            {sharesNum > 0 ? formatUsd(usdcPreview) : "$0.00"}
          </span>
          <span className="text-text-tertiary text-xs">USDC</span>
        </div>
      </div>

      {insufficient && (
        <p className="text-xs text-negative">Insufficient bUSD balance</p>
      )}

      <button
        onClick={handleWithdraw}
        disabled={!canWithdraw || loading}
        className="w-full py-2.5 rounded-md text-sm font-medium transition-colors duration-150 border border-border-default text-text-primary hover:border-accent-border hover:text-accent disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? "Withdrawing..." : !publicKey ? "Connect Wallet" : "Withdraw USDC"}
      </button>

      <p className="text-[11px] text-text-tertiary text-center">
        1 bUSD = {formatUsd(navPerShare)} · devnet
      </p>
    </div>
  );
}
