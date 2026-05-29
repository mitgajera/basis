"use client";

import { useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { useVaultProgram, getVaultPDA, getUserPositionPDA, USDC_MINT, PROGRAM_ID } from "../lib/anchor";
import { requestFaucet } from "../lib/api-client";
import { formatUsd, formatShares } from "../lib/format";

const CLUSTER = process.env.NEXT_PUBLIC_CLUSTER ?? "devnet";
const MIN_DEPOSIT = 1;

interface DepositCardProps {
  navPerShare: number;
  totalShares: number;
  totalAssets: number;
  userUsdcBalance: number;
  onSuccess?: () => void;
}

export function DepositCard({ navPerShare, totalShares, totalAssets, userUsdcBalance, onSuccess }: DepositCardProps) {
  const { publicKey } = useWallet();
  const program = useVaultProgram();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const [faucetLoading, setFaucetLoading] = useState(false);
  const amountNum = parseFloat(amount) || 0;
  const sharesPreview = totalAssets > 0 && totalShares > 0
    ? (amountNum * totalShares) / totalAssets
    : amountNum;
  const belowMin = amountNum > 0 && amountNum < MIN_DEPOSIT;
  const insufficientBalance = amountNum > userUsdcBalance;
  const canDeposit = amountNum >= MIN_DEPOSIT && !insufficientBalance && !!publicKey && !!program;

  const handleFaucet = async () => {
    if (!publicKey) return;
    setFaucetLoading(true);
    const toastId = toast.loading("Requesting devnet USDC...");
    try {
      const result = await requestFaucet(publicKey.toBase58());
      if (result.ok) {
        toast.success("50 devnet USDC sent to your wallet!", { id: toastId });
        onSuccess?.();
      } else {
        toast.error(result.error ?? "Faucet failed", { id: toastId });
      }
    } catch (e) {
      toast.error(`Faucet error: ${(e as Error).message}`, { id: toastId });
    } finally {
      setFaucetLoading(false);
    }
  };

  const setPct = (pct: number) => {
    setAmount(((userUsdcBalance * pct) / 100).toFixed(2));
  };

  const handleDeposit = async () => {
    if (!program || !publicKey) return;
    setLoading(true);
    const toastId = toast.loading("Submitting deposit...");
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
        .deposit(new BN(Math.floor(amountNum * 1_000_000)))
        .accounts({
          user: publicKey,
          vault: vaultPda,
          userPosition: userPositionPda,
          userUsdc: userUsdcAccount,
          vaultUsdc: vaultUsdcAccount,
          shareMint,
          userShareAccount,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      toast.success("Deposit confirmed", {
        id: toastId,
        action: {
          label: "Solscan",
          onClick: () => window.open(`https://solscan.io/tx/${sig}?cluster=${CLUSTER}`),
        },
      });
      setAmount("");
      onSuccess?.();
    } catch (e: unknown) {
      toast.error(`Deposit failed: ${(e as Error).message}`, { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-text-tertiary mb-1.5">You deposit</label>
        <div className="flex items-center gap-2 border border-border-default rounded-md bg-bg-surface-2 px-3 py-2">
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-transparent tabular-mono text-text-primary outline-none text-sm"
          />
          <span className="text-text-tertiary text-xs">USDC</span>
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
            {amountNum > 0 ? formatShares(sharesPreview) : "0.0000"}
          </span>
          <span className="text-text-tertiary text-xs">bUSD</span>
        </div>
      </div>

      {belowMin && (
        <p className="text-xs text-negative">Minimum deposit is 1 USDC</p>
      )}
      {insufficientBalance && (
        <div className="space-y-2">
          <p className="text-xs text-negative">
            Insufficient USDC balance — you have {userUsdcBalance.toFixed(2)} USDC
          </p>
          {publicKey && (
            <button
              onClick={handleFaucet}
              disabled={faucetLoading}
              className="w-full py-2 rounded-md text-xs font-medium border border-border-default text-text-secondary hover:text-text-primary hover:border-border-default/80 transition-colors duration-150 disabled:opacity-40"
            >
              {faucetLoading ? "Requesting..." : "Get 50 devnet USDC →"}
            </button>
          )}
        </div>
      )}

      <button
        onClick={handleDeposit}
        disabled={!canDeposit || loading}
        className="w-full py-2.5 rounded-md text-sm font-medium transition-colors duration-150 bg-accent text-bg-base hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? "Depositing..." : !publicKey ? "Connect Wallet" : "Deposit USDC"}
      </button>

      <p className="text-[11px] text-text-tertiary text-center">
        1 bUSD = {formatUsd(navPerShare)} · devnet
      </p>
    </div>
  );
}
