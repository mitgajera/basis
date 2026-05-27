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

export interface SpreadOpportunity {
  asset: string;
  longVenue: Venue;
  shortVenue: Venue;
  spreadAnnualizedPct: number;
  longRate: number;
  shortRate: number;
  computedAt: number;
}

export interface VaultSnapshot {
  tvl: number;
  totalShares: number;
  navPerShare: number;
  lastUpdated: number;
}

export interface Stats {
  apr24h: number;
  apr7d: number;
  uptimePct: number;
  totalTrades: number;
  winRate: number;
}
