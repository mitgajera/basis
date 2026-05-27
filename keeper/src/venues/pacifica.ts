import {
  FundingRateInfo,
  OrderResult,
  PlaceOrderParams,
  Position,
  Venue,
  VenueAdapter,
} from "./index";

// Pacifica SDK is pending access grant. All methods throw until SDK is available.
// Replace stubs once whitelisted: https://pacifica.fi
export class PacificaAdapter implements VenueAdapter {
  readonly venue: Venue = "pacifica";

  async init(): Promise<void> {
    throw new Error("Pacifica SDK not yet available; pending access grant");
  }

  async shutdown(): Promise<void> {}

  async health(): Promise<{ ok: boolean; latencyMs: number; reason?: string }> {
    return { ok: false, latencyMs: 0, reason: "Pacifica SDK not yet available" };
  }

  async getFundingRate(_asset: string): Promise<FundingRateInfo> {
    throw new Error("Pacifica SDK not yet available; pending access grant");
  }

  async getMarkPrice(_asset: string): Promise<number> {
    throw new Error("Pacifica SDK not yet available; pending access grant");
  }

  async getPositions(): Promise<Position[]> {
    throw new Error("Pacifica SDK not yet available; pending access grant");
  }

  async getCollateralBalance(): Promise<number> {
    throw new Error("Pacifica SDK not yet available; pending access grant");
  }

  subscribeFunding(_asset: string, _cb: (info: FundingRateInfo) => void): () => void {
    throw new Error("Pacifica SDK not yet available; pending access grant");
  }

  subscribeMarkPrice(_asset: string, _cb: (price: number) => void): () => void {
    throw new Error("Pacifica SDK not yet available; pending access grant");
  }

  async placeOrder(_params: PlaceOrderParams): Promise<OrderResult> {
    throw new Error("Pacifica SDK not yet available; pending access grant");
  }

  async closePosition(_asset: string): Promise<OrderResult> {
    throw new Error("Pacifica SDK not yet available; pending access grant");
  }
}
