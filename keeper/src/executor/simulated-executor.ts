import { v4 as uuidv4 } from "uuid";
import pino from "pino";
import { OrderResult, Position, Venue, VenueAdapter } from "../venues/index";
import { RankedOpportunity } from "../strategy/ranker";
import { Logger } from "../logger/sqlite";
import { FEES_DEFAULTS } from "@basis/shared";

const log = pino({ transport: { target: "pino-pretty" } });

export interface SimulatedPosition extends Position {
  opportunityId: string;
  openedAt: number;
}

// SimulatedExecutor updates an in-memory position book against real funding rates.
// No real orders are placed. PnL = real funding × simulated notional - estimated fees.
export class SimulatedExecutor {
  private positions: SimulatedPosition[] = [];

  constructor(
    private adapters: Map<Venue, VenueAdapter>,
    private logger: Logger,
  ) {}

  get openPositions(): SimulatedPosition[] {
    return [...this.positions];
  }

  async openSpread(opp: RankedOpportunity, sizeUsd: number): Promise<void> {
    const opportunityId = uuidv4();
    const now = Date.now();

    const longPrice = await this.adapters.get(opp.longVenue)?.getMarkPrice(opp.asset) ?? 0;
    const shortPrice = await this.adapters.get(opp.shortVenue)?.getMarkPrice(opp.asset) ?? 0;

    // Simulate entry slippage + fees deducted from size
    const entryFeeMultiplier = 1 - (FEES_DEFAULTS.feesInBps + FEES_DEFAULTS.slippageBps) / 10_000;

    const longPos: SimulatedPosition = {
      opportunityId,
      venue: opp.longVenue,
      asset: opp.asset,
      side: "long",
      size: (sizeUsd * entryFeeMultiplier) / (longPrice || 1),
      notionalUsd: sizeUsd * entryFeeMultiplier,
      entryPrice: longPrice,
      unrealizedPnl: 0,
      marginRatio: 1,
      openedAt: now,
    };

    const shortPos: SimulatedPosition = {
      opportunityId,
      venue: opp.shortVenue,
      asset: opp.asset,
      side: "short",
      size: (sizeUsd * entryFeeMultiplier) / (shortPrice || 1),
      notionalUsd: sizeUsd * entryFeeMultiplier,
      entryPrice: shortPrice,
      unrealizedPnl: 0,
      marginRatio: 1,
      openedAt: now,
    };

    this.positions.push(longPos, shortPos);

    log.info(
      {
        opportunityId,
        longVenue: opp.longVenue,
        shortVenue: opp.shortVenue,
        sizeUsd: sizeUsd.toFixed(2),
        spreadPct: opp.spreadAnnualizedPct.toFixed(2),
      },
      "[SIM] opened spread",
    );

    this.logger.logEvent("info", "sim_open_spread", {
      opportunityId,
      longVenue: opp.longVenue,
      shortVenue: opp.shortVenue,
      sizeUsd,
    });
  }

  updateUnrealizedPnl(
    fundingByVenueAsset: Map<string, number>,
    elapsedHours: number,
  ): void {
    for (const pos of this.positions) {
      const hourlyRate = fundingByVenueAsset.get(`${pos.venue}:${pos.asset}`) ?? 0;
      // Long: pays funding if positive rate; earns if negative
      // Short: earns funding if positive rate; pays if negative
      const sign = pos.side === "short" ? 1 : -1;
      pos.unrealizedPnl += sign * pos.notionalUsd * hourlyRate * elapsedHours;
    }
  }

  async closeSpread(opportunityId: string): Promise<void> {
    const toClose = this.positions.filter((p) => p.opportunityId === opportunityId);
    const exitFee = (FEES_DEFAULTS.feesOutBps + FEES_DEFAULTS.slippageBps) / 10_000;

    for (const pos of toClose) {
      const exitCost = pos.notionalUsd * exitFee;
      const realizedPnl = pos.unrealizedPnl - exitCost;
      log.info({ opportunityId, venue: pos.venue, side: pos.side, realizedPnl: realizedPnl.toFixed(4) }, "[SIM] closed leg");
      this.logger.logEvent("info", "sim_close_leg", { opportunityId, venue: pos.venue, side: pos.side, realizedPnl });
    }

    this.positions = this.positions.filter((p) => p.opportunityId !== opportunityId);
  }

  async closeAll(): Promise<void> {
    const ids = [...new Set(this.positions.map((p) => p.opportunityId))];
    for (const id of ids) await this.closeSpread(id);
  }
}
