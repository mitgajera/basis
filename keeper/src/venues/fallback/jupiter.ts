import {
  FundingRateInfo,
  OrderResult,
  PlaceOrderParams,
  Position,
  Venue,
  VenueAdapter,
} from "../index";
import { hourlyToAnnualizedPct } from "../../strategy/normalize";

// Jupiter Perpetuals public API
// Borrow rates are computed from pool utilization; longs & shorts both pay to JLP holders.
// We expose the long borrow rate as the "funding rate" — it's the hourly cost of a long.
const JUP_API = "https://api.jup.ag";

// Jupiter Perps custody mints for each asset
const CUSTODY_MINT: Record<string, string> = {
  "SOL-PERP": "So11111111111111111111111111111111111111112",
  "BTC-PERP": "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E",
  "ETH-PERP": "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
};

export class JupiterAdapter implements VenueAdapter {
  readonly venue: Venue = "jupiter";

  private latestFunding = new Map<string, FundingRateInfo>();
  private fundingCallbacks = new Map<string, Set<(info: FundingRateInfo) => void>>();
  private markPriceCallbacks = new Map<string, Set<(price: number) => void>>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  async init(): Promise<void> {
    await this.getFundingRate("SOL-PERP");
    this.pollTimer = setInterval(() => {
      for (const asset of Object.keys(CUSTODY_MINT)) {
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
      const res = await fetch(`${JUP_API}/price/v2?ids=${CUSTODY_MINT["SOL-PERP"]}`);
      const latencyMs = Date.now() - t0;
      if (!res.ok) return { ok: false, latencyMs, reason: `HTTP ${res.status}` };
      return { ok: true, latencyMs };
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - t0, reason: String(e) };
    }
  }

  async getFundingRate(asset: string): Promise<FundingRateInfo> {
    const mint = CUSTODY_MINT[asset];
    if (!mint) throw new Error(`Jupiter: unknown asset ${asset}`);

    // Fetch mark price and pool stats in parallel
    const [priceRes, poolRes] = await Promise.all([
      fetch(`${JUP_API}/price/v2?ids=${mint}`),
      fetch(`${JUP_API}/perps/v1/positions/stats`),
    ]);

    if (!priceRes.ok) throw new Error(`Jupiter price fetch failed: ${priceRes.status}`);

    const priceBody = (await priceRes.json()) as {
      data?: Record<string, { price: number }>;
    };
    const markPrice = priceBody.data?.[mint]?.price ?? 0;

    // Derive hourly borrow rate from pool stats if available
    let hourlyRate = 0;
    if (poolRes.ok) {
      try {
        const poolBody = (await poolRes.json()) as {
          stats?: Record<string, { hourlyBorrowRate?: number; borrowRate?: number }>;
        };
        const symbol = asset.replace("-PERP", "");
        const stat = poolBody.stats?.[symbol] ?? poolBody.stats?.[mint];
        hourlyRate = stat?.hourlyBorrowRate ?? stat?.borrowRate ?? 0;
      } catch {
        // non-fatal — use 0 if pool stats unavailable
      }
    }

    const info: FundingRateInfo = {
      venue: "jupiter",
      asset,
      hourlyRate,
      annualizedPct: hourlyToAnnualizedPct(hourlyRate),
      nextFundingTimestamp: Math.floor(Date.now() / 1000) + 3600,
      markPrice,
      indexPrice: markPrice,
      lastUpdated: Date.now(),
    };

    this.latestFunding.set(asset, info);
    for (const cb of this.fundingCallbacks.get(asset) ?? []) cb(info);
    return info;
  }

  async getMarkPrice(asset: string): Promise<number> {
    const mint = CUSTODY_MINT[asset];
    if (!mint) throw new Error(`Jupiter: unknown asset ${asset}`);
    const res = await fetch(`${JUP_API}/price/v2?ids=${mint}`);
    if (!res.ok) throw new Error(`Jupiter getMarkPrice failed: ${res.status}`);
    const body = (await res.json()) as { data?: Record<string, { price: number }> };
    return body.data?.[mint]?.price ?? 0;
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
    throw new Error("Jupiter placeOrder: requires on-chain signing");
  }

  async closePosition(_asset: string): Promise<OrderResult> {
    throw new Error("Jupiter closePosition: requires on-chain signing");
  }
}
