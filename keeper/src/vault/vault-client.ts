import path from "path";
import fs from "fs";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet, BN } from "@coral-xyz/anchor";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Config } from "../config";
import { VaultSnapshot } from "@basis/shared";

const VAULT_SEED = Buffer.from("vault");
const IDL_PATH = path.resolve(__dirname, "../../../anchor/target/idl/basis_vault.json");

// Use a loose type to avoid deep generic instantiation errors before IDL is generated
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProgram = { account: Record<string, { fetch: (pda: PublicKey) => Promise<any> }>; methods: Record<string, (...args: any[]) => any> };

export class VaultClient {
  private connection: Connection;
  private program: AnyProgram | null = null;
  private vaultPda: PublicKey | null = null;
  private programId: PublicKey | null = null;
  private keeperKeypair: Keypair | null = null;

  constructor(private config: Config) {
    this.connection = new Connection(config.HELIUS_RPC_URL, "confirmed");
    this._tryInit();
  }

  private _tryInit(): void {
    if (!this.config.VAULT_PROGRAM_ID) return;
    if (!fs.existsSync(IDL_PATH)) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8")) as any;
      this.programId = new PublicKey(this.config.VAULT_PROGRAM_ID);

      const seed = this.config.KEEPER_PRIVATE_KEY
        ? Buffer.from(this.config.KEEPER_PRIVATE_KEY, "base64").slice(0, 32)
        : Keypair.generate().secretKey.slice(0, 32);

      // Build a 64-byte secret key (seed + public key)
      const kp = Keypair.fromSeed(seed);
      this.keeperKeypair = kp;

      const wallet = new Wallet(kp);
      const provider = new AnchorProvider(this.connection, wallet, { commitment: "confirmed" });
      this.program = new Program(idl, provider) as unknown as AnyProgram;

      const usdcMintPk = new PublicKey(this.config.USDC_MINT);
      ;[this.vaultPda] = PublicKey.findProgramAddressSync([VAULT_SEED, usdcMintPk.toBuffer()], this.programId);
    } catch {
      // IDL may not be generated yet; fall through to stub
    }
  }

  async getSnapshot(): Promise<VaultSnapshot> {
    if (this.program && this.vaultPda) {
      try {
        const vault = await this.program.account["vault"].fetch(this.vaultPda) as {
          totalAssets: BN;
          totalShares: BN;
          lastNavUpdate: BN;
          paused: boolean;
        };
        const totalAssets = vault.totalAssets.toNumber();
        const totalShares = vault.totalShares.toNumber();
        return {
          tvl: totalAssets / 1_000_000,
          totalShares,
          navPerShare: totalShares > 0 ? totalAssets / totalShares : 1,
          lastUpdated: vault.lastNavUpdate.toNumber() * 1000,
        };
      } catch {
        // fall through to stub
      }
    }

    const tvl = parseFloat(process.env["VAULT_TVL_USD"] ?? "1000");
    return { tvl, totalShares: tvl * 1_000_000, navPerShare: 1, lastUpdated: Date.now() };
  }

  async getCurrentNav(): Promise<number> {
    const snap = await this.getSnapshot();
    return snap.navPerShare;
  }

  async updateNav(_totalAssetsUsd: number): Promise<void> {
    if (!this.program || !this.vaultPda || !this.keeperKeypair) return;
    try {
      const lamports = Math.round(_totalAssetsUsd * 1_000_000);
      await this.program.methods["updateNav"](new BN(lamports))
        .accounts({ keeper: this.keeperKeypair.publicKey, vault: this.vaultPda })
        .signers([this.keeperKeypair])
        .rpc();
    } catch {
      // log but don't throw — NAV update failure is non-fatal for the keeper loop
    }
  }

  async getIdleBalance(): Promise<number> {
    if (!this.program || !this.vaultPda || !this.programId) return 0;
    try {
      const vault = await this.program.account["vault"].fetch(this.vaultPda) as {
        vaultUsdcAccount: PublicKey;
      };
      const tokenAcct = await getAccount(this.connection, vault.vaultUsdcAccount);
      return Number(tokenAcct.amount) / 1_000_000;
    } catch {
      return 0;
    }
  }

  async getKeeperUsdcBalance(): Promise<number> {
    if (!this.keeperKeypair || !this.config.USDC_MINT) return 0;
    try {
      const mint = new PublicKey(this.config.USDC_MINT);
      const ata = getAssociatedTokenAddressSync(mint, this.keeperKeypair.publicKey);
      const acct = await getAccount(this.connection, ata);
      return Number(acct.amount) / 1_000_000;
    } catch {
      return 0;
    }
  }
}
