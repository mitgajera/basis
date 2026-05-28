import pino from "pino";
import { loadConfig } from "./config";
import { BackpackAdapter } from "./venues/backpack";
import { PacificaAdapter } from "./venues/pacifica";
import { PhoenixAdapter } from "./venues/phoenix";
import { DriftAdapter } from "./venues/fallback/drift";
import { JupiterAdapter } from "./venues/fallback/jupiter";
import { VenueAdapter, Venue } from "./venues/index";
import { FundingRegistry } from "./registry/funding-registry";
import { Logger } from "./logger/sqlite";
import { RiskEngine } from "./risk/engine";
import { VaultClient } from "./vault/vault-client";
import { Reconciler } from "./executor/reconciler";
import { SimulatedExecutor } from "./executor/simulated-executor";
import { rankOpportunity, DEFAULT_RANKER_CONFIG } from "./strategy/ranker";
import { sizePosition, DEFAULT_SIZER_CONFIG } from "./strategy/sizer";
import { createApi } from "./api/server";
import { computeNav } from "./vault/compute-nav";
import { navPerShare } from "@basis/shared";
import { STRATEGY, VAULT, RISK } from "@basis/shared";

const log = pino({ transport: { target: "pino-pretty" } });

async function main() {
  const config = loadConfig();
  log.info({ LIVE_TRADING: config.LIVE_TRADING, USE_FALLBACK_VENUES: config.USE_FALLBACK_VENUES }, "starting keeper");

  // Init venue adapters
  const venueList: VenueAdapter[] = [
    new BackpackAdapter(config),
    config.USE_FALLBACK_VENUES ? new DriftAdapter() : new PacificaAdapter(config),
    config.USE_FALLBACK_VENUES ? new JupiterAdapter() : new PhoenixAdapter(config),
  ];

  // Init adapters, skip those that throw (stub adapters)
  const adapters = new Map<Venue, VenueAdapter>();
  for (const v of venueList) {
    try {
      await v.init();
      adapters.set(v.venue, v);
      log.info({ venue: v.venue }, "venue initialized");
    } catch (e) {
      log.warn({ venue: v.venue, err: String(e) }, "venue init failed; skipping");
    }
  }

  const registry = new FundingRegistry();
  const logger = new Logger(config.LOG_DB_PATH);
  const risk = new RiskEngine();
  const vault = new VaultClient(config);
  const reconciler = new Reconciler(adapters, logger);
  const executor = new SimulatedExecutor(adapters, logger);

  // Subscribe live funding data from initialized adapters
  for (const adapter of adapters.values()) {
    adapter.subscribeFunding("SOL-PERP", (info) => {
      registry.upsert(info);
      logger.logFunding(info);
    });
  }

  const venueHealthMap: Record<string, { ok: boolean; lastSeen: number }> = {};
  for (const v of adapters.keys()) {
    venueHealthMap[v] = { ok: true, lastSeen: Date.now() };
  }

  // Strategy loop
  setInterval(async () => {
    try {
      const spreads = registry.pairwiseSpreads("SOL-PERP");
      const snapshot = await vault.getSnapshot();
      const navHistory = logger.getNavHistory(7 * 24 * 60 * 60 * 1000);

      // Update venue health
      for (const [venue, adapter] of adapters.entries()) {
        const h = await adapter.health().catch(() => ({ ok: false, latencyMs: 0 }));
        venueHealthMap[venue] = { ok: h.ok, lastSeen: h.ok ? Date.now() : (venueHealthMap[venue]?.lastSeen ?? 0) };
      }

      const riskCtx = {
        vaultTvl: snapshot.tvl || 1000,
        navHistory,
        positions: executor.openPositions,
        venueHealth: venueHealthMap as Record<Venue, { ok: boolean; lastSeen: number }>,
      };

      // Hold/exit check first
      const hold = risk.evaluateHold(riskCtx);
      if (hold.shouldUnwind) {
        log.warn({ reasons: hold.reasons }, "risk: unwinding all positions");
        await executor.closeAll();
      }

      // Entry checks
      for (const spread of spreads) {
        logger.logSpread(spread);
        const prelimSize = Math.max(riskCtx.vaultTvl * STRATEGY.KELLY_MAX_FRACTION, STRATEGY.MIN_TRADE_USD);
        const ranked = rankOpportunity(spread, prelimSize, DEFAULT_RANKER_CONFIG);

        if (!ranked.meetsThreshold) {
          log.debug({ reason: ranked.rejectionReason }, "spread rejected");
          continue;
        }

        const entry = risk.evaluateEntry(ranked, riskCtx);
        if (!entry.shouldEnter) {
          log.debug({ reasons: entry.reasons }, "entry blocked by risk");
          continue;
        }

        const venueExposure: Record<Venue, number> = {} as Record<Venue, number>;
        const marginPerVenue: Record<Venue, number> = {} as Record<Venue, number>;
        for (const v of adapters.keys()) {
          venueExposure[v] = 0;
          marginPerVenue[v] = riskCtx.vaultTvl * RISK.MAX_VENUE_PCT;
        }

        const size = sizePosition(ranked, {
          vaultTvl: riskCtx.vaultTvl,
          currentPositionsUsd: executor.openPositions.reduce((s, p) => s + p.notionalUsd, 0),
          currentVenueExposure: venueExposure,
          availableMarginPerVenue: marginPerVenue,
        }, DEFAULT_SIZER_CONFIG);

        if (size < STRATEGY.MIN_TRADE_USD) {
          log.debug({ size }, "size too small");
          continue;
        }

        await executor.openSpread(ranked, size);
      }

      // Update simulated PnL with elapsed funding
      const fundingByVenue = new Map<Venue, number>();
      for (const [v] of adapters.entries()) {
        const info = registry.get(v, "SOL-PERP");
        if (info) fundingByVenue.set(v, info.hourlyRate);
      }
      executor.updateUnrealizedPnl(fundingByVenue, STRATEGY.LOOP_INTERVAL_MS / 3_600_000);

    } catch (e) {
      logger.logEvent("error", "strategy_loop_failed", e);
    }
  }, STRATEGY.LOOP_INTERVAL_MS);

  // NAV update loop
  setInterval(async () => {
    try {
      const breakdown = await computeNav(vault, adapters, executor.openPositions);
      const totalAssetsUsd = breakdown.total;

      // Guard: skip update if delta > 4% of last known TVL (likely bad data)
      const lastSnapshot = await vault.getSnapshot();
      const lastTvl = lastSnapshot.tvl || totalAssetsUsd;
      const deltaPct = lastTvl > 0 ? Math.abs(totalAssetsUsd - lastTvl) / lastTvl : 0;
      if (deltaPct > 0.04 && lastTvl > 0) {
        log.warn({ deltaPct: (deltaPct * 100).toFixed(2), totalAssetsUsd, lastTvl }, "NAV delta >4% — skipping on-chain update");
        logger.logEvent("high", "nav_delta_guard_triggered", { deltaPct, totalAssetsUsd, lastTvl });
        return;
      }

      const totalSharesRaw = lastSnapshot.totalShares;
      const nav = navPerShare(totalAssetsUsd, totalSharesRaw / 1_000_000);
      logger.logNav({ totalAssetsUsd, totalShares: totalSharesRaw / 1_000_000, navPerShare: nav });

      // Push to on-chain vault (no-op if VAULT_PROGRAM_ID not set or IDL not built)
      await vault.updateNav(totalAssetsUsd);

      log.debug({ vaultUsdc: breakdown.vaultUsdc, venueCollateral: breakdown.venueCollateral, unrealizedPnl: breakdown.unrealizedPnl, nav: nav.toFixed(6) }, "NAV updated");
    } catch (e) {
      logger.logEvent("error", "nav_update_failed", e);
    }
  }, VAULT.NAV_UPDATE_INTERVAL_MS);

  // HTTP API
  const api = createApi(registry, logger, vault, config.DASHBOARD_ORIGIN);
  api.listen(config.API_PORT, () => {
    log.info({ port: config.API_PORT }, "API server listening");
  });

  process.on("SIGINT", async () => {
    log.info("shutting down");
    for (const v of adapters.values()) await v.shutdown().catch(() => {});
    logger.close();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
