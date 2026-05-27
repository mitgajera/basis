import { loadConfig } from "../config";
import { BackpackAdapter } from "../venues/backpack";
import { FundingRegistry } from "../registry/funding-registry";

async function main() {
  const config = loadConfig();
  const backpack = new BackpackAdapter(config);
  await backpack.init();

  const registry = new FundingRegistry();

  const info = await backpack.getFundingRate("SOL-PERP");
  registry.upsert(info);

  console.log("\n=== Backpack SOL-PERP Funding Rate ===");
  console.log(`  Hourly rate:     ${(info.hourlyRate * 100).toFixed(4)}%`);
  console.log(`  Annualized:      ${info.annualizedPct.toFixed(2)}%`);
  console.log(`  Mark price:      $${info.markPrice.toFixed(2)}`);
  console.log(`  Next funding:    ${new Date(info.nextFundingTimestamp * 1000).toISOString()}`);

  const spreads = registry.pairwiseSpreads("SOL-PERP");
  console.log("\n=== Pairwise Spreads ===");
  if (spreads.length === 0) {
    console.log("  (need ≥2 venues to compute spreads)");
  } else {
    for (const s of spreads) {
      console.log(`  ${s.shortVenue} SHORT / ${s.longVenue} LONG: ${s.spreadAnnualizedPct.toFixed(2)}% annualized`);
    }
  }

  await backpack.shutdown();
}

main().catch(console.error);
