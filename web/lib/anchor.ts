"use client";

import { useMemo, useState, useEffect } from "react";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

// IDL loaded at runtime — copy anchor/target/idl/basis_vault.json here after each build
let idl: Record<string, unknown> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  idl = require("../idl/basis_vault.json");
} catch {
  // IDL not yet copied — vault interactions will be unavailable
}

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_VAULT_PROGRAM_ID ?? "GLfySZNLkrDGLmckY1vpFEiXxHToMJzPtCWQcx4wDgbS"
);

export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT ?? "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr"
);

export function getVaultPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), USDC_MINT.toBuffer()],
    PROGRAM_ID
  );
}

export function getUserPositionPDA(user: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("user_position"), user.toBuffer()],
    PROGRAM_ID
  );
}

export function useUsdcBalance(publicKey: PublicKey | null): number {
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number>(0);

  useEffect(() => {
    if (!publicKey) { setBalance(0); return; }
    const ata = getAssociatedTokenAddressSync(USDC_MINT, publicKey);
    connection.getTokenAccountBalance(ata)
      .then((r) => setBalance(Number(r.value.amount) / 1_000_000))
      .catch(() => setBalance(0));
  }, [publicKey, connection]);

  return balance;
}

export interface OnChainVaultState {
  totalAssets: number;
  totalShares: number;
  navPerShare: number;
}

export interface OnChainUserPosition {
  shares: number;
  depositedTotal: number;
}

export function useVaultState(refreshKey = 0): OnChainVaultState | null {
  const { connection } = useConnection();
  const program = useVaultProgram();
  const [state, setState] = useState<OnChainVaultState | null>(null);

  useEffect(() => {
    if (!program) return;
    const [vaultPda] = getVaultPDA();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (program.account as any)["vault"].fetch(vaultPda)
      .then((v: { totalAssets: { toNumber(): number }; totalShares: { toNumber(): number } }) => {
        const totalAssets = v.totalAssets.toNumber();
        const totalShares = v.totalShares.toNumber();
        setState({
          totalAssets,
          totalShares,
          navPerShare: totalShares > 0 ? totalAssets / totalShares : 1,
        });
      })
      .catch(() => setState(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, connection, refreshKey]);

  return state;
}

export function useUserPosition(publicKey: PublicKey | null, refreshKey = 0): OnChainUserPosition | null {
  const { connection } = useConnection();
  const program = useVaultProgram();
  const [position, setPosition] = useState<OnChainUserPosition | null>(null);

  useEffect(() => {
    if (!program || !publicKey) { setPosition(null); return; }
    const [posPda] = getUserPositionPDA(publicKey);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (program.account as any)["userPosition"].fetch(posPda)
      .then((p: { shares: { toNumber(): number }; depositedTotal: { toNumber(): number } }) => {
        setPosition({
          shares: p.shares.toNumber(),
          depositedTotal: p.depositedTotal.toNumber(),
        });
      })
      .catch(() => setPosition(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, publicKey, connection, refreshKey]);

  return position;
}

export function useVaultProgram(): Program | null {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    if (!wallet || !idl) return null;
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Program(idl as any, provider);
  }, [connection, wallet]);
}
