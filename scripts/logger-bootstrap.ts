// Phase-0 standalone bootstrap logger.
// Writes to ./data/bootstrap.db, polls Backpack every 30s.
// Run from root: pnpm tsx scripts/logger-bootstrap.ts
// Uses built-in node:sqlite (Node 22.5+) — no native compilation needed.

import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";
import * as dotenv from "dotenv";
import pino from "pino";

dotenv.config();

const DB_PATH = path.resolve("./data/bootstrap.db");
const POLL_INTERVAL_MS = 30_000;

const log = pino({ transport: { target: "pino-pretty" } });

async function main() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS funding_rates (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      venue       TEXT    NOT NULL,
      asset       TEXT    NOT NULL,
      hourly_rate REAL    NOT NULL,
      annualized_pct REAL NOT NULL,
      mark_price  REAL    NOT NULL,
      recorded_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fr_recorded ON funding_rates(recorded_at);

    CREATE TABLE IF NOT EXISTS spreads (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      asset                TEXT    NOT NULL,
      long_venue           TEXT    NOT NULL,
      short_venue          TEXT    NOT NULL,
      spread_annualized_pct REAL   NOT NULL,
      recorded_at          INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sp_recorded ON spreads(recorded_at);
  `);

  log.info({ db: DB_PATH }, "bootstrap DB ready");
  log.info(`Polling Backpack every ${POLL_INTERVAL_MS / 1000}s…`);

  async function poll() {
    try {
      const res = await fetch(
        "https://api.backpack.exchange/api/v1/markPrices?symbol=SOL_USDC_PERP",
      );
      if (!res.ok) {
        log.warn({ status: res.status }, "Backpack request failed");
        return;
      }
      const rows = (await res.json()) as Array<{
        fundingRate: string;
        markPrice: string;
        indexPrice: string;
        nextFundingTimestamp: number;
      }>;
      const data = rows[0];
      if (!data) { log.warn("no data in response"); return; }

      // 8h_decimal → hourly
      const hourlyRate = parseFloat(data.fundingRate) / 8;
      const annualizedPct = hourlyRate * 24 * 365 * 100;
      const markPrice = parseFloat(data.markPrice);
      const now = Date.now();

      db.prepare(
        `INSERT INTO funding_rates (venue, asset, hourly_rate, annualized_pct, mark_price, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run("backpack", "SOL-PERP", hourlyRate, annualizedPct, markPrice, now);

      log.info({
        venue: "backpack",
        asset: "SOL-PERP",
        hourlyRatePct: (hourlyRate * 100).toFixed(4) + "%",
        annualizedPct: annualizedPct.toFixed(2) + "%",
        markPrice: "$" + markPrice.toFixed(2),
      }, "funding rate logged");
    } catch (e) {
      log.error({ err: e }, "poll error");
    }
  }

  await poll();
  const timer = setInterval(poll, POLL_INTERVAL_MS);

  process.on("SIGINT", () => {
    clearInterval(timer);
    log.info("shutdown — closing DB");
    db.close();
    process.exit(0);
  });
}

main().catch((e) => { log.error(e); process.exit(1); });
