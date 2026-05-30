// Uses Turso's `libsql` package — sync API (better-sqlite3 style), with optional
// embedded-replica mode that auto-syncs the local SQLite file to a hosted Turso
// database. With TURSO_URL + TURSO_TOKEN set, data survives container restarts.
import Database from "libsql";
import fs from "fs";
import path from "path";
import pino from "pino";
import { SCHEMA_SQL } from "./schema";
import { FundingRateInfo } from "../venues/index";
import { SpreadOpportunity } from "../registry/funding-registry";
import { RankedOpportunity } from "../strategy/ranker";

const log = pino({ transport: { target: "pino-pretty" } });

const SYNC_INTERVAL_MS = 30_000;

export interface NavPoint {
  totalAssetsUsd: number;
  totalShares: number;
  navPerShare: number;
}

export interface TradeLog {
  opportunityId: string;
  venue:         string;
  asset:         string;
  side:          "long" | "short";
  sizeUsd:       number;
  sizeBase:      number;
  fillPrice:     number;
  feeUsd:        number;
  orderId:       string;
  status:        "open" | "closed" | "failed";
  openedAt:      number;
}

export class Logger {
  private db: Database;
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Turso sync temporarily disabled — set BASIS_USE_TURSO=1 to re-enable.
    const tursoEnabled = process.env["BASIS_USE_TURSO"] === "1";
    const syncUrl = tursoEnabled ? process.env["TURSO_URL"] : undefined;
    const authToken = tursoEnabled ? process.env["TURSO_TOKEN"] : undefined;

