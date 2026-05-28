import path from "path";
import { Logger } from "../logger/sqlite";
import { loadConfig } from "../config";
import { rankOpportunity, DEFAULT_RANKER_CONFIG } from "../strategy/ranker";
import { sizePosition, DEFAULT_SIZER_CONFIG } from "../strategy/sizer";
import { STRATEGY, FEES_DEFAULTS } from "@basis/shared";
import type { Venue } from "../venues/index";
import type { SpreadOpportunity } from "../registry/funding-registry";
import type { FundingRateInfo } from "../venues/index";

interface SimPos {
  id: string;
  longVenue: Venue;
  shortVenue: Venue;
  asset: string;
  sizeUsd: number;
  openSpreadPct: number;
  openedAt: number;
  lastTick: number;
  fundingPnlUsd: number;
}

function printTable(rows: Record<string, string | number>[]): void {
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]!);
  const widths = keys.map((k) =>
    Math.max(k.length, ...rows.map((r) => String(r[k]).length)),
  );
  const sep = widths.map((w) => "-".repeat(w)).join("-+-");
  const header = keys.map((k, i) => k.padEnd(widths[i]!)).join(" | ");
  console.log(header);
  console.log(sep);
  for (const row of rows) {
    console.log(keys.map((k, i) => String(row[k]).padEnd(widths[i]!)).join(" | "));
  }
}

