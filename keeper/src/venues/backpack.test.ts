/**
 * Backpack live integration test — fetches real data from the public API.
 * Run: pnpm --filter @basis/keeper run test:backpack
 */
import { loadConfig } from "../config";
import { BackpackAdapter } from "./backpack";

async function main() {
  const config = loadConfig();
  const adapter = new BackpackAdapter(config);

  console.log("Backpack health check...");
  const health = await adapter.health();
  console.log("  health:", JSON.stringify(health));
  if (!health.ok) {
    console.error("  FAIL: health check failed");
    process.exit(1);
  }

  console.log("\nFetching SOL-PERP funding rate...");
  const rate = await adapter.getFundingRate("SOL-PERP");
  console.log(`  venue:             ${rate.venue}`);
  console.log(`  asset:             ${rate.asset}`);
  console.log(`  hourlyRate:        ${(rate.hourlyRate * 100).toFixed(6)}%`);
  console.log(`  annualizedPct:     ${rate.annualizedPct.toFixed(4)}%`);
  console.log(`  markPrice:         $${rate.markPrice.toFixed(2)}`);
  console.log(`  indexPrice:        $${rate.indexPrice.toFixed(2)}`);
  console.log(`  nextFunding:       ${new Date(rate.nextFundingTimestamp * 1000).toISOString()}`);

  if (!rate.markPrice || !rate.annualizedPct) {
    console.error("  FAIL: missing markPrice or annualizedPct");
    process.exit(1);
  }

  console.log("\n  PASS: Backpack live data OK");
  await adapter.shutdown();
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