    if (syncUrl && authToken) {
      // Embedded replica — local file kept in sync with hosted Turso DB.
      // First sync pulls remote state; subsequent syncs push local writes back.
      this.db = new Database(dbPath, { syncUrl, authToken });
      try {
        this.db.sync();
        log.info({ dbPath, mode: "turso-replica" }, "SQLite logger initialized (synced from Turso)");
      } catch (e) {
        log.warn({ err: String(e) }, "initial Turso sync failed; continuing with local state");
      }
      this.syncTimer = setInterval(() => {
        try { this.db.sync(); } catch (e) {
          log.warn({ err: String(e) }, "periodic Turso sync failed");
        }
      }, SYNC_INTERVAL_MS);
    } else {
      // Local-only mode (no Turso configured)
      this.db = new Database(dbPath);
      log.info({ dbPath, mode: "local" }, "SQLite logger initialized (no Turso sync)");
    }

    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec(SCHEMA_SQL);
    this._migrate();
  }

  // ── schema migration — adds columns that may not exist in older DBs ────────
  private _migrate(): void {
    const cols = (this.db.prepare("PRAGMA table_info(trades)").all() as Array<{ name: string }>).map((c) => c.name);
    if (!cols.includes("order_id"))  this.db.exec("ALTER TABLE trades ADD COLUMN order_id  TEXT");
    if (!cols.includes("size_base")) this.db.exec("ALTER TABLE trades ADD COLUMN size_base REAL NOT NULL DEFAULT 0");
    if (!cols.includes("pnl_usd"))   this.db.exec("ALTER TABLE trades ADD COLUMN pnl_usd   REAL");
    if (!cols.includes("exit_price"))this.db.exec("ALTER TABLE trades ADD COLUMN exit_price REAL");
  }

  // ── funding ────────────────────────────────────────────────────────────────
  logFunding(info: FundingRateInfo): void {
    this.db.prepare(
      `INSERT INTO funding_rates (venue, asset, hourly_rate, annualized_pct, mark_price, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(info.venue, info.asset, info.hourlyRate, info.annualizedPct, info.markPrice, Date.now());
  }

  // ── spreads ────────────────────────────────────────────────────────────────
  logSpread(spread: SpreadOpportunity): void {
    this.db.prepare(
      `INSERT INTO spreads (asset, long_venue, short_venue, spread_annualized_pct, recorded_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(spread.asset, spread.longVenue, spread.shortVenue, spread.spreadAnnualizedPct, Date.now());
  }

  logDryRun(opp: RankedOpportunity, sizeUsd: number): void {
    log.info({
      asset: opp.asset,
      longVenue: opp.longVenue,
      shortVenue: opp.shortVenue,
      spreadPct: opp.spreadAnnualizedPct.toFixed(2),
      score: opp.score.toFixed(4),
      sizeUsd: sizeUsd.toFixed(2),
    }, "[DRY RUN] would open spread");
  }

  // ── trades ─────────────────────────────────────────────────────────────────
  logTrade(trade: TradeLog): void {
    this.db.prepare(
      `INSERT INTO trades
         (opportunity_id, venue, asset, side, size_usd, size_base, fill_price, fee_usd, order_id, status, opened_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      trade.opportunityId, trade.venue, trade.asset, trade.side,
      trade.sizeUsd, trade.sizeBase, trade.fillPrice, trade.feeUsd,
      trade.orderId, trade.status, trade.openedAt,
    );
  }

  closeTrade(opportunityId: string, venue: string, side: string, exitPrice: number, pnlUsd: number): void {
    this.db.prepare(
      `UPDATE trades SET status='closed', exit_price=?, pnl_usd=?, closed_at=?
       WHERE opportunity_id=? AND venue=? AND side=? AND status='open'`
    ).run(exitPrice, pnlUsd, Date.now(), opportunityId, venue, side);
  }

  closeAllOpenTrades(): void {
    this.db.prepare(
      `UPDATE trades SET status='closed', closed_at=? WHERE status='open'`
    ).run(Date.now());
  }

  // ── maintenance — purge polluted history while keeping open positions ──────
  clearNavHistory(): void {
    this.db.exec("DELETE FROM nav_history");
  }

  clearClosedTrades(): void {
    this.db.exec("DELETE FROM trades WHERE status='closed'");
  }

  /** Cumulative realized PnL stepped at each close, with baseline before the lookback window. */
  getPnlHistory(lookbackMs: number): Array<{ timestamp: number; value: number }> {
    const since = Date.now() - lookbackMs;
    const baseline = this.db.prepare(
      `SELECT COALESCE(SUM(pnl_usd), 0) AS total FROM trades
       WHERE status='closed' AND closed_at IS NOT NULL AND pnl_usd IS NOT NULL AND closed_at < ?`
    ).get(since) as { total: number };
    let cum = baseline?.total ?? 0;

    const closed = this.db.prepare(
      `SELECT pnl_usd, closed_at FROM trades
       WHERE status='closed' AND closed_at IS NOT NULL AND pnl_usd IS NOT NULL AND closed_at >= ?
       ORDER BY closed_at ASC`
    ).all(since) as Array<{ pnl_usd: number; closed_at: number }>;

    const points: Array<{ timestamp: number; value: number }> = [
      { timestamp: since, value: cum },
    ];

    for (const row of closed) {
      cum += row.pnl_usd;
      const last = points[points.length - 1]!;
      if (last.timestamp === row.closed_at) {
        last.value = cum;
      } else {
        points.push({ timestamp: row.closed_at, value: cum });
      }
    }

    return points;
  }

  private mapTradeRow(r: Record<string, unknown>): {
    opportunityId: string; venue: string; asset: string; side: string;
    sizeUsd: number; fillPrice: number | null; exitPrice: number | null;
    feeUsd: number; pnlUsd: number | null; orderId: string | null;
    status: string; openedAt: number; closedAt: number | null;
  } {
    return {
      opportunityId: r["opportunity_id"] as string,
      venue:         r["venue"] as string,
      asset:         r["asset"] as string,
      side:          r["side"] as string,
      sizeUsd:       r["size_usd"] as number,
      fillPrice:     r["fill_price"] as number | null,
      exitPrice:     r["exit_price"] as number | null,
      feeUsd:        r["fee_usd"] as number,
      pnlUsd:        r["pnl_usd"] as number | null,
      orderId:       r["order_id"] as string | null,
      status:        r["status"] as string,
      openedAt:      r["opened_at"] as number,
      closedAt:      r["closed_at"] as number | null,
    };
  }

  /** Trades with activity in the lookback window (opened or closed), paginated. */
  getTradesPage(since: number, limit: number, offset: number): {
    trades: Array<{
      opportunityId: string; venue: string; asset: string; side: string;
      sizeUsd: number; fillPrice: number | null; exitPrice: number | null;
      feeUsd: number; pnlUsd: number | null; orderId: string | null;
      status: string; openedAt: number; closedAt: number | null;
    }>;
    total: number;
  } {
    const windowClause = `(opened_at >= ? OR (closed_at IS NOT NULL AND closed_at >= ?))`;
    const totalRow = this.db.prepare(
      `SELECT COUNT(*) AS c FROM trades WHERE ${windowClause}`
    ).get(since, since) as { c: number };

    const rows = this.db.prepare(
      `SELECT opportunity_id, venue, asset, side, size_usd, fill_price, exit_price,
              fee_usd, pnl_usd, order_id, status, opened_at, closed_at
       FROM trades
       WHERE ${windowClause}
       ORDER BY COALESCE(closed_at, opened_at) DESC
       LIMIT ? OFFSET ?`
    ).all(since, since, limit, offset) as Array<Record<string, unknown>>;

    return {
      trades: rows.map((r) => this.mapTradeRow(r)),
      total: totalRow?.c ?? 0,
    };
  }

  getTrades(limit = 50, since = 0): Array<{
    opportunityId: string; venue: string; asset: string; side: string;
    sizeUsd: number; fillPrice: number | null; exitPrice: number | null;
    feeUsd: number; pnlUsd: number | null; orderId: string | null;
    status: string; openedAt: number; closedAt: number | null;
  }> {
    return this.getTradesPage(since, limit, 0).trades;
  }

  getOpenTrades(): Array<{
    opportunityId: string; venue: string; asset: string; side: string;
    sizeUsd: number; sizeBase: number; fillPrice: number; openedAt: number;
  }> {
    return (this.db.prepare(
      `SELECT opportunity_id, venue, asset, side, size_usd, size_base, fill_price, opened_at
       FROM trades WHERE status='open' ORDER BY opened_at ASC`
    ).all() as Array<Record<string, unknown>>).map((r) => ({
      opportunityId: r["opportunity_id"] as string,
      venue:         r["venue"] as string,
      asset:         r["asset"] as string,
      side:          r["side"] as string,
      sizeUsd:       r["size_usd"] as number,
      sizeBase:      r["size_base"] as number,
      fillPrice:     r["fill_price"] as number,
      openedAt:      r["opened_at"] as number,
    }));
  }

  // ── NAV ────────────────────────────────────────────────────────────────────
  logNav(nav: NavPoint): void {
    this.db.prepare(
      `INSERT INTO nav_history (total_assets_usd, total_shares, nav_per_share, recorded_at)
       VALUES (?, ?, ?, ?)`
    ).run(nav.totalAssetsUsd, nav.totalShares, nav.navPerShare, Date.now());
  }

  getNavHistory(lookbackMs: number): { timestamp: number; navPerShare: number }[] {
    const since = Date.now() - lookbackMs;
    return this.db.prepare(
      `SELECT recorded_at as timestamp, nav_per_share as navPerShare
       FROM nav_history WHERE recorded_at >= ? ORDER BY recorded_at ASC`
    ).all(since) as { timestamp: number; navPerShare: number }[];
  }

  // ── funding rate history ───────────────────────────────────────────────────
  getFundingRates(since: number): FundingRateInfo[] {
    return (
      this.db.prepare(
        `SELECT * FROM funding_rates WHERE recorded_at >= ? ORDER BY recorded_at ASC`
      ).all(since) as Array<{
        venue: string; asset: string; hourly_rate: number;
        annualized_pct: number; mark_price: number; recorded_at: number;
      }>
    ).map((r) => ({
      venue:                r.venue as FundingRateInfo["venue"],
      asset:                r.asset,
      hourlyRate:           r.hourly_rate,
      annualizedPct:        r.annualized_pct,
      markPrice:            r.mark_price,
      indexPrice:           0,
      nextFundingTimestamp: 0,
      lastUpdated:          r.recorded_at,
    }));
  }

  // ── spreads history ────────────────────────────────────────────────────────
  getSpreads(since: number): SpreadOpportunity[] {
    return (
      this.db.prepare(
        `SELECT * FROM spreads WHERE recorded_at >= ? ORDER BY recorded_at ASC`
      ).all(since) as Array<{
        asset: string; long_venue: string; short_venue: string;
        spread_annualized_pct: number; recorded_at: number;
      }>
    ).map((r) => ({
      asset:               r.asset,
      longVenue:           r.long_venue as SpreadOpportunity["longVenue"],
      shortVenue:          r.short_venue as SpreadOpportunity["shortVenue"],
      spreadAnnualizedPct: r.spread_annualized_pct,
      longRate:            0,
      shortRate:           0,
      computedAt:          r.recorded_at,
    }));
  }

  // ── faucet ─────────────────────────────────────────────────────────────────
  getFaucetLastMint(address: string): number | null {
    const row = this.db.prepare(
      `SELECT last_mint_ms FROM faucet_log WHERE address = ?`
    ).get(address) as { last_mint_ms: number } | undefined;
    return row?.last_mint_ms ?? null;
  }

  recordFaucetMint(address: string): void {
    this.db.prepare(
      `INSERT INTO faucet_log (address, last_mint_ms) VALUES (?, ?)
       ON CONFLICT(address) DO UPDATE SET last_mint_ms = excluded.last_mint_ms`
    ).run(address, Date.now());
  }

  // ── events ─────────────────────────────────────────────────────────────────
  logEvent(severity: string, message: string, data?: unknown): void {
    const dataStr = data != null ? JSON.stringify(data) : null;
    this.db.prepare(
      `INSERT INTO events (severity, message, data, occurred_at) VALUES (?, ?, ?, ?)`
    ).run(severity, message, dataStr, Date.now());
    if (severity === "error" || severity === "critical" || severity === "high") {
      log.error({ message, data }, "event");
    }
  }

  close(): void {
    if (this.syncTimer) { clearInterval(this.syncTimer); this.syncTimer = null; }
    // Final push of any local writes to Turso before shutting down
    try { this.db.sync(); } catch { /* best effort */ }
    this.db.close();
  }
}
