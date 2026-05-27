import { Position, Venue } from "../venues/index";
import { RankedOpportunity } from "../strategy/ranker";
import { SpreadOpportunity } from "../registry/funding-registry";
import { RISK } from "@basis/shared";

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

export class RiskEngine {
  evaluateEntry(opp: RankedOpportunity, ctx: RiskContext): RiskState {
    const reasons: string[] = [];

    if (ctx.vaultTvl <= 0) reasons.push("vault TVL is zero");

    const longHealth = ctx.venueHealth[opp.longVenue];
    if (!longHealth?.ok) reasons.push(`long venue ${opp.longVenue} is unhealthy`);

    const shortHealth = ctx.venueHealth[opp.shortVenue];
    if (!shortHealth?.ok) reasons.push(`short venue ${opp.shortVenue} is unhealthy`);

    const drawdown = this._rollingDrawdown(ctx.navHistory);
    if (drawdown > RISK.DRAWDOWN_STOP) {
      reasons.push(`drawdown ${(drawdown * 100).toFixed(2)}% > stop ${RISK.DRAWDOWN_STOP * 100}%`);
    }

    return { shouldEnter: reasons.length === 0, shouldUnwind: false, reasons };
  }

  evaluateHold(ctx: RiskContext): RiskState {
    const reasons: string[] = [];
    const now = Date.now();

    for (const pos of ctx.positions) {
      if (pos.marginRatio < RISK.MARGIN_FLOOR) {
        reasons.push(`${pos.venue} margin ratio ${pos.marginRatio.toFixed(2)} < floor ${RISK.MARGIN_FLOOR}`);
      }
    }

    const drawdown = this._rollingDrawdown(ctx.navHistory);
    if (drawdown > RISK.DRAWDOWN_STOP) {
      reasons.push(`drawdown ${(drawdown * 100).toFixed(2)}% > stop ${RISK.DRAWDOWN_STOP * 100}%`);
    }

    for (const [venue, health] of Object.entries(ctx.venueHealth) as [Venue, { ok: boolean; lastSeen: number }][]) {
      if (!health.ok && now - health.lastSeen > 60_000) {
        reasons.push(`venue ${venue} health failed for >60s`);
      }
    }

    return {
      shouldEnter: false,
      shouldUnwind: reasons.length > 0,
      reasons,
    };
  }

  evaluateExit(positions: Position[], spread: SpreadOpportunity): boolean {
    const longPos = positions.find(
      (p) => p.venue === spread.longVenue && p.side === "long",
    );
    const shortPos = positions.find(
      (p) => p.venue === spread.shortVenue && p.side === "short",
    );

    if (!longPos || !shortPos) return false;

    // Exit if spread inverted (sign flip)
    if (spread.spreadAnnualizedPct < 0) return true;

    return false;
  }

  private _rollingDrawdown(
    navHistory: { timestamp: number; navPerShare: number }[],
  ): number {
    if (navHistory.length === 0) return 0;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const window = navHistory.filter((h) => h.timestamp >= cutoff);
    if (window.length === 0) return 0;

    const peak = Math.max(...window.map((h) => h.navPerShare));
    const current = window[window.length - 1]!.navPerShare;
    if (peak === 0) return 0;
    return Math.max(0, (peak - current) / peak);
  }
}
