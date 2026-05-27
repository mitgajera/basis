import { SpreadOpportunity } from "../registry/funding-registry";
import { STRATEGY, FEES_DEFAULTS } from "@basis/shared";

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

export const DEFAULT_RANKER_CONFIG: RankerConfig = {
  feesInBps: FEES_DEFAULTS.feesInBps,
  feesOutBps: FEES_DEFAULTS.feesOutBps,
  slippageBps: FEES_DEFAULTS.slippageBps,
  exchangeRiskPremiumBps: FEES_DEFAULTS.exchangeRiskPremiumBps,
  expectedPersistenceHours: STRATEGY.EXPECTED_PERSISTENCE_HOURS,
  minScoreThreshold: 0,
};

export function rankOpportunity(
  spread: SpreadOpportunity,
  positionSizeUsd: number,
  config: RankerConfig,
): RankedOpportunity {
  const expectedDailyPnlPerDollar = spread.spreadAnnualizedPct / 365 / 100;
  const expectedDailyPnl = positionSizeUsd * expectedDailyPnlPerDollar;

  const totalEntryCostBps =
    config.feesInBps +
    config.feesOutBps +
    2 * config.slippageBps +
    config.exchangeRiskPremiumBps;
  const totalEntryCostUsd = (positionSizeUsd * totalEntryCostBps) / 10_000;

  const dailyPnlPerHour = expectedDailyPnl / 24;
  const breakEvenHoldHours =
    dailyPnlPerHour > 0 ? totalEntryCostUsd / dailyPnlPerHour : Infinity;

  const expectedHoldDays = config.expectedPersistenceHours / 24;
  const score = expectedDailyPnl * expectedHoldDays - totalEntryCostUsd;

  const meetsThreshold =
    score > config.minScoreThreshold &&
    breakEvenHoldHours < 0.5 * config.expectedPersistenceHours &&
    spread.spreadAnnualizedPct > STRATEGY.MIN_SPREAD_THRESHOLD_PCT;

  let rejectionReason: string | undefined;
  if (!meetsThreshold) {
    if (spread.spreadAnnualizedPct <= STRATEGY.MIN_SPREAD_THRESHOLD_PCT) {
      rejectionReason = `spread ${spread.spreadAnnualizedPct.toFixed(2)}% < min ${STRATEGY.MIN_SPREAD_THRESHOLD_PCT}%`;
    } else if (breakEvenHoldHours >= 0.5 * config.expectedPersistenceHours) {
      rejectionReason = `break-even ${breakEvenHoldHours.toFixed(1)}h >= half persistence ${(0.5 * config.expectedPersistenceHours).toFixed(1)}h`;
    } else {
      rejectionReason = `score ${score.toFixed(4)} <= threshold ${config.minScoreThreshold}`;
    }
  }

  return {
    ...spread,
    expectedDailyPnlPerDollar,
    breakEvenHoldHours,
    score,
    meetsThreshold,
    rejectionReason,
  };
}
