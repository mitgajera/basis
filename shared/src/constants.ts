export const RISK = {
  MAX_LEVERAGE: 1.5,
  MARGIN_FLOOR: 0.5,
  DRAWDOWN_STOP: 0.05,
  MAX_POSITION_PCT: 0.20,
  MAX_VENUE_PCT: 0.35,
  RECON_TIMEOUT_MS: 8000,
  MAX_RETRY_ATTEMPTS: 3,
} as const;

export const STRATEGY = {
  LOOP_INTERVAL_MS: 30_000,
  MIN_SPREAD_THRESHOLD_PCT: 5,
  EXPECTED_PERSISTENCE_HOURS: 12,
  MIN_TRADE_USD: 10,
  KELLY_MAX_FRACTION: 0.25,
} as const;

export const VAULT = {
  MAX_NAV_DELTA_BPS: 500,
  MIN_DEPOSIT: 1_000_000,
  NAV_UPDATE_INTERVAL_MS: 60_000,
} as const;

export const FEES_DEFAULTS = {
  feesInBps: 5,
  feesOutBps: 5,
  slippageBps: 10,
  exchangeRiskPremiumBps: 3,
} as const;
