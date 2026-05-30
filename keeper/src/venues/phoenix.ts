import { createPhoenixClient } from "@ellipsis-labs/rise";
import { Config } from "../config";
import {
  FundingRateInfo,
  OrderResult,
  PlaceOrderParams,
  Position,
  Venue,
  VenueAdapter,
} from "./index";
import { hourlyToAnnualizedPct } from "../strategy/normalize";

const PHOENIX_API_URL = "https://perp-api.phoenix.trade";
// Phoenix perpetuals use bare ticker symbols. Unlisted symbols throw "no data for"
// which the index.ts poller downgrades to debug, so it's safe to include hopefuls.
const ASSET_MAP: Record<string, string> = {
  "SOL-PERP": "SOL",
  "BTC-PERP": "BTC",
  "ETH-PERP": "ETH",
  "HYPE-PERP": "HYPE",
  "SUI-PERP": "SUI",
  "DOGE-PERP": "DOGE",
};

// Cache the funding overview — Phoenix's /getFundingOverview returns *all* symbols
// in one shot, so we'd otherwise refetch the same payload 6x per cycle.
const OVERVIEW_TTL_MS = 10_000;

type PhoenixSeries = Array<{
  symbol: string;
  points: Array<{ timestamp: number; fundingAmountPerUnit: string; markPrice: string; fundingRate: string }>;
}>;

export class PhoenixAdapter implements VenueAdapter {
  readonly venue: Venue = "phoenix";

  private client = createPhoenixClient({ apiUrl: PHOENIX_API_URL });
  private fundingCallbacks = new Map<string, Set<(info: FundingRateInfo) => void>>();
  private markPriceCallbacks = new Map<string, Set<(price: number) => void>>();
  private latestFunding = new Map<string, FundingRateInfo>();
  private overviewCache: { ts: number; series: PhoenixSeries } | null = null;
  private overviewInFlight: Promise<{ ts: number; series: PhoenixSeries }> | null = null;

  constructor(private _config: Config) {}

  async init(): Promise<void> {
    // Cache is filled lazily on first getFundingRate() call from the index.ts poller,
    // which already covers every asset on its 30s tick. No per-venue polling needed.
  }

  async shutdown(): Promise<void> {
    this.client.dispose?.();
  }

  async health(): Promise<{ ok: boolean; latencyMs: number; reason?: string }> {
    const t0 = Date.now();
    try {
      await this.client.api.exchange().getExchange();
      return { ok: true, latencyMs: Date.now() - t0 };
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - t0, reason: String(e) };
    }
  }

  private async _getOverviewSeries(): Promise<PhoenixSeries> {
    if (this.overviewCache && Date.now() - this.overviewCache.ts < OVERVIEW_TTL_MS) {
      return this.overviewCache.series;
    }
    if (this.overviewInFlight) return (await this.overviewInFlight).series;
    const p = (async () => {
      const overview = await this.client.api.funding().getFundingOverview();
      const series = (overview as { series?: PhoenixSeries }).series ?? [];
      const cache = { ts: Date.now(), series };
      this.overviewCache = cache;
      return cache;
    })();
    this.overviewInFlight = p;
    try {
      return (await p).series;
    } finally {
      this.overviewInFlight = null;
    }
  }

  async getFundingRate(asset: string): Promise<FundingRateInfo> {
    const symbol = this._toSymbol(asset);
    const series = await this._getOverviewSeries();
    const entry = series.find((s) => s.symbol === symbol);
    if (!entry || entry.points.length === 0) {
      throw new Error(`Phoenix getFundingRate: no data for ${symbol}`);
    }

    const latest = entry.points[entry.points.length - 1]!;
    const markPrice = parseFloat(latest.markPrice);
    const fundingAmountPerUnit = parseFloat(latest.fundingAmountPerUnit);

    // fundingAmountPerUnit = USDC paid per 1 base unit per 1h interval
    // divide by markPrice to get dimensionless hourly rate
    const hourlyRate = markPrice > 0 ? fundingAmountPerUnit / markPrice : 0;

    const info: FundingRateInfo = {
      venue: "phoenix",
      asset,
      hourlyRate,
      annualizedPct: hourlyToAnnualizedPct(hourlyRate),
      nextFundingTimestamp: latest.timestamp + 3600,
      markPrice,
      indexPrice: markPrice, // Phoenix doesn't separate index in this endpoint
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

  async getPositions(): Promise<Position[]> {
    // Requires authenticated trader state; returns empty in read-only/sim mode
    return [];
  }

  async getCollateralBalance(): Promise<number> {
    return 0;
  }

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
    throw new Error("Phoenix placeOrder: requires authenticated session (not in simulation mode)");
  }

  async closePosition(_asset: string): Promise<OrderResult> {
    throw new Error("Phoenix closePosition: requires authenticated session (not in simulation mode)");
  }

  private _toSymbol(asset: string): string {
    return ASSET_MAP[asset] ?? asset.replace("-PERP", "");
  }
}
