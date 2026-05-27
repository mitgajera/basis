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

export interface SpreadOpportunity {
  asset: string;
  longVenue: Venue;
  shortVenue: Venue;
  spreadAnnualizedPct: number;
  longRate: number;
  shortRate: number;
  computedAt: number;
}

export interface RankedOpportunity extends SpreadOpportunity {
  expectedDailyPnlPerDollar: number;
  breakEvenHoldHours: number;
  score: number;
  meetsThreshold: boolean;
  rejectionReason?: string;
}

export interface RankerConfig {
  feesInBps: number;
  feesOutBps: number;
  slippageBps: number;
  exchangeRiskPremiumBps: number;
  expectedPersistenceHours: number;
  minScoreThreshold: number;
}

export interface SizerConfig {
  maxPositionPct: number;
  maxVenuePct: number;
  maxLeverage: number;
  kellyMaxFraction: number;
}

export interface SizerContext {
  vaultTvl: number;
  currentPositionsUsd: number;
  currentVenueExposure: Record<Venue, number>;
  availableMarginPerVenue: Record<Venue, number>;
}

export interface RiskContext {
  vaultTvl: number;
  navHistory: { timestamp: number; navPerShare: number }[];
  positions: Position[];
  venueHealth: Record<Venue, { ok: boolean; lastSeen: number }>;
}

export interface RiskState {
  shouldEnter: boolean;
  shouldUnwind: boolean;
  reasons: string[];
}

export interface ExecutionResult {
  success: boolean;
  positions: Position[];
  fills: OrderResult[];
  reconciled: boolean;
  reasons: string[];
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
