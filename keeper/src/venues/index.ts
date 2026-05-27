export type Venue = "pacifica" | "phoenix" | "backpack" | "drift" | "jupiter";

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
