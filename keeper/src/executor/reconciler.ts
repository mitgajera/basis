import pino from "pino";
import { OrderResult, PlaceOrderParams, Position, Venue, VenueAdapter } from "../venues/index";
import { Logger } from "../logger/sqlite";
import { RISK } from "@basis/shared";

const log = pino({ transport: { target: "pino-pretty" } });

export class Reconciler {
  constructor(
    private adapters: Map<Venue, VenueAdapter>,
    private logger: Logger,
  ) {}

  async reconcilePartialFill(
    filledLeg: Position,
    failedLegParams: PlaceOrderParams,
    failedLegVenue: Venue,
    attemptCount: number = 0,
  ): Promise<void> {
    const adapter = this.adapters.get(failedLegVenue);
    if (!adapter) {
      this._emergencyUnwind(filledLeg, "no adapter for failed leg venue");
      return;
    }

    if (attemptCount < RISK.MAX_RETRY_ATTEMPTS) {
      const extraSlippageBps = 25 * (attemptCount + 1);
      log.warn({ failedLegVenue, attempt: attemptCount + 1, extraSlippageBps }, "retrying failed leg");

      try {
        const result: OrderResult = await adapter.placeOrder(failedLegParams);
        if (result.status === "filled") {
          log.info({ failedLegVenue }, "failed leg recovered");
          return;
        }
        await this.reconcilePartialFill(filledLeg, failedLegParams, failedLegVenue, attemptCount + 1);
      } catch (e) {
        await this.reconcilePartialFill(filledLeg, failedLegParams, failedLegVenue, attemptCount + 1);
      }
    } else {
      this._emergencyUnwind(filledLeg, `failed leg after ${RISK.MAX_RETRY_ATTEMPTS} retries`);
    }
  }

  private async _emergencyUnwind(filledLeg: Position, reason: string): Promise<void> {
    log.error({ venue: filledLeg.venue, asset: filledLeg.asset, reason }, "EMERGENCY UNWIND");
    this.logger.logEvent("high", "emergency_unwind", { leg: filledLeg, reason });

    const adapter = this.adapters.get(filledLeg.venue);
    if (!adapter) {
      log.error({ venue: filledLeg.venue }, "CRITICAL: unwind also failed — no adapter");
      this.logger.logEvent("critical", "unwind_failed_no_adapter", { leg: filledLeg });
      return;
    }

    try {
      await adapter.closePosition(filledLeg.asset);
      log.info({ venue: filledLeg.venue }, "emergency unwind succeeded");
    } catch (e) {
      log.error({ err: e }, "CRITICAL: emergency unwind failed — manual intervention required");
      this.logger.logEvent("critical", "unwind_failed", { leg: filledLeg, error: String(e) });
    }
  }
}
