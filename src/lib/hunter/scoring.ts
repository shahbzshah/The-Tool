/**
 * Opportunity scoring: deterministic, explainable, no AI needed.
 *
 * The core thesis: an underrated app = high quality + low distribution.
 * The score surfaces apps whose ratings say "great" but whose install
 * counts say "nobody found it yet".
 *
 *     opportunity = (quality x gap^2 x market) / competition   (0-100 scale)
 *
 * Ported from the Opportunity Hunter Python service (scoring.py).
 * Pure functions — the same app always scores the same.
 */

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export interface AppDetail {
  appId: string;
  title: string;
  score?: number | null;
  reviews?: number | null;
  updated?: string | null;
  installs?: string | null;
  installs_num?: number | null;
  genre?: string | null;
  genreId?: string | null;
}

export interface ScoredApp {
  appId: string;
  title: string;
  rating: number;
  installs: string | null;
  reviews: number;
  genre: string | null;
  raw: number;
  opportunity: number;
  breakdown: {
    quality: number;
    gap: number;
    market: number;
    competition: number;
  };
}

/** 0-100. Rating weight 70, review volume 20, recency 10. */
export function qualityScore(detail: AppDetail): number {
  const rating = Number(detail.score ?? 0);
  const reviews = Number(detail.reviews ?? 0);
  let q = (rating / 5.0) * 70.0;
  q += clamp(reviews / 5000.0, 0.0, 1.0) * 20.0;
  q += updatedRecently(String(detail.updated ?? "")) ? 10.0 : 4.0;
  return clamp(q, 0.0, 100.0);
}

function updatedRecently(updated: string): boolean {
  // "updated" looks like "Mar 12, 2024". Cheap check: year >= 2024.
  const m = updated.match(/(19|20)\d{2}/);
  return !!m && parseInt(m[0], 10) >= 2024;
}

/** 1-5. High rating + low installs => big gap (hidden gem). */
export function gapMultiplier(detail: AppDetail): number {
  const rating = Number(detail.score ?? 0);
  const installs = Number(detail.installs_num ?? 0);
  const ratingFactor = clamp((rating - 3.5) / 1.5, 0.0, 1.0);
  // installs on a log scale: 10 installs -> ~1.0, 1B installs -> 0.0
  const obscurity = clamp(1.0 - Math.log10(installs + 1) / 9.0, 0.0, 1.0);
  return clamp(1.0 + 4.0 * ratingFactor * obscurity, 1.0, 5.0);
}

/** 0-100. Bigger review volume in the niche => bigger market. */
export function marketScore(detail: AppDetail, peerReviewsMedian = 1000.0): number {
  const reviews = Number(detail.reviews ?? 0);
  const median = peerReviewsMedian <= 0 ? 1000.0 : peerReviewsMedian;
  const ratio = Math.log10(reviews + 1) / Math.log10(median + 1);
  return clamp(50.0 + (50.0 * clamp(ratio, 0.0, 1.5)) / 1.5, 0.0, 100.0);
}

/** 1-10. More apps found for the keyword => more saturated. */
export function competitionFactor(nPeers: number): number {
  return clamp(1.0 + 9.0 * clamp(nPeers / 200.0, 0.0, 1.0), 1.0, 10.0);
}

/**
 * Score one app. The gap multiplier is squared: a hidden gem (great rating,
 * few installs) must beat an incumbent giant, and a linear gap can't do that
 * against their quality/market advantage. `raw` is kept so callers can
 * normalize relatively within a scan.
 */
export function scoreApp(
  detail: AppDetail,
  nPeers: number,
  peerReviewsMedian = 1000.0
): ScoredApp {
  const q = qualityScore(detail);
  const g = gapMultiplier(detail);
  const m = marketScore(detail, peerReviewsMedian);
  const c = competitionFactor(nPeers);
  const raw = (q * g * g * m) / c;
  return {
    appId: detail.appId,
    title: detail.title,
    rating: Math.round(Number(detail.score ?? 0) * 100) / 100,
    installs: detail.installs ?? null,
    reviews: Number(detail.reviews ?? 0),
    genre: detail.genre ?? null,
    raw,
    opportunity: 0.0, // filled in by rankApps (relative scale)
    breakdown: {
      quality: Math.round(q * 10) / 10,
      gap: Math.round(g * 100) / 100,
      market: Math.round(m * 10) / 10,
      competition: Math.round(c * 100) / 100,
    },
  };
}

/**
 * Score every app and return them sorted by opportunity, best first.
 * Opportunity is relative: 100 x raw / best raw in this scan. Scores
 * compare apps within one scan, not across scans.
 */
export function rankApps(details: AppDetail[]): ScoredApp[] {
  if (!details.length) return [];
  const reviews = details
    .map((d) => Number(d.reviews ?? 0))
    .sort((a, b) => a - b);
  const median = reviews.length ? reviews[Math.floor(reviews.length / 2)] : 1000.0;
  const scored = details.map((d) => scoreApp(d, details.length, median));
  const best = Math.max(...scored.map((s) => s.raw)) || 1.0;
  for (const s of scored) {
    s.opportunity = Math.round((100.0 * s.raw) / best * 10) / 10;
  }
  return scored.sort((a, b) => b.opportunity - a.opportunity);
}

/**
 * One-paragraph "Why it scores" narrative for an opportunity — the same
 * explanation the old Hunter detail page showed under the score.
 */
export function whyItScores(s: ScoredApp): string {
  const parts: string[] = [];
  parts.push(
    `${s.title} is rated ${s.rating.toFixed(1)}★ across ${s.reviews.toLocaleString()} reviews`
  );
  parts.push(
    s.installs ? `with only ${s.installs} installs` : "with a small install base"
  );
  const b = s.breakdown;
  const drivers: string[] = [];
  if (b.quality >= 70) drivers.push("standout quality");
  if (b.gap >= 70) drivers.push("a wide gap between its rating and its reach");
  if (b.market >= 70) drivers.push("a healthy market around it");
  if (b.competition <= 30) drivers.push("thin competition");
  if (drivers.length) {
    parts.push(` — the score comes from ${drivers.join(", ")}.`);
  } else {
    parts.push(" — a solid all-round opportunity signal.");
  }
  parts.push(
    "High love, low distribution: exactly the kind of app a better-marketed competitor could overtake."
  );
  return parts.join("");
}
