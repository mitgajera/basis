import path from "path";
import fs from "fs";
import * as dotenv from "dotenv";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const IDL_PATH = path.resolve(__dirname, "../../../anchor/target/idl/basis_vault.json");

async function main() {
  const rpcUrl = process.env.HELIUS_RPC_URL ?? "https://api.devnet.solana.com";
  const programId = new PublicKey(process.env.VAULT_PROGRAM_ID ?? "GLfySZNLkrDGLmckY1vpFEiXxHToMJzPtCWQcx4wDgbS");
  const usdcMint = new PublicKey(process.env.USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

  const rawKey = process.env.KEEPER_PRIVATE_KEY;
  const kp = rawKey ? Keypair.fromSeed(Buffer.from(rawKey, "base64").slice(0, 32)) : Keypair.generate();

  const connection = new Connection(rpcUrl, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(kp), { commitment: "confirmed" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8")) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = new Program(idl, provider) as any;

  const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from("vault"), usdcMint.toBuffer()], programId);

  console.log("RPC:           ", rpcUrl.replace(/api-key=.*/, "api-key=<redacted>"));
  console.log("Program:       ", programId.toBase58());
  console.log("Keeper pubkey: ", kp.publicKey.toBase58());
  console.log("Vault PDA:     ", vaultPda.toBase58());

  const info = await connection.getAccountInfo(vaultPda);
  if (!info) {
    console.log("\n❌ Vault NOT initialized on devnet. Run: pnpm --filter @basis/keeper init-vault");
    return;
  }

  const v = await program.account["vault"].fetch(vaultPda);
  console.log("\n✅ Vault initialized");
  console.log("  authority:       ", v.authority.toBase58());
  console.log("  keeper:          ", v.keeper.toBase58(), v.keeper.equals(kp.publicKey) ? "(== our keeper ✓)" : "(MISMATCH ✗)");
  console.log("  total_assets:    ", (Number(v.totalAssets) / 1e6).toFixed(6), "USDC");
  console.log("  total_shares:    ", (Number(v.totalShares) / 1e6).toFixed(6), "bUSD");
  console.log("  nav_per_share:   ", Number(v.totalShares) > 0 ? (Number(v.totalAssets) / Number(v.totalShares)).toFixed(6) : "1.000000");
  console.log("  high_water_mark: ", (Number(v.highWaterMark) / 1e6).toFixed(6));
  console.log("  last_nav_update: ", new Date(Number(v.lastNavUpdate) * 1000).toISOString());
  console.log("  paused:          ", v.paused);

  // Vault's idle USDC
  try {
    const vaultUsdc = await getAccount(connection, v.vaultUsdcAccount);
    console.log("  vault USDC bal:  ", (Number(vaultUsdc.amount) / 1e6).toFixed(6), "USDC (idle on-chain)");
  } catch { console.log("  vault USDC bal:   <error reading>"); }

  // Keeper's own USDC (faucet authority)
  try {
    const ata = getAssociatedTokenAddressSync(usdcMint, kp.publicKey);
    const acct = await getAccount(connection, ata);
    console.log("  keeper USDC bal: ", (Number(acct.amount) / 1e6).toFixed(6), "USDC");
  } catch { console.log("  keeper USDC bal:  <no ATA>"); }
}

main().catch((e) => { console.error(e); process.exit(1); });
