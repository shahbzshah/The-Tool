/**
 * Unit tests for src/lib/hunter/scoring.ts
 *
 * Run with Node's built-in runner (no dependencies; Node >= 23 type-strips
 * .ts imports natively):
 *
 *   node --test src/lib/hunter/scoring.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  qualityScore,
  gapMultiplier,
  marketScore,
  competitionFactor,
  scoreApp,
  rankApps,
  whyItScores,
  type AppDetail,
  type ScoredApp,
} from "./scoring.ts";

/** Loose float comparison for hand-computed expected values. */
function approx(actual: number, expected: number, tol = 1e-6, msg?: string) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg ?? "approx"}: expected ~${expected}, got ${actual}`
  );
}

// ---------------------------------------------------------------- qualityScore

test("qualityScore: perfect app maxes out at 100", () => {
  const d: AppDetail = {
    appId: "a",
    title: "Perfect",
    score: 5.0,
    reviews: 50_000,
    updated: "Jan 15, 2025",
  };
  // (5/5)*70 + 1.0*20 + 10 = 100
  assert.equal(qualityScore(d), 100);
});

test("qualityScore: typical mid app", () => {
  const d: AppDetail = {
    appId: "a",
    title: "Mid",
    score: 4.5,
    reviews: 10_000,
    updated: "Jan 15, 2025",
  };
  // (4.5/5)*70 = 63; clamp(10000/5000,0,1)=1 -> +20; 2025 -> +10 => 93
  assert.equal(qualityScore(d), 93);
});

test("qualityScore: old update drops the recency bonus", () => {
  const d: AppDetail = {
    appId: "a",
    title: "Old",
    score: 3.0,
    reviews: 100,
    updated: "Jun 1, 2022",
  };
  // (3/5)*70 = 42; (100/5000)*20 = 0.4; 2022 -> +4 => 46.4
  approx(qualityScore(d), 46.4);
});

test("qualityScore: missing fields degrade gracefully (no NaN)", () => {
  const d: AppDetail = { appId: "a", title: "Empty" };
  // rating 0 -> 0; reviews 0 -> 0; no updated -> +4 => 4
  assert.equal(qualityScore(d), 4);
});

test("qualityScore: null/undefined score, reviews, updated", () => {
  const d: AppDetail = {
    appId: "a",
    title: "Nulls",
    score: null,
    reviews: null,
    updated: null,
  };
  assert.equal(qualityScore(d), 4);
});

test("qualityScore: score above 5 clamps at 100", () => {
  const d: AppDetail = {
    appId: "a",
    title: "Over",
    score: 6.0,
    reviews: 100_000,
    updated: "Mar 3, 2025",
  };
  // (6/5)*70 = 84 + 20 + 10 = 114 -> clamp to 100
  assert.equal(qualityScore(d), 100);
});

test("qualityScore: unparseable updated string counts as stale", () => {
  const d: AppDetail = {
    appId: "a",
    title: "Weird date",
    score: 4.0,
    reviews: 0,
    updated: "recently",
  };
  // (4/5)*70 = 56 + 0 + 4 = 60
  assert.equal(qualityScore(d), 60);
});

// ---------------------------------------------------------------- gapMultiplier

test("gapMultiplier: hidden gem (great rating, few installs) scores high", () => {
  const d: AppDetail = {
    appId: "a",
    title: "Gem",
    score: 4.8,
    installs_num: 1000,
  };
  // ratingFactor = (4.8-3.5)/1.5 = 0.8667
  // obscurity = 1 - log10(1001)/9 = 0.6666
  // 1 + 4*0.8667*0.6666 = 3.3109...
  approx(gapMultiplier(d), 3.31094, 1e-4);
});

test("gapMultiplier: giant install base collapses the gap to 1", () => {
  const d: AppDetail = {
    appId: "a",
    title: "Giant",
    score: 4.5,
    installs_num: 1_000_000_000,
  };
  // obscurity -> ~0 (clamped), so 1 + 0 = 1
  approx(gapMultiplier(d), 1.0);
});

test("gapMultiplier: low rating never earns a gap, however obscure", () => {
  const d: AppDetail = {
    appId: "a",
    title: "Low rated",
    score: 2.0,
    installs_num: 10,
  };
  // ratingFactor = clamp((2-3.5)/1.5) = 0 -> 1 + 0 = 1
  assert.equal(gapMultiplier(d), 1.0);
});

test("gapMultiplier: boundary rating 3.5 gives no gap", () => {
  const d: AppDetail = {
    appId: "a",
    title: "Boundary",
    score: 3.5,
    installs_num: 10,
  };
  assert.equal(gapMultiplier(d), 1.0);
});

test("gapMultiplier: maxes at 5 for 5-star with ~zero installs", () => {
  const d: AppDetail = {
    appId: "a",
    title: "Tiny perfect",
    score: 5.0,
    installs_num: 0,
  };
  // ratingFactor = 1; obscurity = 1 - log10(1)/9 = 1 -> 1 + 4 = 5
  assert.equal(gapMultiplier(d), 5.0);
});

test("gapMultiplier: missing fields default to 1 (no NaN)", () => {
  const d: AppDetail = { appId: "a", title: "Empty" };
  assert.equal(gapMultiplier(d), 1.0);
});

// ---------------------------------------------------------------- marketScore

test("marketScore: reviews equal to median -> 83.33", () => {
  const d: AppDetail = { appId: "a", title: "Mid", reviews: 1000 };
  // ratio = log10(1001)/log10(1001) = 1 -> 50 + 50*1/1.5 = 83.333...
  approx(marketScore(d, 1000), 83.33333, 1e-4);
});

test("marketScore: hand-computed example", () => {
  const d: AppDetail = { appId: "a", title: "Busy", reviews: 10_000 };
  // ratio = log10(10001)/log10(1001) = 1.333155...
  // 50 + 50*1.333155/1.5 = 94.43850...
  approx(marketScore(d, 1000), 94.4385, 1e-4);
});

test("marketScore: zero reviews -> 50", () => {
  const d: AppDetail = { appId: "a", title: "No reviews", reviews: 0 };
  assert.equal(marketScore(d, 1000), 50);
});

test("marketScore: caps at 100 for huge review volume", () => {
  const d: AppDetail = { appId: "a", title: "Viral", reviews: 1_000_000_000 };
  assert.equal(marketScore(d, 1000), 100);
});

test("marketScore: non-positive median falls back to 1000", () => {
  const d: AppDetail = { appId: "a", title: "Busy", reviews: 10_000 };
  approx(marketScore(d, 0), marketScore(d, 1000));
  approx(marketScore(d, -5), marketScore(d, 1000));
});

test("marketScore: missing reviews treated as zero", () => {
  const d: AppDetail = { appId: "a", title: "Empty" };
  assert.equal(marketScore(d, 1000), 50);
});

// ---------------------------------------------------------------- competitionFactor

test("competitionFactor: 0 peers -> 1 (no competition)", () => {
  assert.equal(competitionFactor(0), 1);
});

test("competitionFactor: 100 peers -> 5.5", () => {
  assert.equal(competitionFactor(100), 5.5);
});

test("competitionFactor: 200+ peers saturate at 10", () => {
  assert.equal(competitionFactor(200), 10);
  assert.equal(competitionFactor(10_000), 10);
});

test("competitionFactor: negative peer count clamps to 1", () => {
  assert.equal(competitionFactor(-5), 1);
});

// ---------------------------------------------------------------- scoreApp

const gem: AppDetail = {
  appId: "com.example.gem",
  title: "Gem App",
  score: 4.5,
  reviews: 10_000,
  updated: "Jan 15, 2025",
  installs: "10K+",
  installs_num: 10_000,
  genre: "Productivity",
};

test("scoreApp: full end-to-end math", () => {
  const s = scoreApp(gem, 20, 1000);
  // q = 93
  // g (unrounded) = 2.48147...; breakdown rounds to 2.48
  // m (unrounded) = 94.43850...; breakdown rounds to 94.4
  // c = 1 + 9*(20/200) = 1.9
  // raw (unrounded inputs) = (93 * 2.48147^2 * 94.43850) / 1.9 = 28464.00...
  approx(s.breakdown.quality, 93.0);
  assert.equal(s.breakdown.gap, 2.48);
  assert.equal(s.breakdown.market, 94.4);
  approx(s.breakdown.competition, 1.9);
  approx(s.raw, 28464.0, 0.5);
  assert.equal(s.appId, "com.example.gem");
  assert.equal(s.title, "Gem App");
  assert.equal(s.rating, 4.5);
  assert.equal(s.installs, "10K+");
  assert.equal(s.reviews, 10_000);
  assert.equal(s.genre, "Productivity");
  // opportunity is left for rankApps to fill
  assert.equal(s.opportunity, 0);
});

test("scoreApp: rating rounded to 2 decimals", () => {
  const s = scoreApp({ ...gem, score: 4.3567 }, 20, 1000);
  assert.equal(s.rating, 4.36);
});

test("scoreApp: gap is squared, so a hidden gem beats a giant", () => {
  const giant: AppDetail = {
    ...gem,
    appId: "com.example.giant",
    title: "Giant App",
    installs_num: 1_000_000_000, // gap -> ~1
    reviews: 5_000_000, // stronger quality/market otherwise
  };
  const gemRaw = scoreApp(gem, 20, 1000).raw;
  const giantRaw = scoreApp(giant, 20, 1000).raw;
  assert.ok(gemRaw > giantRaw, `gem ${gemRaw} should beat giant ${giantRaw}`);
});

test("scoreApp: missing optional fields -> nulls, no NaN", () => {
  const s = scoreApp({ appId: "a", title: "Bare" }, 10, 1000);
  assert.equal(s.installs, null);
  assert.equal(s.genre, null);
  assert.equal(s.reviews, 0);
  assert.equal(s.rating, 0);
  assert.ok(Number.isFinite(s.raw), "raw must be finite");
});

test("scoreApp: deterministic — same input, same output", () => {
  const a = scoreApp(gem, 20, 1000);
  const b = scoreApp(gem, 20, 1000);
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------- rankApps

test("rankApps: empty list -> empty list", () => {
  assert.deepEqual(rankApps([]), []);
});

test("rankApps: best app gets opportunity 100, sorted best-first", () => {
  const ranked = rankApps([
    { ...gem, appId: "b", title: "Weaker", score: 3.2, installs_num: 50_000_000 },
    gem,
    { ...gem, appId: "c", title: "Worst", score: 2.5, reviews: 10, installs_num: 100_000_000 },
  ]);
  assert.equal(ranked.length, 3);
  assert.equal(ranked[0].appId, "com.example.gem");
  assert.equal(ranked[0].opportunity, 100);
  // strictly descending
  assert.ok(ranked[0].opportunity > ranked[1].opportunity);
  assert.ok(ranked[1].opportunity > ranked[2].opportunity);
});

test("rankApps: single app scores 100", () => {
  const [s] = rankApps([gem]);
  assert.equal(s.opportunity, 100);
});

test("rankApps: opportunity is relative within the scan", () => {
  const two = rankApps([gem, { ...gem, appId: "b", title: "Twin" }]);
  // identical apps -> both 100, relative scale has no meaning across scans
  assert.deepEqual(
    two.map((s) => s.opportunity),
    [100, 100]
  );
});

test("rankApps: passes the in-scan review median to marketScore", () => {
  // reviews sorted: [0, 1000, 1000000]; median index floor(3/2) = 1 -> 1000
  const details: AppDetail[] = [
    { ...gem, appId: "low", reviews: 0 },
    { ...gem, appId: "mid", reviews: 1000 },
    { ...gem, appId: "high", reviews: 1_000_000 },
  ];
  const ranked = rankApps(details);
  const mid = ranked.find((s) => s.appId === "mid")!;
  const direct = scoreApp({ ...gem, appId: "mid", reviews: 1000 }, 3, 1000);
  approx(mid.raw, direct.raw);
});

test("rankApps: zero-review apps don't produce NaN opportunities", () => {
  const ranked = rankApps([
    { appId: "a", title: "A" },
    { appId: "b", title: "B" },
  ]);
  for (const s of ranked) {
    assert.ok(Number.isFinite(s.opportunity), "opportunity must be finite");
  }
});

// ---------------------------------------------------------------- whyItScores

function scoredGem(): ScoredApp {
  return scoreApp(gem, 20, 1000);
}

test("whyItScores: names the app, rating, reviews and install base", () => {
  const text = whyItScores(scoredGem());
  assert.ok(text.includes("Gem App"), "mentions title");
  assert.ok(text.includes("4.5"), "mentions rating");
  assert.ok(text.includes("10,000"), "mentions review count");
  assert.ok(text.includes("10K+"), "mentions install base");
});

test("whyItScores: cites the actual drivers from the breakdown", () => {
  // gem breakdown: quality 93, gap 2.48, market 94.4, competition 1.9
  const text = whyItScores(scoredGem());
  assert.ok(text.includes("standout quality"), "quality driver");
  assert.ok(text.includes("a healthy market around it"), "market driver");
  assert.ok(text.includes("thin competition"), "competition driver");
  assert.ok(!text.includes("hidden gem"), "gap 2.48 < 3.5 -> not a hidden gem");
});

test("whyItScores: flags a real hidden gem and a crowded field", () => {
  const gemLike: ScoredApp = {
    ...scoredGem(),
    breakdown: { quality: 80, gap: 4.2, market: 80, competition: 8 },
  };
  const text = whyItScores(gemLike);
  assert.ok(text.includes("hidden gem"), "gap driver");
  assert.ok(text.includes("a crowded field"), "competition driver");
});

test("whyItScores: falls back to all-round signal with no strong drivers", () => {
  const bland: ScoredApp = {
    ...scoredGem(),
    breakdown: { quality: 50, gap: 2.0, market: 50, competition: 5 },
  };
  assert.ok(
    whyItScores(bland).includes("a solid all-round opportunity signal"),
    "fallback line"
  );
});

test("whyItScores: missing installs string uses small-base wording", () => {
  const text = whyItScores(scoreApp({ appId: "a", title: "Bare" }, 10, 1000));
  assert.ok(text.includes("with a small install base"));
});

test("whyItScores: always closes with the market-overtake line", () => {
  const text = whyItScores(scoredGem());
  assert.ok(
    text.includes(
      "High love, low distribution: exactly the kind of app a better-marketed competitor could overtake."
    )
  );
});
