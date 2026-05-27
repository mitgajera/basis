/**
 * print-spreads — poll all three venues every 30s and print a sorted spread table.
 *
 * Usage: pnpm --filter @basis/keeper run print-spreads
 */
import { loadConfig } from "../config";
import { BackpackAdapter } from "../venues/backpack";
import { PhoenixAdapter } from "../venues/phoenix";
import { PacificaAdapter } from "../venues/pacifica";
import { FundingRateInfo, VenueAdapter } from "../venues/index";
import { FundingRegistry } from "../registry/funding-registry";

const ASSET = "SOL-PERP";
const INTERVAL_MS = 30_000;

async function fetchRate(adapter: VenueAdapter): Promise<FundingRateInfo | null> {
  try {
    return await adapter.getFundingRate(ASSET);
  } catch (e) {
    return null;
  }
}

function fmt(n: number, digits = 4): string {
  return (n * 100).toFixed(digits) + "%";
}

function pad(s: string, width: number): string {
  return s.padEnd(width);
}

async function printSpreads(
  adapters: VenueAdapter[],
  registry: FundingRegistry,
): Promise<void> {
  const results = await Promise.allSettled(adapters.map((a) => fetchRate(a)));

  const rates: FundingRateInfo[] = [];
  for (let i = 0; i < adapters.length; i++) {
    const r = results[i];
    if (r?.status === "fulfilled" && r.value) {
      registry.upsert(r.value);
      rates.push(r.value);
    }
  }

  const ts = new Date().toISOString().slice(11, 19);
  console.log(`\n── ${ts} UTC ─────────────────────────────────────────────`);

  if (rates.length === 0) {
    console.log("  No venue data available yet.");
    return;
  }

  // Per-venue rates table
  console.log(`  ${"Venue".padEnd(12)} ${"Hourly".padStart(10)} ${"Annualized".padStart(12)} ${"Mark $".padStart(10)}`);
  console.log("  " + "─".repeat(46));
  for (const r of rates.sort((a, b) => b.annualizedPct - a.annualizedPct)) {
    console.log(
      `  ${pad(r.venue, 12)} ${fmt(r.hourlyRate, 5).padStart(10)} ${r.annualizedPct.toFixed(2).padStart(11)}%  $${r.markPrice.toFixed(2).padStart(8)}`,
    );
  }

  // Pairwise spreads
  const spreads = registry.pairwiseSpreads(ASSET);
  if (spreads.length === 0) {
    console.log("\n  (need ≥2 venues to compute spreads)");
    return;
  }
  const sorted = spreads.sort((a, b) => b.spreadAnnualizedPct - a.spreadAnnualizedPct);
  console.log(`\n  ${"Spread (SHORT → LONG)".padEnd(32)} ${"Ann %".padStart(8)}`);
  console.log("  " + "─".repeat(42));
  for (const s of sorted) {
    const label = `${s.shortVenue} SHORT / ${s.longVenue} LONG`;
    console.log(`  ${pad(label, 32)} ${s.spreadAnnualizedPct.toFixed(2).padStart(7)}%`);
  }
}

async function main() {
  const config = loadConfig();
  const adapters: VenueAdapter[] = [
    new BackpackAdapter(config),
    new PhoenixAdapter(config),
    new PacificaAdapter(config),
  ];
  const registry = new FundingRegistry();

  console.log("basis. — live funding spreads — press Ctrl+C to stop");
  console.log(`Polling ${adapters.map((a) => a.venue).join(", ")} every ${INTERVAL_MS / 1000}s\n`);

  // Init all adapters in parallel; failures are logged but don't abort
  const inits = await Promise.allSettled(adapters.map((a) => a.init()));
  for (let i = 0; i < adapters.length; i++) {
    const r = inits[i];
    if (r?.status === "rejected") {
      console.warn(`  [warn] ${adapters[i]!.venue} init failed: ${(r as PromiseRejectedResult).reason}`);
    }
  }

  // First print immediately
  await printSpreads(adapters, registry);

  // Then every INTERVAL_MS
  const timer = setInterval(() => printSpreads(adapters, registry), INTERVAL_MS);

  process.on("SIGINT", async () => {
    clearInterval(timer);
    await Promise.allSettled(adapters.map((a) => a.shutdown()));
    process.exit(0);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
