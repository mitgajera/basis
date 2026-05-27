import pino from "pino";
import { OrderResult, Position, Venue, VenueAdapter } from "../venues/index";
import { RankedOpportunity } from "../strategy/ranker";
import { Reconciler } from "./reconciler";
import { Logger } from "../logger/sqlite";
import { RISK } from "@basis/shared";
import { RiskEngine } from "../risk/engine";
import { v4 as uuidv4 } from "uuid";

const log = pino({ transport: { target: "pino-pretty" } });

export interface ExecutionResult {
  success: boolean;
  positions: Position[];
  fills: OrderResult[];
  reconciled: boolean;
  reasons: string[];
}

export class Executor {
  constructor(
    private adapters: Map<Venue, VenueAdapter>,
    private reconciler: Reconciler,
    private logger: Logger,
    private risk: RiskEngine,
  ) {}

  async openSpread(
    opp: RankedOpportunity,
    sizeUsd: number,
  ): Promise<ExecutionResult> {
    const longAdapter = this.adapters.get(opp.longVenue);
    const shortAdapter = this.adapters.get(opp.shortVenue);

    if (!longAdapter || !shortAdapter) {
      return { success: false, positions: [], fills: [], reconciled: false, reasons: ["adapter not found"] };
    }

    // Pre-flight health checks
    const [longHealth, shortHealth] = await Promise.all([
      longAdapter.health(),
      shortAdapter.health(),
    ]);
    if (!longHealth.ok || !shortHealth.ok) {
      return {
        success: false,
        positions: [],
        fills: [],
        reconciled: false,
        reasons: [
          !longHealth.ok ? `long venue ${opp.longVenue} unhealthy: ${longHealth.reason}` : "",
          !shortHealth.ok ? `short venue ${opp.shortVenue} unhealthy: ${shortHealth.reason}` : "",
        ].filter(Boolean),
      };
    }

    const opportunityId = uuidv4();
    log.info({ opportunityId, longVenue: opp.longVenue, shortVenue: opp.shortVenue, sizeUsd }, "opening spread");

    // Submit both legs in parallel
    const [longResult, shortResult] = await Promise.allSettled([
      longAdapter.placeOrder({ asset: opp.asset, side: "long", sizeUsd, type: "market" }),
      shortAdapter.placeOrder({ asset: opp.asset, side: "short", sizeUsd, type: "market" }),
    ]);

    const fills: OrderResult[] = [];
    const positions: Position[] = [];
    let reconciled = false;

    // Handle results
    if (longResult.status === "fulfilled" && shortResult.status === "fulfilled") {
      const longFill = longResult.value;
      const shortFill = shortResult.value;
      fills.push(longFill, shortFill);

      const bothFilled =
        longFill.status !== "failed" &&
        shortFill.status !== "failed" &&
        Math.abs(longFill.filledSize - shortFill.filledSize) / Math.max(longFill.filledSize, 1) <= 0.02;

      if (bothFilled) {
        log.info({ opportunityId }, "both legs filled");
        return { success: true, positions, fills, reconciled: false, reasons: [] };
      }

      // Partial fill — reconcile
      reconciled = true;
      const [filledLeg, failedSide] =
        longFill.filledSize >= shortFill.filledSize
          ? [{ venue: opp.longVenue, side: "long" as const, asset: opp.asset, size: longFill.filledSize, notionalUsd: sizeUsd, entryPrice: longFill.filledPrice, unrealizedPnl: 0, marginRatio: 1 }, opp.shortVenue]
          : [{ venue: opp.shortVenue, side: "short" as const, asset: opp.asset, size: shortFill.filledSize, notionalUsd: sizeUsd, entryPrice: shortFill.filledPrice, unrealizedPnl: 0, marginRatio: 1 }, opp.longVenue];

      await this.reconciler.reconcilePartialFill(
        filledLeg,
        { asset: opp.asset, side: filledLeg.side === "long" ? "short" : "long", sizeUsd, type: "market" },
        failedSide,
      );
    } else {
      const reason = longResult.status === "rejected" ? String(longResult.reason) : String((shortResult as PromiseRejectedResult).reason);
      log.error({ opportunityId, reason }, "legs failed to submit");
      return { success: false, positions, fills, reconciled: false, reasons: [reason] };
    }

    return { success: true, positions, fills, reconciled, reasons: [] };
  }

  async closeSpread(openPositions: Position[]): Promise<ExecutionResult> {
    const fills: OrderResult[] = [];
    const reasons: string[] = [];

    await Promise.all(
      openPositions.map(async (pos) => {
        const adapter = this.adapters.get(pos.venue);
        if (!adapter) {
          reasons.push(`no adapter for ${pos.venue}`);
          return;
        }
        try {
          const result = await adapter.closePosition(pos.asset);
          fills.push(result);
        } catch (e) {
          reasons.push(`close failed on ${pos.venue}: ${String(e)}`);
        }
      }),
    );

    return {
      success: reasons.length === 0,
      positions: [],
      fills,
      reconciled: false,
      reasons,
    };
  }
}
