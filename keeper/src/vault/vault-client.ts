import path from "path";
import fs from "fs";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet, BN } from "@coral-xyz/anchor";
import { getAccount, getAssociatedTokenAddressSync, mintTo } from "@solana/spl-token";
import pino from "pino";
import { Config } from "../config";
import { VaultSnapshot } from "@basis/shared";

const log = pino({ transport: { target: "pino-pretty" } });

const VAULT_SEED = Buffer.from("vault");
const IDL_PATH = path.resolve(__dirname, "../../../anchor/target/idl/basis_vault.json");

// Loose type to avoid deep generic instantiation before IDL is generated
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProgram = { account: Record<string, { fetch: (pda: PublicKey) => Promise<any> }>; methods: Record<string, (...args: any[]) => any> };

export interface SettlementInfo {
  lastNavTx: string | null;
  lastNavAt: number | null;     // ms epoch of last successful on-chain NAV push
  onChainTvl: number;           // total_assets / 1e6
  vaultUsdcBalance: number;     // actual idle USDC in the vault account
  totalShares: number;          // raw (1e6)
  navPerShare: number;
  totalYieldMinted: number;     // cumulative tUSDC minted to back yield this run
}

export class VaultClient {
  private connection: Connection;
  private program: AnyProgram | null = null;
  private vaultPda: PublicKey | null = null;
  private programId: PublicKey | null = null;
  private keeperKeypair: Keypair | null = null;
  private usdcMintPk: PublicKey | null = null;
  private vaultUsdcAccount: PublicKey | null = null;

  // Settlement bookkeeping (in-memory; resets on restart)
  private lastNavTx: string | null = null;
  private lastNavAt: number | null = null;
  private totalYieldMinted = 0;

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

      const kp = Keypair.fromSeed(seed);
      this.keeperKeypair = kp;

      const wallet = new Wallet(kp);
      const provider = new AnchorProvider(this.connection, wallet, { commitment: "confirmed" });
      this.program = new Program(idl, provider) as unknown as AnyProgram;

      this.usdcMintPk = new PublicKey(this.config.USDC_MINT);
      ;[this.vaultPda] = PublicKey.findProgramAddressSync([VAULT_SEED, this.usdcMintPk.toBuffer()], this.programId);
      ;[this.vaultUsdcAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_usdc"), this.vaultPda.toBuffer()],
        this.programId,
      );
    } catch {
      // IDL may not be generated yet; fall through to stub
    }
  }

  get isLive(): boolean {
    return !!(this.program && this.vaultPda && this.keeperKeypair);
  }

  async getSnapshot(): Promise<VaultSnapshot> {
    if (this.program && this.vaultPda) {
      try {
        const vault = await this.program.account["vault"].fetch(this.vaultPda) as {
          totalAssets: BN; totalShares: BN; lastNavUpdate: BN; paused: boolean;
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

  /** Mint tUSDC into the vault's USDC account to physically back accrued yield. Keeper is mint authority. */
  async mintYieldToVault(amountUsdc: number): Promise<string | null> {
    if (!this.keeperKeypair || !this.usdcMintPk || !this.vaultUsdcAccount) return null;
    if (amountUsdc <= 0) return null;
    const lamports = Math.round(amountUsdc * 1_000_000);
    if (lamports <= 0) return null;
    try {
      const sig = await mintTo(
        this.connection,
        this.keeperKeypair,
        this.usdcMintPk,
        this.vaultUsdcAccount,
        this.keeperKeypair, // mint authority
        lamports,
      );
      this.totalYieldMinted += amountUsdc;
      log.info({ amountUsdc: amountUsdc.toFixed(6), sig }, "minted yield into vault");
      return sig;
    } catch (e) {
      log.warn({ err: String(e) }, "mintYieldToVault failed");
      return null;
    }
  }

  /** Push absolute total_assets to the on-chain vault. Returns tx signature on success. */
  async updateNav(totalAssetsUsd: number): Promise<string | null> {
    if (!this.program || !this.vaultPda || !this.keeperKeypair) return null;
    try {
      const lamports = Math.round(totalAssetsUsd * 1_000_000);
      const sig: string = await this.program.methods["updateNav"](new BN(lamports))
        .accounts({ keeper: this.keeperKeypair.publicKey, vault: this.vaultPda })
        .signers([this.keeperKeypair])
        .rpc();
      this.lastNavTx = sig;
      this.lastNavAt = Date.now();
      return sig;
    } catch (e) {
      log.warn({ err: String(e) }, "updateNav failed");
      return null;
    }
  }

  /** Idle USDC physically held by the vault account (= deposits + minted yield − withdrawals). */
  async getIdleBalance(): Promise<number> {
    if (!this.vaultUsdcAccount) return 0;
    try {
      const tokenAcct = await getAccount(this.connection, this.vaultUsdcAccount);
      return Number(tokenAcct.amount) / 1_000_000;
    } catch {
      return 0;
    }
  }

  async getKeeperUsdcBalance(): Promise<number> {
    if (!this.keeperKeypair || !this.usdcMintPk) return 0;
    try {
      const ata = getAssociatedTokenAddressSync(this.usdcMintPk, this.keeperKeypair.publicKey);
      const acct = await getAccount(this.connection, ata);
      return Number(acct.amount) / 1_000_000;
    } catch {
      return 0;
    }
  }

  async getSettlement(): Promise<SettlementInfo> {
    const snap = await this.getSnapshot();
    const vaultUsdcBalance = await this.getIdleBalance();
    return {
      lastNavTx: this.lastNavTx,
      lastNavAt: this.lastNavAt,
      onChainTvl: snap.tvl,
      vaultUsdcBalance,
      totalShares: snap.totalShares,
      navPerShare: snap.navPerShare,
      totalYieldMinted: this.totalYieldMinted,
    };
  }
}
