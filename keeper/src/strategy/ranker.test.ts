import { rankOpportunity, DEFAULT_RANKER_CONFIG, RankerConfig } from "./ranker";
import type { SpreadOpportunity } from "../registry/funding-registry";
import { STRATEGY, FEES_DEFAULTS } from "@basis/shared";

function makeSpread(overrides: Partial<SpreadOpportunity> = {}): SpreadOpportunity {
  return {
    asset: "SOL-PERP",
    longVenue: "pacifica",
    shortVenue: "backpack",
    spreadAnnualizedPct: 40,
    longRate: 5,
    shortRate: 45,
    computedAt: Date.now(),
    ...overrides,
  };
}

let passed = 0;
function check(label: string, cond: boolean) {
  if (!cond) { console.error(`FAIL: ${label}`); process.exitCode = 1; return; }
  console.log(`PASS: ${label}`);
  passed++;
}

// Break-even threshold: feeBps*876000/(10000*annPct) < 0.5*persistenceHours
// With 168h persistence and 33 total fee bps: min qualifying spread ≈ 34.4%
// Real observed spread (Phoenix 34% vs Pacifica -4%) ≈ 38%, which passes.

// ── 40% spread meets threshold ────────────────────────────────────────────────

const r40 = rankOpportunity(makeSpread(), 100, DEFAULT_RANKER_CONFIG);
check("40% spread: score > 0", r40.score > 0);
check("40% spread: meets threshold", r40.meetsThreshold);
check("40% spread: no rejection reason", r40.rejectionReason === undefined);
check("40% spread: positive expectedDailyPnlPerDollar", r40.expectedDailyPnlPerDollar > 0);
check("40% spread: breakEvenHoldHours < 84h (0.5 * 168)", r40.breakEvenHoldHours < 84);

// ── 20% spread: score positive but fails break-even gate ─────────────────────
// breakEvenHoldHours = 33*876000/(10000*20) ≈ 144.5h > 84h

const r20 = rankOpportunity(makeSpread({ spreadAnnualizedPct: 20 }), 100, DEFAULT_RANKER_CONFIG);
check("20% spread: score > 0", r20.score > 0);
check("20% spread: rejected by break-even gate", !r20.meetsThreshold);

// ── below MIN_SPREAD_THRESHOLD_PCT always rejected ────────────────────────────

const rLow = rankOpportunity(makeSpread({ spreadAnnualizedPct: STRATEGY.MIN_SPREAD_THRESHOLD_PCT - 0.01 }), 100, DEFAULT_RANKER_CONFIG);
check("below-min spread: rejected", !rLow.meetsThreshold);
check("below-min spread: reason includes '< min'", rLow.rejectionReason?.includes("< min") ?? false);

// ── zero and negative spreads ─────────────────────────────────────────────────

check("zero spread rejected", !rankOpportunity(makeSpread({ spreadAnnualizedPct: 0 }), 100, DEFAULT_RANKER_CONFIG).meetsThreshold);
check("negative spread rejected", !rankOpportunity(makeSpread({ spreadAnnualizedPct: -10 }), 100, DEFAULT_RANKER_CONFIG).meetsThreshold);

// ── score scales linearly with position size ──────────────────────────────────

const s100 = rankOpportunity(makeSpread(), 100, DEFAULT_RANKER_CONFIG);
const s1000 = rankOpportunity(makeSpread(), 1000, DEFAULT_RANKER_CONFIG);
check("score scales with position size", s1000.score > s100.score);

// ── break-even hours independent of position size ─────────────────────────────

check("breakEvenHoldHours is size-independent", Math.abs(s100.breakEvenHoldHours - s1000.breakEvenHoldHours) < 1e-9);

// ── wider spread → lower break-even hours ────────────────────────────────────

const rNarrow = rankOpportunity(makeSpread({ spreadAnnualizedPct: 40 }), 100, DEFAULT_RANKER_CONFIG);
const rWide = rankOpportunity(makeSpread({ spreadAnnualizedPct: 80 }), 100, DEFAULT_RANKER_CONFIG);
check("wider spread breaks even faster", rWide.breakEvenHoldHours < rNarrow.breakEvenHoldHours);

// ── expectedDailyPnlPerDollar formula ────────────────────────────────────────

const rFormula = rankOpportunity(makeSpread({ spreadAnnualizedPct: 36.5 }), 100, DEFAULT_RANKER_CONFIG);
check("expectedDailyPnlPerDollar = annPct/365/100", Math.abs(rFormula.expectedDailyPnlPerDollar - 36.5 / 365 / 100) < 1e-10);

// ── strict minScoreThreshold ──────────────────────────────────────────────────

const strictCfg: RankerConfig = { ...DEFAULT_RANKER_CONFIG, minScoreThreshold: 1_000_000 };
check("strict threshold rejects 40% spread", !rankOpportunity(makeSpread(), 100, strictCfg).meetsThreshold);

console.log(`\n${passed} tests passed.`);