async function main() {
  const config = loadConfig();
  const dbPath = process.argv[2] ?? config.LOG_DB_PATH;

  console.log(`\nBacktest — loading from: ${path.resolve(dbPath)}\n`);

  const logger = new Logger(dbPath);
  const allRates = logger.getFundingRates(0);
  const allSpreads = logger.getSpreads(0);
  logger.close();

  if (allRates.length === 0 && allSpreads.length === 0) {
    console.log("No historical data found. Run the keeper first to accumulate data, then re-run backtest.");
    return;
  }

  console.log(`Loaded ${allRates.length} funding-rate rows, ${allSpreads.length} spread rows.`);

  if (allSpreads.length === 0) {
    console.log("No spread data yet — need at least 2 venues reporting simultaneously.");
    return;
  }

  // ── Build per-tick funding map ─────────────────────────────────────────────
  // Index funding rates by (venue:asset) so we can look up the rate at any tick
  const rateIndex = new Map<string, FundingRateInfo[]>();
  for (const r of allRates) {
    const key = `${r.venue}:${r.asset}`;
    if (!rateIndex.has(key)) rateIndex.set(key, []);
    rateIndex.get(key)!.push(r);
  }
  // Sort each series by time
  for (const series of rateIndex.values()) {
    series.sort((a, b) => a.lastUpdated - b.lastUpdated);
  }

  function getRateAt(venue: Venue, asset: string, ts: number): number {
    const series = rateIndex.get(`${venue}:${asset}`);
    if (!series || series.length === 0) return 0;
    // Binary search for last entry <= ts
    let lo = 0, hi = series.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (series[mid]!.lastUpdated <= ts) lo = mid; else hi = mid - 1;
    }
    return series[lo]!.hourlyRate;
  }

  // ── Sort spreads chronologically ───────────────────────────────────────────
  const spreads = [...allSpreads].sort((a, b) => a.computedAt - b.computedAt);

  // ── Simulation state ───────────────────────────────────────────────────────
  const VAULT_TVL = parseFloat(process.env["VAULT_TVL_USD"] ?? "1000");
  const openPositions = new Map<string, SimPos>();
  let totalRealizedPnlUsd = 0;
  let tradesEntered = 0;
  let tradesClosed = 0;
  const pnlByOpp = new Map<string, number>();

  const TICK_INTERVAL_MS = STRATEGY.LOOP_INTERVAL_MS;
  const ENTRY_FEE_PCT = (FEES_DEFAULTS.feesInBps + FEES_DEFAULTS.slippageBps) / 10_000;
  const EXIT_FEE_PCT = (FEES_DEFAULTS.feesOutBps + FEES_DEFAULTS.slippageBps) / 10_000;

  // Group spreads into tick buckets
  const tMin = spreads[0]!.computedAt;
  const tMax = spreads[spreads.length - 1]!.computedAt;
  const durationHours = (tMax - tMin) / 3_600_000;

  for (let t = tMin; t <= tMax + TICK_INTERVAL_MS; t += TICK_INTERVAL_MS) {
    const tickSpreads = spreads.filter(
      (s) => s.computedAt >= t - TICK_INTERVAL_MS && s.computedAt < t,
    );

    // Accrue unrealized PnL on open positions
    for (const pos of openPositions.values()) {
      const elapsedHours = (t - pos.lastTick) / 3_600_000;
      const longRate = getRateAt(pos.longVenue, pos.asset, t);
      const shortRate = getRateAt(pos.shortVenue, pos.asset, t);
      // Short on high-rate venue earns funding; long on low-rate venue pays funding
      // Net = (shortRate - longRate) × notional × elapsed
      pos.fundingPnlUsd += (shortRate - longRate) * pos.sizeUsd * elapsedHours;
      pos.lastTick = t;
    }

    // Hold / exit check: close positions where spread has inverted
    if (tickSpreads.length > 0) {
      const latestSpreadsMap = new Map<string, SpreadOpportunity>();
      for (const s of tickSpreads) {
        const key = `${s.longVenue}:${s.shortVenue}:${s.asset}`;
        latestSpreadsMap.set(key, s);
      }

      for (const [id, pos] of openPositions.entries()) {
        const key = `${pos.longVenue}:${pos.shortVenue}:${pos.asset}`;
        const currentSpread = latestSpreadsMap.get(key);
        const shouldClose =
          !currentSpread ||
          currentSpread.spreadAnnualizedPct <= 0 ||
          currentSpread.spreadAnnualizedPct < pos.openSpreadPct * 0.3;

        if (shouldClose) {
          const exitCost = pos.sizeUsd * EXIT_FEE_PCT;
          const realized = pos.fundingPnlUsd - exitCost;
          totalRealizedPnlUsd += realized;
          pnlByOpp.set(id, realized);
          openPositions.delete(id);
          tradesClosed++;
        }
      }
    }

    // Entry: for each qualifying spread, open a position if not already open
    for (const spread of tickSpreads) {
      const oppKey = `${spread.longVenue}:${spread.shortVenue}:${spread.asset}`;
      if (openPositions.has(oppKey)) continue;

      const prelimSize = Math.max(VAULT_TVL * STRATEGY.KELLY_MAX_FRACTION, STRATEGY.MIN_TRADE_USD);
      const ranked = rankOpportunity(spread, prelimSize, DEFAULT_RANKER_CONFIG);
      if (!ranked.meetsThreshold) continue;

      const currentExposure = Array.from(openPositions.values()).reduce(
        (s, p) => s + p.sizeUsd,
        0,
      );
      const venueExposure = {} as Record<Venue, number>;
      const marginPerVenue = {} as Record<Venue, number>;
      for (const v of ["backpack", "pacifica", "phoenix", "drift", "jupiter"] as Venue[]) {
        venueExposure[v] = Array.from(openPositions.values())
          .filter((p) => p.longVenue === v || p.shortVenue === v)
          .reduce((s, p) => s + p.sizeUsd, 0);
        marginPerVenue[v] = VAULT_TVL * DEFAULT_SIZER_CONFIG.maxVenuePct;
      }

      const size = sizePosition(
        ranked,
        {
          vaultTvl: VAULT_TVL,
          currentPositionsUsd: currentExposure,
          currentVenueExposure: venueExposure,
          availableMarginPerVenue: marginPerVenue,
        },
        DEFAULT_SIZER_CONFIG,
      );

      if (size < STRATEGY.MIN_TRADE_USD) continue;

      const entryCost = size * ENTRY_FEE_PCT;
      openPositions.set(oppKey, {
        id: oppKey,
        longVenue: spread.longVenue,
        shortVenue: spread.shortVenue,
        asset: spread.asset,
        sizeUsd: size * (1 - ENTRY_FEE_PCT),
        openSpreadPct: spread.spreadAnnualizedPct,
        openedAt: t,
        lastTick: t,
        fundingPnlUsd: -entryCost,
      });
      tradesEntered++;
    }
  }

  // Close any remaining open positions at end
  for (const [id, pos] of openPositions.entries()) {
    const exitCost = pos.sizeUsd * EXIT_FEE_PCT;
    const realized = pos.fundingPnlUsd - exitCost;
    totalRealizedPnlUsd += realized;
    pnlByOpp.set(id, realized);
    tradesClosed++;
  }
  openPositions.clear();

  // ── Summary ────────────────────────────────────────────────────────────────
  const annFactor = durationHours > 0 ? 8760 / durationHours : 0;
  const aprPct = (totalRealizedPnlUsd / VAULT_TVL) * 100 * annFactor;
  const winCount = Array.from(pnlByOpp.values()).filter((p) => p > 0).length;
  const winRate = pnlByOpp.size > 0 ? (winCount / pnlByOpp.size) * 100 : 0;

  console.log(`\nData window : ${new Date(tMin).toISOString()} → ${new Date(tMax).toISOString()}`);
  console.log(`Duration    : ${durationHours.toFixed(2)}h`);
  console.log(`Vault TVL   : $${VAULT_TVL.toFixed(2)}`);
  console.log(`\n── Trade Summary ─────────────────────────────────────`);
  console.log(`Entered     : ${tradesEntered}`);
  console.log(`Closed      : ${tradesClosed}`);
  console.log(`Win rate    : ${winRate.toFixed(1)}%`);
  console.log(`\n── PnL ───────────────────────────────────────────────`);
  console.log(`Total PnL   : $${totalRealizedPnlUsd.toFixed(4)}`);
  console.log(`ROI         : ${((totalRealizedPnlUsd / VAULT_TVL) * 100).toFixed(4)}%`);
  console.log(`Ann. APR    : ${aprPct.toFixed(2)}%`);

  if (pnlByOpp.size > 0) {
    console.log(`\n── Per-Opportunity PnL ───────────────────────────────`);
    const rows = Array.from(pnlByOpp.entries()).map(([id, pnl]) => ({
      opportunity: id,
      "pnl ($)": pnl.toFixed(4),
      result: pnl >= 0 ? "WIN" : "LOSS",
    }));
    printTable(rows);
  }

  console.log();
}

main().catch(console.error);
