// Phase-0 standalone bootstrap logger.
// Uses built-in node:sqlite (Node 22.5+) — no native addon compilation required.
// Run: pnpm --filter @basis/keeper tsx src/scripts/logger-bootstrap.ts
// (or from keeper dir): npx tsx src/scripts/logger-bootstrap.ts

import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const LOG_DB_PATH = process.env["LOG_DB_PATH"] ?? "./data/basis.db";
const POLL_INTERVAL_MS = 60_000;

async function main() {
  const dir = path.dirname(LOG_DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new DatabaseSync(LOG_DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS funding_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue TEXT NOT NULL,
      asset TEXT NOT NULL,
      hourly_rate REAL NOT NULL,
      annualized_pct REAL NOT NULL,
      mark_price REAL NOT NULL,
      recorded_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fr_recorded ON funding_rates(recorded_at);
  `);

  console.log(`[bootstrap] DB ready at ${LOG_DB_PATH}`);
  console.log(`[bootstrap] Polling Backpack every ${POLL_INTERVAL_MS / 1000}s...`);

  async function poll() {
    try {
      // markPrices endpoint confirmed: returns 8h funding rate + mark/index prices
      const res = await fetch("https://api.backpack.exchange/api/v1/markPrices?symbol=SOL_USDC_PERP");
      if (!res.ok) {
        console.error(`[bootstrap] HTTP ${res.status} ${await res.text()}`);
        return;
      }
      const rows = (await res.json()) as Array<{ fundingRate: string; markPrice: string; indexPrice: string; nextFundingTimestamp: number }>;
      const data = rows[0];
      if (!data) { console.error("[bootstrap] no data row"); return; }
      // 8h_decimal → hourly: divide by 8
      const hourlyRate = parseFloat(data.fundingRate) / 8;
      const annualizedPct = hourlyRate * 24 * 365 * 100;
      const markPrice = parseFloat(data.markPrice);

      db.prepare(
        `INSERT INTO funding_rates (venue, asset, hourly_rate, annualized_pct, mark_price, recorded_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run("backpack", "SOL-PERP", hourlyRate, annualizedPct, markPrice, Date.now());

      console.log(
        `[bootstrap] ${new Date().toISOString()} | backpack SOL-PERP | ${(hourlyRate * 100).toFixed(4)}%/hr | ${annualizedPct.toFixed(2)}% ann | $${markPrice.toFixed(2)}`,
      );
    } catch (e) {
      console.error(`[bootstrap] error:`, e);
    }
  }

  await poll();
  setInterval(poll, POLL_INTERVAL_MS);

  process.on("SIGINT", () => {
    console.log("\n[bootstrap] shutting down");
    db.close();
    process.exit(0);
  });
}

main().catch(console.error);
