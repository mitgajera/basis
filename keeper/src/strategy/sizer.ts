import { Venue } from "../venues/index";
import { RankedOpportunity } from "./ranker";
import { RISK, STRATEGY } from "@basis/shared";

export interface SizerConfig {
  maxPositionPct: number;
  maxVenuePct: number;
  maxLeverage: number;
  kellyMaxFraction: number;
}

export const DEFAULT_SIZER_CONFIG: SizerConfig = {
  maxPositionPct: RISK.MAX_POSITION_PCT,
  maxVenuePct: RISK.MAX_VENUE_PCT,
  maxLeverage: RISK.MAX_LEVERAGE,
  kellyMaxFraction: STRATEGY.KELLY_MAX_FRACTION,
};

export interface SizerContext {
  vaultTvl: number;
  currentPositionsUsd: number;
  currentVenueExposure: Record<Venue, number>;
  availableMarginPerVenue: Record<Venue, number>;
}

export function sizePosition(
  opp: RankedOpportunity,
  ctx: SizerContext,
  config: SizerConfig,
): number {
  const positionCap = ctx.vaultTvl * config.maxPositionPct;

  const longExposure = ctx.currentVenueExposure[opp.longVenue] ?? 0;
  const shortExposure = ctx.currentVenueExposure[opp.shortVenue] ?? 0;
  const venueLongCap = Math.max(0, ctx.vaultTvl * config.maxVenuePct - longExposure);
  const venueShortCap = Math.max(0, ctx.vaultTvl * config.maxVenuePct - shortExposure);

  const marginLong = (ctx.availableMarginPerVenue[opp.longVenue] ?? 0) * config.maxLeverage;
  const marginShort = (ctx.availableMarginPerVenue[opp.shortVenue] ?? 0) * config.maxLeverage;
  const budgetCap = ctx.vaultTvl - ctx.currentPositionsUsd;

  const rawSize = Math.min(
    positionCap,
    venueLongCap,
    venueShortCap,
    marginLong,
    marginShort,
    budgetCap,
  );

  // Kelly fraction: expected return per dollar held for the persistence window,
  // clamped to kellyMaxFraction. Using spread/100/365*168h avoids the score/TVL
  // normalization which collapses to near-zero for realistic spread magnitudes.
  const kellyFraction = Math.min(
    Math.max(opp.spreadAnnualizedPct / 200, 0),
    config.kellyMaxFraction,
  );

  return rawSize * kellyFraction;
}
