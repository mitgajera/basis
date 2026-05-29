import { PublicKey } from "@solana/web3.js";
import {
  FundingRateInfo,
  OrderResult,
  PlaceOrderParams,
  Position,
  Venue,
  VenueAdapter,
} from "../index";
import { hourlyToAnnualizedPct } from "../../strategy/normalize";

// Drift v2 — read funding rates directly from on-chain perp market accounts.
// Their REST API requires auth; the Solana public RPC is freely accessible.
const SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const PYTH_HERMES = "https://hermes.pyth.network/v2/updates/price/latest";
const DRIFT_PROGRAM = new PublicKey("dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH");

// Drift v2 PerpMarket account layout byte offsets (Anchor borsh serialization):
//   [0..8]   discriminator
//   [8..40]  pubkey (Pubkey)
//   [40..]   amm: AMM struct
// Inside AMM (starting at byte 40):
//   oracle(32) + historical_oracle_data(48) + base_asset_amount_per_lp(16) +
//   quote_asset_amount_per_lp(16) + fee_pool(24) +
//   base_asset_reserve(16) + quote_asset_reserve(16) + concentration_coef(16) +
//   min_base_asset_reserve(16) + max_base_asset_reserve(16) + sqrt_k(16) +
//   peg_multiplier(16) + terminal_quote_asset_reserve(16) +
//   net_base_asset_amount(16) + quote_asset_amount(16) +
//   quote_entry_amount_long(16) + quote_entry_amount_short(16) +
//   quote_break_even_amount_long(16) + quote_break_even_amount_short(16) +
//   user_lp_shares(16)
//   → last_funding_rate: i64 at offset 416
//   ...then last_funding_rate_long(8) + last_funding_rate_short(8) +
//      last_funding_rate_ts(8) + funding_period(8) + order_step_size(8) +
//      order_tick_size(8) + min_order_size(8) + max_position_size(8) +
//      volume24h(16) + long_spread(4) + short_spread(4) + max_spread(4) + base_spread(4) +
//      last_bid_price_twap(8) + last_ask_price_twap(8)
//   → last_mark_price_twap: u64 at offset 536
//   PRICE_PRECISION = 1e6,  FUNDING_RATE_PRECISION = 1e9
const FUNDING_RATE_OFFSET = 416;
const MARK_PRICE_TWAP_OFFSET = 536;
const FUNDING_RATE_PRECISION = 1e9;
const PRICE_PRECISION = 1e6;

const MARKET_INDEX: Record<string, number> = {
  "SOL-PERP": 0,
  "BTC-PERP": 1,
  "ETH-PERP": 2,
};

// Pyth price feed IDs for index prices
const PYTH_FEED: Record<string, string> = {
  "SOL-PERP": "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  "BTC-PERP": "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  "ETH-PERP": "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
};

export class DriftAdapter implements VenueAdapter {
  readonly venue: Venue = "drift";

  private latestFunding = new Map<string, FundingRateInfo>();
  private fundingCallbacks = new Map<string, Set<(info: FundingRateInfo) => void>>();
  private markPriceCallbacks = new Map<string, Set<(price: number) => void>>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private marketPdas = new Map<string, string>();

