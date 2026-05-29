// Re-export VenueAdapter interface + associated types from shared where available;
// these local definitions remain the authoritative source for keeper-internal use.
export type Venue = "pacifica" | "phoenix" | "backpack" | "drift" | "jupiter" | "hyperliquid";

export interface FundingRateInfo {
  venue: Venue;
  asset: string;
  hourlyRate: number;
  annualizedPct: number;
  nextFundingTimestamp: number;
  markPrice: number;
  indexPrice: number;
  lastUpdated: number;
}

export interface Position {
  venue: Venue;
  asset: string;
  side: "long" | "short";
  size: number;
  notionalUsd: number;
  entryPrice: number;
  unrealizedPnl: number;
  marginRatio: number;
}

export interface PlaceOrderParams {
  asset: string;
  side: "long" | "short";
  sizeUsd: number;
  type: "market" | "limit";
  limitPrice?: number;
  reduceOnly?: boolean;
}

export interface OrderResult {
  orderId: string;
  filledSize: number;
  filledPrice: number;
  feeUsd: number;
  status: "filled" | "partial" | "failed";
}

export interface VenueAdapter {
  readonly venue: Venue;
  getFundingRate(asset: string): Promise<FundingRateInfo>;
  getMarkPrice(asset: string): Promise<number>;
  getPositions(): Promise<Position[]>;
  getCollateralBalance(): Promise<number>;
  subscribeFunding(asset: string, cb: (info: FundingRateInfo) => void): () => void;
  subscribeMarkPrice(asset: string, cb: (price: number) => void): () => void;
  placeOrder(params: PlaceOrderParams): Promise<OrderResult>;
  closePosition(asset: string): Promise<OrderResult>;
  init(): Promise<void>;
  shutdown(): Promise<void>;
  health(): Promise<{ ok: boolean; latencyMs: number; reason?: string }>;
}

// ── factory ──────────────────────────────────────────────────────────────────

import type { Config } from "../config";
import { BackpackAdapter } from "./backpack";
import { PhoenixAdapter } from "./phoenix";
import { PacificaAdapter } from "./pacifica";

/** Instantiate all enabled venue adapters from config. */
export function createVenueAdapters(config: Config): VenueAdapter[] {
  const adapters: VenueAdapter[] = [
    new BackpackAdapter(config),
    new PhoenixAdapter(config),
    new PacificaAdapter(config),
  ];
  return adapters;
}
