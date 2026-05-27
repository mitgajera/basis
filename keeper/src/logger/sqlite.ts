// Uses Node.js built-in node:sqlite (Node 22.5+) — no native addon compilation required.
// Suppress the experimental warning by passing --no-warnings or NODE_OPTIONS=--no-warnings.
import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";
import pino from "pino";
import { SCHEMA_SQL } from "./schema";
import { FundingRateInfo } from "../venues/index";
import { SpreadOpportunity } from "../registry/funding-registry";
import { RankedOpportunity } from "../strategy/ranker";

const log = pino({ transport: { target: "pino-pretty" } });

export interface NavPoint {
  totalAssetsUsd: number;
  totalShares: number;
  navPerShare: number;
}

export class Logger {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec(SCHEMA_SQL);
    log.info({ dbPath }, "SQLite logger initialized");
  }

  logFunding(info: FundingRateInfo): void {
    this.db
      .prepare(
        `INSERT INTO funding_rates (venue, asset, hourly_rate, annualized_pct, mark_price, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(info.venue, info.asset, info.hourlyRate, info.annualizedPct, info.markPrice, Date.now());
  }

  logSpread(spread: SpreadOpportunity): void {
    this.db
      .prepare(
        `INSERT INTO spreads (asset, long_venue, short_venue, spread_annualized_pct, recorded_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(spread.asset, spread.longVenue, spread.shortVenue, spread.spreadAnnualizedPct, Date.now());
  }

  logDryRun(opp: RankedOpportunity, sizeUsd: number): void {
    log.info(
      {
        asset: opp.asset,
        longVenue: opp.longVenue,
        shortVenue: opp.shortVenue,
        spreadPct: opp.spreadAnnualizedPct.toFixed(2),
        score: opp.score.toFixed(4),
        sizeUsd: sizeUsd.toFixed(2),
      },
      "[DRY RUN] would open spread",
    );
  }

  logNav(nav: NavPoint): void {
    this.db
      .prepare(
        `INSERT INTO nav_history (total_assets_usd, total_shares, nav_per_share, recorded_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(nav.totalAssetsUsd, nav.totalShares, nav.navPerShare, Date.now());
  }

  logEvent(severity: string, message: string, data?: unknown): void {
    const dataStr = data != null ? JSON.stringify(data) : null;
    this.db
      .prepare(
        `INSERT INTO events (severity, message, data, occurred_at) VALUES (?, ?, ?, ?)`,
      )
      .run(severity, message, dataStr, Date.now());
    if (severity === "error" || severity === "critical" || severity === "high") {
      log.error({ message, data }, "event");
    }
  }

  getNavHistory(lookbackMs: number): { timestamp: number; navPerShare: number }[] {
    const since = Date.now() - lookbackMs;
    return this.db
      .prepare(`SELECT recorded_at as timestamp, nav_per_share as navPerShare FROM nav_history WHERE recorded_at >= ? ORDER BY recorded_at ASC`)
      .all(since) as { timestamp: number; navPerShare: number }[];
  }

  getFundingRates(since: number): FundingRateInfo[] {
    return (
      this.db
        .prepare(`SELECT * FROM funding_rates WHERE recorded_at >= ? ORDER BY recorded_at ASC`)
        .all(since) as Array<{
          venue: string;
          asset: string;
          hourly_rate: number;
          annualized_pct: number;
          mark_price: number;
          recorded_at: number;
        }>
    ).map((r) => ({
      venue: r.venue as FundingRateInfo["venue"],
      asset: r.asset,
      hourlyRate: r.hourly_rate,
      annualizedPct: r.annualized_pct,
      markPrice: r.mark_price,
      indexPrice: 0,
      nextFundingTimestamp: 0,
      lastUpdated: r.recorded_at,
    }));
  }

  getSpreads(since: number): SpreadOpportunity[] {
    return (
      this.db
        .prepare(`SELECT * FROM spreads WHERE recorded_at >= ? ORDER BY recorded_at ASC`)
        .all(since) as Array<{
          asset: string;
          long_venue: string;
          short_venue: string;
          spread_annualized_pct: number;
          recorded_at: number;
        }>
    ).map((r) => ({
      asset: r.asset,
      longVenue: r.long_venue as SpreadOpportunity["longVenue"],
      shortVenue: r.short_venue as SpreadOpportunity["shortVenue"],
      spreadAnnualizedPct: r.spread_annualized_pct,
      longRate: 0,
      shortRate: 0,
      computedAt: r.recorded_at,
    }));
  }

  close(): void {
    this.db.close();
  }
}
