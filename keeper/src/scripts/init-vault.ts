import path from "path";
import fs from "fs";
import * as dotenv from "dotenv";
import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet, BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const IDL_PATH = path.resolve(__dirname, "../../../anchor/target/idl/basis_vault.json");

async function main() {
  const rpcUrl = process.env.HELIUS_RPC_URL ?? "https://api.devnet.solana.com";
  const programId = new PublicKey(process.env.VAULT_PROGRAM_ID ?? "GLfySZNLkrDGLmckY1vpFEiXxHToMJzPtCWQcx4wDgbS");
  const usdcMint = new PublicKey(process.env.USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

  const rawKey = process.env.KEEPER_PRIVATE_KEY;
  if (!rawKey) throw new Error("KEEPER_PRIVATE_KEY not set in .env");
  const kp = Keypair.fromSeed(Buffer.from(rawKey, "base64").slice(0, 32));

  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = new Wallet(kp);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8")) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = new Program(idl, provider) as any;

  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), usdcMint.toBuffer()],
    programId
  );
  const [vaultUsdcAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_usdc"), vaultPda.toBuffer()],
    programId
  );
  const [shareMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("share_mint"), vaultPda.toBuffer()],
    programId
  );

  console.log("Admin:          ", kp.publicKey.toBase58());
  console.log("Vault PDA:      ", vaultPda.toBase58());
  console.log("USDC mint:      ", usdcMint.toBase58());
  console.log("Vault USDC acct:", vaultUsdcAccount.toBase58());
  console.log("Share mint:     ", shareMint.toBase58());

  // Check if already initialized
  const acctInfo = await connection.getAccountInfo(vaultPda);
  if (acctInfo) {
    console.log("\nVault already initialized.");
    return;
  }

  console.log("\nInitializing vault...");
  const sig = await program.methods.initialize()
    .accounts({
      admin: kp.publicKey,
      vault: vaultPda,
      usdcMint,
      vaultUsdcAccount,
      shareMint,
      keeper: kp.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([kp])
    .rpc();

  console.log("Vault initialized! tx:", sig);
}

main().catch((e) => { console.error(e); process.exit(1); });
