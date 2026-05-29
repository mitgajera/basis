import path from "path";
import * as dotenv from "dotenv";
import { Logger } from "../logger/sqlite";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// Purges NAV history and closed (ghost-era) trades so APR / PnL / NAV charts
// reflect only the real, correctly-sized positions. Keeps OPEN positions intact.
function main() {
  const dbPath = process.env.LOG_DB_PATH ?? "./data/basis.db";
  const logger = new Logger(dbPath);

  const openBefore = logger.getOpenTrades().length;
  logger.clearNavHistory();
  logger.clearClosedTrades();
  const openAfter = logger.getOpenTrades().length;

  console.log(`Cleared NAV history + closed trades. Open positions kept: ${openBefore} → ${openAfter}.`);
  logger.close();
}

main();
