import {
  FundingRateInfo,
  OrderResult,
  PlaceOrderParams,
  Position,
  Venue,
  VenueAdapter,
} from "./index";

// Phoenix Perpetuals SDK is pending access grant. All methods throw until SDK is available.
// Replace stubs once whitelisted: https://ellipsis.finance
export class PhoenixAdapter implements VenueAdapter {
  readonly venue: Venue = "phoenix";

  async init(): Promise<void> {
    throw new Error("Phoenix SDK not yet available; pending access grant");
  }

  async shutdown(): Promise<void> {}

  async health(): Promise<{ ok: boolean; latencyMs: number; reason?: string }> {
    return { ok: false, latencyMs: 0, reason: "Phoenix SDK not yet available" };
  }

  async getFundingRate(_asset: string): Promise<FundingRateInfo> {
    throw new Error("Phoenix SDK not yet available; pending access grant");
  }

  async getMarkPrice(_asset: string): Promise<number> {
    throw new Error("Phoenix SDK not yet available; pending access grant");
  }

  async getPositions(): Promise<Position[]> {
    throw new Error("Phoenix SDK not yet available; pending access grant");
  }

  async getCollateralBalance(): Promise<number> {
    throw new Error("Phoenix SDK not yet available; pending access grant");
  }

  subscribeFunding(_asset: string, _cb: (info: FundingRateInfo) => void): () => void {
    throw new Error("Phoenix SDK not yet available; pending access grant");
  }

  subscribeMarkPrice(_asset: string, _cb: (price: number) => void): () => void {
    throw new Error("Phoenix SDK not yet available; pending access grant");
  }

  async placeOrder(_params: PlaceOrderParams): Promise<OrderResult> {
    throw new Error("Phoenix SDK not yet available; pending access grant");
  }

  async closePosition(_asset: string): Promise<OrderResult> {
    throw new Error("Phoenix SDK not yet available; pending access grant");
  }
}
