import {
  FundingRateInfo,
  OrderResult,
  PlaceOrderParams,
  Position,
  Venue,
  VenueAdapter,
} from "./index";
import { hourlyToAnnualizedPct } from "../strategy/normalize";

// Hyperliquid public REST API — no auth required for market data.
// POST /info with typed request bodies; no GET endpoints.
const HL_API = "https://api.hyperliquid.xyz/info";

const ASSET_NAME: Record<string, string> = {
  "SOL-PERP":  "SOL",
  "BTC-PERP":  "BTC",
  "ETH-PERP":  "ETH",
  "HYPE-PERP": "HYPE",
  "SUI-PERP":  "SUI",
  "DOGE-PERP": "DOGE",
};

async function hlPost<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(HL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Hyperliquid API ${res.status}`);
  return res.json() as Promise<T>;
}

export class HyperliquidAdapter implements VenueAdapter {
  readonly venue: Venue = "hyperliquid";

  private latestFunding = new Map<string, FundingRateInfo>();
  private fundingCallbacks = new Map<string, Set<(info: FundingRateInfo) => void>>();
  private markPriceCallbacks = new Map<string, Set<(price: number) => void>>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  // metaAndAssetCtxs returns universe + contexts in index-aligned arrays
  private assetIndex = new Map<string, number>();

  async init(): Promise<void> {
    await this._fetchAll();
    this.pollTimer = setInterval(() => this._fetchAll().catch(() => {}), 30_000);
  }

  async shutdown(): Promise<void> {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  async health(): Promise<{ ok: boolean; latencyMs: number; reason?: string }> {
    const t0 = Date.now();
    try {
      await hlPost({ type: "meta" });
      return { ok: true, latencyMs: Date.now() - t0 };
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - t0, reason: String(e) };
    }
  }

  async getFundingRate(asset: string): Promise<FundingRateInfo> {
    await this._fetchAll();
    const info = this.latestFunding.get(asset);
    if (!info) throw new Error(`Hyperliquid: no data for ${asset}`);
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
    throw new Error("Hyperliquid placeOrder: requires wallet signing");
  }

  async closePosition(_asset: string): Promise<OrderResult> {
    throw new Error("Hyperliquid closePosition: requires wallet signing");
  }

  // ── private ──────────────────────────────────────────────────────────────

  private async _fetchAll(): Promise<void> {
    // Single call returns all markets in one shot
    // Response: [meta, ctxs] where ctxs[i] aligns with meta.universe[i]
    const data = await hlPost<[
      { universe: Array<{ name: string }> },
      Array<{
        funding: string;
        markPx: string;
        oraclePx: string;
        prevDayPx: string;
        openInterest: string;
      }>
    ]>({ type: "metaAndAssetCtxs" });

    const [meta, ctxs] = data;

    // Build name → index map on first call
    if (this.assetIndex.size === 0) {
      meta.universe.forEach((u, i) => this.assetIndex.set(u.name, i));
    }

    for (const [basisAsset, hlName] of Object.entries(ASSET_NAME)) {
      const idx = this.assetIndex.get(hlName);
      if (idx === undefined) continue;
      const ctx = ctxs[idx];
      if (!ctx) continue;

      // funding = predicted 1h funding rate (hourly decimal, signed)
      const hourlyRate = parseFloat(ctx.funding);
      const markPrice = parseFloat(ctx.markPx);
      const indexPrice = parseFloat(ctx.oraclePx);

      const info: FundingRateInfo = {
        venue: "hyperliquid",
        asset: basisAsset,
        hourlyRate,
        annualizedPct: hourlyToAnnualizedPct(hourlyRate),
        nextFundingTimestamp: Math.floor(Date.now() / 1000) + 3600,
        markPrice,
        indexPrice,
        lastUpdated: Date.now(),
      };

      this.latestFunding.set(basisAsset, info);
      for (const cb of this.fundingCallbacks.get(basisAsset) ?? []) cb(info);
      for (const cb of this.markPriceCallbacks.get(basisAsset) ?? []) cb(markPrice);
    }
  }
}
