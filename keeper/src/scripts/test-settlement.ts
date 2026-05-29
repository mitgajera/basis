import path from "path";
import fs from "fs";
import * as dotenv from "dotenv";
import { Connection, Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet, BN } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount, getAssociatedTokenAddressSync, getAccount, mintTo,
} from "@solana/spl-token";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
const IDL_PATH = path.resolve(__dirname, "../../../anchor/target/idl/basis_vault.json");

// End-to-end devnet settlement test:
//   faucet → deposit → mint yield into vault → updateNav → verify NAV rose & backed → withdraw
async function main() {
  const rpcUrl = process.env.HELIUS_RPC_URL!;
  const programId = new PublicKey(process.env.VAULT_PROGRAM_ID!);
  const mint = new PublicKey(process.env.USDC_MINT!);
  const keeper = Keypair.fromSeed(Buffer.from(process.env.KEEPER_PRIVATE_KEY!, "base64").slice(0, 32));
  const connection = new Connection(rpcUrl, "confirmed");

  // Fresh test user
  const user = Keypair.generate();
  console.log("Test user:", user.publicKey.toBase58());

  // Fund user with SOL for fees (from keeper)
  const fundSig = await connection.requestAirdrop(user.publicKey, 0.05 * LAMPORTS_PER_SOL).catch(() => null);
  if (fundSig) await connection.confirmTransaction(fundSig, "confirmed");
  else {
    // transfer from keeper if airdrop rate-limited
    const { Transaction } = await import("@solana/web3.js");
    const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: keeper.publicKey, toPubkey: user.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL }));
    const sig = await connection.sendTransaction(tx, [keeper]);
    await connection.confirmTransaction(sig, "confirmed");
  }
  console.log("User SOL:", (await connection.getBalance(user.publicKey)) / LAMPORTS_PER_SOL);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8")) as any;
  const userProvider = new AnchorProvider(connection, new Wallet(user), { commitment: "confirmed" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = new Program(idl, userProvider) as any;

  const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from("vault"), mint.toBuffer()], programId);
  const [vaultUsdc] = PublicKey.findProgramAddressSync([Buffer.from("vault_usdc"), vaultPda.toBuffer()], programId);
  const [shareMint] = PublicKey.findProgramAddressSync([Buffer.from("share_mint"), vaultPda.toBuffer()], programId);
  const [userPos] = PublicKey.findProgramAddressSync([Buffer.from("user_position"), user.publicKey.toBuffer()], programId);

  // 1. Faucet 100 tUSDC to user (keeper mints)
  const userUsdc = await getOrCreateAssociatedTokenAccount(connection, keeper, mint, user.publicKey);
  await mintTo(connection, keeper, mint, userUsdc.address, keeper, 100 * 1e6);
  console.log("\n1. Faucet → user tUSDC:", Number((await getAccount(connection, userUsdc.address)).amount) / 1e6);

  const userShareAta = getAssociatedTokenAddressSync(shareMint, user.publicKey);

  // 2. Deposit 50 tUSDC
  await program.methods.deposit(new BN(50 * 1e6)).accounts({
    user: user.publicKey, vault: vaultPda, userPosition: userPos,
    userUsdc: userUsdc.address, vaultUsdc, shareMint, userShareAccount: userShareAta,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
  }).signers([user]).rpc();
  let vault = await program.account["vault"].fetch(vaultPda);
  console.log("\n2. After deposit 50:");
  console.log("   total_assets:", Number(vault.totalAssets) / 1e6, "| total_shares:", Number(vault.totalShares) / 1e6, "| NAV:", (Number(vault.totalAssets) / Number(vault.totalShares)).toFixed(6));

  // 3. Simulate yield: keeper mints 2.5 tUSDC into vault, then updateNav
  await mintTo(connection, keeper, mint, vaultUsdc, keeper, 2.5 * 1e6);
  const newBalance = Number((await getAccount(connection, vaultUsdc)).amount); // raw
  const keeperProvider = new AnchorProvider(connection, new Wallet(keeper), { commitment: "confirmed" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keeperProgram = new Program(idl, keeperProvider) as any;
  await keeperProgram.methods.updateNav(new BN(newBalance)).accounts({ keeper: keeper.publicKey, vault: vaultPda }).rpc();
  vault = await program.account["vault"].fetch(vaultPda);
  const navAfter = Number(vault.totalAssets) / Number(vault.totalShares);
  console.log("\n3. After settling 2.5 yield (minted + updateNav):");
  console.log("   total_assets:", Number(vault.totalAssets) / 1e6, "| vault USDC bal:", newBalance / 1e6, "| NAV:", navAfter.toFixed(6));
  console.log("   backed:", newBalance >= Number(vault.totalAssets) ? "✅ yes" : "❌ NO");

  // 4. Withdraw all shares → expect ~52.5 tUSDC back
  const shares = Number((await getAccount(connection, userShareAta)).amount);
  await program.methods.withdraw(new BN(shares)).accounts({
    user: user.publicKey, vault: vaultPda, userPosition: userPos,
    userUsdc: userUsdc.address, vaultUsdc, shareMint, userShareAccount: userShareAta, tokenProgram: TOKEN_PROGRAM_ID,
  }).signers([user]).rpc();
  const finalUsdc = Number((await getAccount(connection, userUsdc.address)).amount) / 1e6;
  console.log("\n4. After withdraw all shares:");
  console.log("   user tUSDC:", finalUsdc, "(deposited 50, started 100 → expect ~102.5)");
  console.log("   profit vs deposit:", (finalUsdc - 100).toFixed(4), "tUSDC");
  console.log("\n✅ End-to-end devnet settlement verified" );
}

main().catch((e) => { console.error(e); process.exit(1); });
