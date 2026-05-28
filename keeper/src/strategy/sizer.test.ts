import { sizePosition, DEFAULT_SIZER_CONFIG, SizerConfig, SizerContext } from "./sizer";
import { rankOpportunity, DEFAULT_RANKER_CONFIG } from "./ranker";
import type { SpreadOpportunity } from "../registry/funding-registry";

let passed = 0;
function check(label: string, cond: boolean) {
  if (!cond) { console.error(`FAIL: ${label}`); process.exitCode = 1; return; }
  console.log(`PASS: ${label}`);
  passed++;
}

function makeSpread(spreadPct = 20): SpreadOpportunity {
  return {
    asset: "SOL-PERP",
    longVenue: "pacifica",
    shortVenue: "backpack",
    spreadAnnualizedPct: spreadPct,
    longRate: 5,
    shortRate: spreadPct + 5,
    computedAt: Date.now(),
  };
}

function makeCtx(overrides: Partial<SizerContext> = {}): SizerContext {
  return {
    vaultTvl: 1000,
    currentPositionsUsd: 0,
    currentVenueExposure: { backpack: 0, pacifica: 0, phoenix: 0, drift: 0, jupiter: 0 },
    availableMarginPerVenue: { backpack: 1000, pacifica: 1000, phoenix: 1000, drift: 1000, jupiter: 1000 },
    ...overrides,
  };
}

function makeRanked(spreadPct = 20, sizeHint = 200) {
  return rankOpportunity(makeSpread(spreadPct), sizeHint, DEFAULT_RANKER_CONFIG);
}

// ── basic: 20% spread on $1000 TVL produces non-zero size ────────────────────

const ranked20 = makeRanked(20);
const size20 = sizePosition(ranked20, makeCtx(), DEFAULT_SIZER_CONFIG);
check("20% spread produces positive size", size20 > 0);
check("20% spread size within position cap (20% of TVL = $200)", size20 <= 200 + 1e-9);
console.log(`  size = $${size20.toFixed(4)}`);

// ── zero TVL → zero size ──────────────────────────────────────────────────────

check("zero TVL → zero size", sizePosition(makeRanked(), makeCtx({ vaultTvl: 0 }), DEFAULT_SIZER_CONFIG) === 0);

// ── venue cap: short venue fully used ────────────────────────────────────────

const fullShortCtx = makeCtx({
  currentVenueExposure: { backpack: 350, pacifica: 0, phoenix: 0, drift: 0, jupiter: 0 },
});
check("short venue at cap → zero size", sizePosition(makeRanked(), fullShortCtx, DEFAULT_SIZER_CONFIG) === 0);

// ── budget cap: can't exceed remaining TVL ────────────────────────────────────

const almostFull = makeCtx({ currentPositionsUsd: 990 });
const budgetCapped = sizePosition(makeRanked(), almostFull, DEFAULT_SIZER_CONFIG);
check("budget cap ≤ $10 remaining", budgetCapped <= 10 + 1e-9);

// ── margin cap: leverage multiplier applied ───────────────────────────────────

const tightMargin = makeCtx({
  availableMarginPerVenue: { backpack: 4, pacifica: 4, phoenix: 0, drift: 0, jupiter: 0 },
});
const marginCapped = sizePosition(makeRanked(), tightMargin, DEFAULT_SIZER_CONFIG);
// maxLeverage = 1.5 → effective margin budget per venue = 4 * 1.5 = 6
check("tight margin cap respected", marginCapped <= 6 + 1e-9);

// ── kelly fraction clamps at kellyMaxFraction ─────────────────────────────────

const highSpread = makeRanked(100);
const strictKelly: SizerConfig = { ...DEFAULT_SIZER_CONFIG, kellyMaxFraction: 0.1 };
const kellySize = sizePosition(highSpread, makeCtx(), strictKelly);
// rawSize = min(200, 350, 350, 1500, 1500, 1000) = 200; kellyFraction = min(100/200, 0.1) = 0.1
// size = 200 * 0.1 = 20
check("kelly fraction clamped at 0.1", Math.abs(kellySize - 20) < 1e-9);

// ── size never negative ───────────────────────────────────────────────────────

const zeroScore = makeRanked(0.001);
check("near-zero spread → non-negative size", sizePosition(zeroScore, makeCtx(), DEFAULT_SIZER_CONFIG) >= 0);

console.log(`\n${passed} tests passed.`);
