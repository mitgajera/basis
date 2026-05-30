"use client";

import { useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { toast, toastTx } from "../lib/toast";
import { useVaultProgram, getVaultPDA, getUserPositionPDA, USDC_MINT, PROGRAM_ID } from "../lib/anchor";
import { formatUsd, formatShares } from "../lib/format";

interface WithdrawCardProps {
  navPerShare: number;
  totalShares: number;
  totalAssets: number;
  userShares: number;
  onSuccess?: () => void;
}

export function WithdrawCard({ navPerShare, totalShares, totalAssets, userShares, onSuccess }: WithdrawCardProps) {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
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

  const handleAction = () => {
    if (!publicKey) {
      setVisible(true);
      return;
    }
    void handleWithdraw();
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

      toastTx(sig, `Withdrew ${formatUsd(usdcOut)}`, {
        id: toastId,
        extra: <span>Burned {formatShares(burnShares)} bUSD shares</span>,
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
        <label className="block text-[13px] text-text-secondary mb-2">You burn</label>
        <div className="field flex items-center gap-2 px-3 py-3">
          <input
            type="number"
            min="0"
            step="0.0001"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            placeholder="0.0000"
            className="flex-1 bg-transparent tabular-mono text-text-primary outline-none text-[18px] font-medium"
          />
          <span className="text-text-tertiary text-[12px] font-medium">bUSD</span>
        </div>
        <div className="flex gap-1.5 mt-2">
          {[25, 50, 75, 100].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPct(p)}
              className="pct-chip"
            >
              {p === 100 ? "Max" : `${p}%`}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-[13px] text-text-secondary mb-2">You receive</label>
        <div className="field flex items-center gap-2 px-3 py-3 opacity-90">
          <span className="flex-1 tabular-mono text-text-primary text-[18px] font-medium">
            {sharesNum > 0 ? formatUsd(usdcPreview) : "$0.00"}
          </span>
          <span className="text-text-tertiary text-[12px] font-medium">USDC</span>
        </div>
      </div>

      {insufficient && (
        <p className="text-xs text-negative">Insufficient bUSD balance</p>
      )}

      <button
        type="button"
        onClick={handleAction}
        disabled={publicKey ? (!canWithdraw || loading) : loading}
        className="btn-ghost w-full py-3.5 text-[14px] mt-2 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? "Withdrawing..." : !publicKey ? "Connect Wallet" : "Withdraw USDC"}
      </button>

      <p className="text-[11px] text-text-tertiary text-center">
        1 bUSD = {formatUsd(navPerShare)} · devnet
      </p>
    </div>
  );
}
