import {
  FundingRateInfo,
  OrderResult,
  PlaceOrderParams,
  Position,
  Venue,
  VenueAdapter,
} from "../index";

// Drift fallback adapter — used when USE_FALLBACK_VENUES=true
// Requires: npm install @drift-labs/sdk
// Funding model: mark-vs-oracle off DLOB (cumulative; derive hourly from delta)
export class DriftAdapter implements VenueAdapter {
  readonly venue: Venue = "drift";

  async init(): Promise<void> {
    throw new Error("DriftAdapter not yet implemented; install @drift-labs/sdk and implement");
  }

  async shutdown(): Promise<void> {}

  async health(): Promise<{ ok: boolean; latencyMs: number; reason?: string }> {
    return { ok: false, latencyMs: 0, reason: "DriftAdapter not yet implemented" };
  }

  async getFundingRate(_asset: string): Promise<FundingRateInfo> {
    throw new Error("DriftAdapter not yet implemented");
  }

  async getMarkPrice(_asset: string): Promise<number> {
    throw new Error("DriftAdapter not yet implemented");
  }

  async getPositions(): Promise<Position[]> {
    throw new Error("DriftAdapter not yet implemented");
  }

  async getCollateralBalance(): Promise<number> {
    throw new Error("DriftAdapter not yet implemented");
  }

  subscribeFunding(_asset: string, _cb: (info: FundingRateInfo) => void): () => void {
    throw new Error("DriftAdapter not yet implemented");
  }

  subscribeMarkPrice(_asset: string, _cb: (price: number) => void): () => void {
    throw new Error("DriftAdapter not yet implemented");
  }

  async placeOrder(_params: PlaceOrderParams): Promise<OrderResult> {
    throw new Error("DriftAdapter not yet implemented");
  }

  async closePosition(_asset: string): Promise<OrderResult> {
    throw new Error("DriftAdapter not yet implemented");
  }
}
