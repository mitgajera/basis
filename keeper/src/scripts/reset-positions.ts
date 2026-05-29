import path from "path";
import * as dotenv from "dotenv";
import { Logger } from "../logger/sqlite";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// Closes all stale "open" trade legs so the keeper restarts with a clean book.
// Use after the position book drifted out of sync with real vault TVL.
function main() {
  const dbPath = process.env.LOG_DB_PATH ?? "./data/basis.db";
  const logger = new Logger(dbPath);

  const before = logger.getOpenTrades().length;
  logger.closeAllOpenTrades();
  const after = logger.getOpenTrades().length;

  console.log(`Closed ${before} open trade legs → ${after} remaining open.`);
  logger.close();
}

main();
