import path from "path";
import fs from "fs";
import * as dotenv from "dotenv";
import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { createMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const IDL_PATH = path.resolve(__dirname, "../../../anchor/target/idl/basis_vault.json");

// Creates a fresh keeper-owned tUSDC mint and initializes a vault bound to it.
// Prints the new mint address to paste into .env (USDC_MINT) and web/.env.local.
async function main() {
  const rpcUrl = process.env.HELIUS_RPC_URL ?? "https://api.devnet.solana.com";
  const programId = new PublicKey(process.env.VAULT_PROGRAM_ID ?? "GLfySZNLkrDGLmckY1vpFEiXxHToMJzPtCWQcx4wDgbS");

  const rawKey = process.env.KEEPER_PRIVATE_KEY;
  if (!rawKey) throw new Error("KEEPER_PRIVATE_KEY not set in .env");
  const kp = Keypair.fromSeed(Buffer.from(rawKey, "base64").slice(0, 32));

  const connection = new Connection(rpcUrl, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(kp), { commitment: "confirmed" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8")) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = new Program(idl, provider) as any;

  console.log("Keeper:", kp.publicKey.toBase58());
  const bal = await connection.getBalance(kp.publicKey);
  console.log("SOL balance:", (bal / LAMPORTS_PER_SOL).toFixed(4));
  if (bal < 0.05 * LAMPORTS_PER_SOL) {
    console.log("Low SOL — requesting devnet airdrop…");
    try {
      const sig = await connection.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
      console.log("Airdrop confirmed");
    } catch (e) {
      console.warn("Airdrop failed (rate-limited?). Fund the keeper manually and retry.", String(e));
    }
  }

  // 1. Create keeper-owned tUSDC mint (6 decimals, keeper = mint + freeze authority)
  console.log("\nCreating tUSDC mint (keeper-owned)…");
  const mint = await createMint(connection, kp, kp.publicKey, kp.publicKey, 6);
  console.log("✅ tUSDC mint:", mint.toBase58());

  // 2. Derive vault PDAs for the new mint
  const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from("vault"), mint.toBuffer()], programId);
  const [vaultUsdcAccount] = PublicKey.findProgramAddressSync([Buffer.from("vault_usdc"), vaultPda.toBuffer()], programId);
  const [shareMint] = PublicKey.findProgramAddressSync([Buffer.from("share_mint"), vaultPda.toBuffer()], programId);

  // 3. Initialize vault
  console.log("\nInitializing vault…");
  const sig = await program.methods.initialize()
    .accounts({
      admin: kp.publicKey,
      vault: vaultPda,
      usdcMint: mint,
      vaultUsdcAccount,
      shareMint,
      keeper: kp.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([kp])
    .rpc();

  console.log("✅ Vault initialized — tx:", sig);
  console.log("\n────────────────────────────────────────────────");
  console.log("Vault PDA:        ", vaultPda.toBase58());
  console.log("Vault USDC acct:  ", vaultUsdcAccount.toBase58());
  console.log("Share mint:       ", shareMint.toBase58());
  console.log("────────────────────────────────────────────────");
  console.log("\n👉 Update these env vars:");
  console.log(`   .env             USDC_MINT=${mint.toBase58()}`);
  console.log(`   web/.env.local   NEXT_PUBLIC_USDC_MINT=${mint.toBase58()}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
