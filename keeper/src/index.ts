import pino from "pino";
import { loadConfig } from "./config";
import { BackpackAdapter } from "./venues/backpack";
import { PacificaAdapter } from "./venues/pacifica";
import { PhoenixAdapter } from "./venues/phoenix";
import { HyperliquidAdapter } from "./venues/hyperliquid";
import { VenueAdapter, Venue } from "./venues/index";
import { FundingRegistry } from "./registry/funding-registry";
import { Logger } from "./logger/sqlite";
import { RiskEngine } from "./risk/engine";
import { VaultClient } from "./vault/vault-client";
import { SimulatedExecutor } from "./executor/simulated-executor";
import { rankOpportunity, DEFAULT_RANKER_CONFIG } from "./strategy/ranker";
import { sizePosition, DEFAULT_SIZER_CONFIG } from "./strategy/sizer";
import { createApi } from "./api/server";
import { STRATEGY, VAULT, RISK, TRACKED_ASSETS } from "@basis/shared";

const log = pino({ transport: { target: "pino-pretty" } });

async function main() {
  const config = loadConfig();
  log.info({ LIVE_TRADING: config.LIVE_TRADING }, "starting keeper");

  // Init venue adapters
  const venueList: VenueAdapter[] = [
    new BackpackAdapter(config),
    new PacificaAdapter(config),
    new PhoenixAdapter(config),
    new HyperliquidAdapter(),
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

  const executor = new SimulatedExecutor(adapters, logger);
  // Restore any positions left open from a previous run (survives keeper restarts)
  executor.rehydrate(logger.getOpenTrades());

  // Subscribe live funding data from initialized adapters
  for (const adapter of adapters.values()) {
    for (const asset of TRACKED_ASSETS) {
      adapter.subscribeFunding(asset, (info) => {
        registry.upsert(info);
        logger.logFunding(info);
      });
    }
  }

  // Initial + periodic REST poll so every venue has data immediately (Backpack WS only fires near settlement)
  const pollFundingRates = async () => {
    for (const [venue, adapter] of adapters.entries()) {
      for (const asset of TRACKED_ASSETS) {
        try {
          const info = await adapter.getFundingRate(asset);
          registry.upsert(info);
          logger.logFunding(info);
        } catch (e) {
          const msg = String(e);
          // Downgrade "unknown asset" errors to debug — expected for single-venue assets
          if (msg.includes("unknown asset") || msg.includes("no data for") || msg.includes(": 400") || msg.includes(": 404")) {
            log.debug({ venue, asset }, "asset not listed on venue");
          } else {
            log.warn({ venue, asset, err: msg }, "funding rate poll failed");
          }
        }
      }
    }
  };
  // Fire the initial poll in the background — DON'T await. If a venue's HTTP
  // is slow (Phoenix is currently flaky, Backpack can fail under cold-start),
  // awaiting here would block the API server from binding and Render's port
  // scan would time out, leaving the dashboard "offline" for 10+ minutes.
  void pollFundingRates();
  setInterval(pollFundingRates, 30_000);

  const venueHealthMap: Record<string, { ok: boolean; lastSeen: number }> = {};
  for (const v of adapters.keys()) {
    venueHealthMap[v] = { ok: true, lastSeen: Date.now() };
  }

  // Strategy loop
  setInterval(async () => {
    try {
      const spreads = TRACKED_ASSETS.flatMap((a) => registry.pairwiseSpreads(a));
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
      const fundingByVenueAsset = new Map<string, number>();
      for (const [v] of adapters.entries()) {
        for (const asset of TRACKED_ASSETS) {
          const info = registry.get(v, asset);
          if (info) fundingByVenueAsset.set(`${v}:${asset}`, info.hourlyRate);
        }
      }
      executor.updateUnrealizedPnl(fundingByVenueAsset, STRATEGY.LOOP_INTERVAL_MS / 3_600_000);

    } catch (e) {
      logger.logEvent("error", "strategy_loop_failed", e);
    }
  }, STRATEGY.LOOP_INTERVAL_MS);

  // Settlement loop — bridges simulated funding yield onto the devnet vault.
  // Strategy: keeper mints tUSDC profit into the vault account so the NAV rise is
  // fully backed and withdrawals always succeed, then pushes total_assets on-chain.
  let mintedYield = 0; // cumulative yield already backed this run
  setInterval(async () => {
    try {
      // Cumulative simulated PnL across open positions (real funding × notional − fees)
      const cumulativePnl = executor.openPositions.reduce((s, p) => s + p.unrealizedPnl, 0);

      const snapshot = await vault.getSnapshot();
      const totalSharesUnits = snapshot.totalShares / 1_000_000;
      const hasDepositors = totalSharesUnits > 0;

      // Only settle yield when there are depositors to credit it to.
      // Physically back new positive yield by minting tUSDC into the vault account.
      if (vault.isLive && hasDepositors) {
        const yieldToBack = Math.max(0, cumulativePnl - mintedYield);
        if (yieldToBack > 0.0001) {
          const sig = await vault.mintYieldToVault(yieldToBack);
          if (sig) {
            mintedYield += yieldToBack;
            logger.logEvent("info", "yield_settled", { yieldToBack, cumulativePnl, sig });
          }
        }
      }

      // Set on-chain total_assets to the real vault USDC balance — keeps NAV fully backed.
      const onChainUsdc = await vault.getIdleBalance();
      const targetAssets = vault.isLive ? onChainUsdc : (onChainUsdc + cumulativePnl);

      // NAV is $1.00 par when the vault is empty — never log 0/0.
      const nav = hasDepositors ? targetAssets / totalSharesUnits : 1;

      // Sanity guard: this vault's NAV starts at 1.0 and only grows (yield-only),
      // so anything outside [0.5, 100] is a transient bad on-chain read. Skip the
      // whole cycle so we never log garbage history or push a bad value on-chain.
      const navSane = nav >= 0.5 && nav <= 100;
      if (hasDepositors && !navSane) {
        log.warn({ nav, targetAssets, totalSharesUnits }, "implausible NAV — skipping settlement (bad on-chain read)");
      } else {
        if (hasDepositors) {
          logger.logNav({ totalAssetsUsd: targetAssets, totalShares: totalSharesUnits, navPerShare: nav });
        }
        if (vault.isLive && hasDepositors) {
          const sig = await vault.updateNav(targetAssets);
          log.debug({ targetAssets: targetAssets.toFixed(6), nav: nav.toFixed(6), cumulativePnl: cumulativePnl.toFixed(6), mintedYield: mintedYield.toFixed(6), sig }, "settlement pushed on-chain");
        }
      }
    } catch (e) {
      logger.logEvent("error", "settlement_failed", e);
    }
  }, VAULT.NAV_UPDATE_INTERVAL_MS);

  // HTTP API
  const api = createApi(registry, logger, vault, config.DASHBOARD_ORIGIN, () => executor.openPositions, {
    rpcUrl: config.HELIUS_RPC_URL,
    keeperKey: config.KEEPER_PRIVATE_KEY,
    usdcMint: config.USDC_MINT,
  });
  // Bind to 0.0.0.0 explicitly. Newer Node defaults can bind only to ::1/127.0.0.1
  // which Render's port scanner (which checks 0.0.0.0) can't see → deploy hangs.
  api.listen(config.API_PORT, "0.0.0.0", () => {
    log.info({ port: config.API_PORT, host: "0.0.0.0" }, "API server listening");
  });

  const shutdown = async (signal: string) => {
    log.info({ signal }, "shutting down");
    for (const v of adapters.values()) await v.shutdown().catch(() => {});
    logger.close();  // also pushes a final Turso sync if enabled
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));  // Render sends SIGTERM
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
