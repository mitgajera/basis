// Phase 2: backtest script — runs strategy logic over historical SQLite data
// Stub for Phase 0 scaffold; implemented in Phase 2
import { Logger } from "../logger/sqlite";
import { loadConfig } from "../config";

async function main() {
  const config = loadConfig();
  const logger = new Logger(config.LOG_DB_PATH);
  const rows = logger.getSpreads(0);
  console.log(`Loaded ${rows.length} spread rows. Backtest not yet implemented — run in Phase 2.`);
  logger.close();
}

main().catch(console.error);
