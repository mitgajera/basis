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

  // Props arrive in raw on-chain units (1e6-scaled); the input field is human bUSD.
  const userSharesHuman = userShares / 1_000_000;
  const sharesNum = parseFloat(shares) || 0;
  const usdcPreview = totalShares > 0
    ? (sharesNum * totalAssets) / totalShares   // totalAssets/totalShares = $/share
    : 0;
  const insufficient = sharesNum > userSharesHuman;
  const canWithdraw = sharesNum > 0 && !insufficient && !!publicKey && !!program;

  const setPct = (pct: number) => {
    setShares(((userSharesHuman * pct) / 100).toFixed(4));
  };

  const handleWithdraw = async () => {
    if (!program || !publicKey) return;
    setLoading(true);
    const burnShares = sharesNum;
    const usdcOut = usdcPreview;
    const toastId = toast.loading("Confirming withdrawal…", {
      description: `Redeeming ${formatShares(burnShares)} bUSD`,
    });
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

      toast.success(`Withdrew ${formatUsd(usdcOut)}`, {
        id: toastId,
        description: `Burned ${formatShares(burnShares)} bUSD shares`,
        action: {
          label: "View ↗",
          onClick: () => window.open(`https://solscan.io/tx/${sig}?cluster=${CLUSTER}`),
        },
      });
      setShares("");
      onSuccess?.();
    } catch (e: unknown) {
      const msg = (e as Error).message ?? "";
      const friendly = /user rejected|rejected the request/i.test(msg)
        ? "You rejected the transaction"
        : /insufficient/i.test(msg)
        ? "Insufficient shares to withdraw"
        : "Transaction failed — please try again";
      toast.error("Withdrawal failed", { id: toastId, description: friendly });
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