  async init(): Promise<void> {
    // Pre-compute PDAs for all tracked assets
    for (const [asset, idx] of Object.entries(MARKET_INDEX)) {
      const idxBuf = Buffer.alloc(2);
      idxBuf.writeUInt16LE(idx, 0);
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("perp_market"), idxBuf],
        DRIFT_PROGRAM,
      );
      this.marketPdas.set(asset, pda.toBase58());
    }

    // Verify connectivity and fetch initial data
    await this.getFundingRate("SOL-PERP");

    this.pollTimer = setInterval(() => {
      for (const asset of Object.keys(MARKET_INDEX)) {
        this.getFundingRate(asset).catch(() => {});
      }
    }, 30_000);
  }

  async shutdown(): Promise<void> {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  async health(): Promise<{ ok: boolean; latencyMs: number; reason?: string }> {
    const t0 = Date.now();
    try {
      const res = await fetch(SOLANA_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      });
      const latencyMs = Date.now() - t0;
      if (!res.ok) return { ok: false, latencyMs, reason: `RPC HTTP ${res.status}` };
      return { ok: true, latencyMs };
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - t0, reason: String(e) };
    }
  }

  async getFundingRate(asset: string): Promise<FundingRateInfo> {
    const pda = this.marketPdas.get(asset);
    if (!pda) throw new Error(`Drift: no PDA for ${asset}`);

    // Fetch on-chain account and Pyth price in parallel
    const [acctRes, pythRes] = await Promise.all([
      fetch(SOLANA_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getAccountInfo",
          params: [pda, { encoding: "base64" }],
        }),
      }),
      fetch(`${PYTH_HERMES}?ids[]=${PYTH_FEED[asset]}`).catch(() => null),
    ]);

    if (!acctRes.ok) throw new Error(`Drift RPC call failed: ${acctRes.status}`);

    const acctBody = (await acctRes.json()) as {
      result?: { value?: { data: [string, string] } };
    };

    const rawB64 = acctBody.result?.value?.data?.[0];
    if (!rawB64) throw new Error(`Drift: no account data for ${asset}`);

    const buf = Buffer.from(rawB64, "base64");

    // Read i64 little-endian at FUNDING_RATE_OFFSET
    const fundingRateRaw = buf.readBigInt64LE(FUNDING_RATE_OFFSET);
    const hourlyRate = Number(fundingRateRaw) / FUNDING_RATE_PRECISION;

    // Read u64 little-endian at MARK_PRICE_TWAP_OFFSET
    const markRaw = buf.readBigUInt64LE(MARK_PRICE_TWAP_OFFSET);
    const markPrice = Number(markRaw) / PRICE_PRECISION;

    // Oracle/index price from Pyth
    let indexPrice = markPrice;
    if (pythRes?.ok) {
      try {
        const pb = (await pythRes.json()) as {
          parsed?: Array<{ price?: { price: string; expo: number } }>;
        };
        const p = pb.parsed?.[0]?.price;
        if (p) indexPrice = parseFloat(p.price) * Math.pow(10, p.expo);
      } catch { /* use markPrice as fallback */ }
    }

    // Sanity check: funding rate must be plausible (< 5% per hour absolute)
    if (Math.abs(hourlyRate) > 0.05) {
      throw new Error(`Drift: suspicious fundingRate ${hourlyRate} for ${asset} — offset may be wrong`);
    }

    const info: FundingRateInfo = {
      venue: "drift",
      asset,
      hourlyRate,
      annualizedPct: hourlyToAnnualizedPct(hourlyRate),
      nextFundingTimestamp: Math.floor(Date.now() / 1000) + 3600,
      markPrice: markPrice > 0 ? markPrice : indexPrice,
      indexPrice,
      lastUpdated: Date.now(),
    };

    this.latestFunding.set(asset, info);
    for (const cb of this.fundingCallbacks.get(asset) ?? []) cb(info);
    return info;
  }

  async getMarkPrice(asset: string): Promise<number> {
    const info = await this.getFundingRate(asset);
    return info.markPrice;
  }

  async getPositions(): Promise<Position[]> { return []; }
  async getCollateralBalance(): Promise<number> { return 0; }

  subscribeFunding(asset: string, cb: (info: FundingRateInfo) => void): () => void {
    if (!this.fundingCallbacks.has(asset)) this.fundingCallbacks.set(asset, new Set());
    this.fundingCallbacks.get(asset)!.add(cb);
    const latest = this.latestFunding.get(asset);
    if (latest) cb(latest);
    return () => this.fundingCallbacks.get(asset)?.delete(cb);
  }

  subscribeMarkPrice(asset: string, cb: (price: number) => void): () => void {
    if (!this.markPriceCallbacks.has(asset)) this.markPriceCallbacks.set(asset, new Set());
    this.markPriceCallbacks.get(asset)!.add(cb);
    return () => this.markPriceCallbacks.get(asset)?.delete(cb);
  }

  async placeOrder(_params: PlaceOrderParams): Promise<OrderResult> {
    throw new Error("Drift placeOrder: requires authenticated session");
  }

  async closePosition(_asset: string): Promise<OrderResult> {
    throw new Error("Drift closePosition: requires authenticated session");
  }
}
