"use client";

import { useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { toast, toastTx } from "../lib/toast";
import { useVaultProgram, getVaultPDA, getUserPositionPDA, USDC_MINT, PROGRAM_ID } from "../lib/anchor";
import { formatUsd, formatShares } from "../lib/format";

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
  const { setVisible } = useWalletModal();
  const program = useVaultProgram();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const amountNum = parseFloat(amount) || 0;
  const sharesPreview = totalAssets > 0 && totalShares > 0
    ? (amountNum * totalShares) / totalAssets
    : amountNum;
  const belowMin = amountNum > 0 && amountNum < MIN_DEPOSIT;
  const insufficientBalance = amountNum > userUsdcBalance;
  const canDeposit = amountNum >= MIN_DEPOSIT && !insufficientBalance && !!publicKey && !!program;

  const setPct = (pct: number) => {
    setAmount(((userUsdcBalance * pct) / 100).toFixed(2));
  };

  const handleAction = () => {
    if (!publicKey) {
      setVisible(true);
      return;
    }
    void handleDeposit();
  };

  const handleDeposit = async () => {
    if (!program || !publicKey) return;
    setLoading(true);
    const depositAmt = amountNum;
    const sharesOut = sharesPreview;
    const toastId = toast.loading("Confirming deposit…", {
      description: `Depositing ${formatUsd(depositAmt)} into the vault`,
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

      toastTx(sig, `Deposited ${formatUsd(depositAmt)}`, {
        id: toastId,
        extra: <span>Received {formatShares(sharesOut)} bUSD shares</span>,
      });
      setAmount("");
      onSuccess?.();
    } catch (e: unknown) {
      const msg = (e as Error).message ?? "";
      const friendly = /user rejected|rejected the request/i.test(msg)
        ? "You rejected the transaction"
        : /insufficient|0x1\b/i.test(msg)
        ? "Insufficient balance for this deposit"
        : "Transaction failed — please try again";
      toast.error("Deposit failed", { id: toastId, description: friendly });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-[13px] text-text-secondary mb-2">You deposit</label>
        <div className="field flex items-center gap-2 px-3 py-3">
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-transparent tabular-mono text-text-primary outline-none text-[18px] font-medium"
          />
          <span className="flex items-center gap-1.5 text-text-tertiary text-[12px] font-medium">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://assets.coingecko.com/coins/images/6319/small/usdc.png" alt="" width={16} height={16} className="token-ring" style={{ width: 16, height: 16, padding: 1 }} />
            USDC
          </span>
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
            {amountNum > 0 ? formatShares(sharesPreview) : "0.0000"}
          </span>
          <span className="text-text-tertiary text-[12px] font-medium">bUSD</span>
        </div>
      </div>

      {belowMin && (
        <p className="text-xs text-negative">Minimum deposit is 1 USDC</p>
      )}
      {insufficientBalance && (
        <p className="text-xs text-negative">Insufficient USDC balance</p>
      )}

      <button
        type="button"
        onClick={handleAction}
        disabled={publicKey ? (!canDeposit || loading) : loading}
        className="btn-primary w-full py-3.5 text-[14px] mt-2"
      >
        {loading ? "Depositing..." : !publicKey ? "Connect Wallet" : "Deposit USDC"}
      </button>

      <p className="text-[11px] text-text-tertiary text-center">
        1 bUSD = {formatUsd(navPerShare)} · devnet
      </p>
    </div>
  );
}
