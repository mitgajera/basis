import {
  FundingRateInfo,
  OrderResult,
  PlaceOrderParams,
  Position,
  Venue,
  VenueAdapter,
} from "../index";

// Jupiter Perps fallback adapter — used when USE_FALLBACK_VENUES=true
// Funding model: pool utilization-based (hourly rate from program state)
export class JupiterAdapter implements VenueAdapter {
  readonly venue: Venue = "jupiter";

  async init(): Promise<void> {
    throw new Error("JupiterAdapter not yet implemented; see Jupiter Perps TS API");
  }

  async shutdown(): Promise<void> {}

  async health(): Promise<{ ok: boolean; latencyMs: number; reason?: string }> {
    return { ok: false, latencyMs: 0, reason: "JupiterAdapter not yet implemented" };
  }

  async getFundingRate(_asset: string): Promise<FundingRateInfo> {
    throw new Error("JupiterAdapter not yet implemented");
  }

  async getMarkPrice(_asset: string): Promise<number> {
    throw new Error("JupiterAdapter not yet implemented");
  }

  async getPositions(): Promise<Position[]> {
    throw new Error("JupiterAdapter not yet implemented");
  }

  async getCollateralBalance(): Promise<number> {
    throw new Error("JupiterAdapter not yet implemented");
  }

  subscribeFunding(_asset: string, _cb: (info: FundingRateInfo) => void): () => void {
    throw new Error("JupiterAdapter not yet implemented");
  }

  subscribeMarkPrice(_asset: string, _cb: (price: number) => void): () => void {
    throw new Error("JupiterAdapter not yet implemented");
  }

  async placeOrder(_params: PlaceOrderParams): Promise<OrderResult> {
    throw new Error("JupiterAdapter not yet implemented");
  }

  async closePosition(_asset: string): Promise<OrderResult> {
    throw new Error("JupiterAdapter not yet implemented");
  }
}
