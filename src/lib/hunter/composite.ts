/**
 * Transparent composite score (plan item 2). Replaces the single gap
 * score (high rating × low installs) as the opportunity's score.
 *
 * Six components, each 0–100 or null when its evidence is missing.
 * Missing components are EXCLUDED and the weights renormalise — a
 * missing signal lowers confidence, it never scores 0 and never gets
 * guessed. Weights are published in-app ("How this score works").
 *
 * DEFERRED BY PLAN (do not build here): ad intelligence, SDK analysis,
 * demographics, revenue modelling. See evidence.ts header.
 */

import type { WedgeAudit } from "./wedge";
import type { Velocity } from "./snapshots";
import type { ReviewMining } from "./reviewMining";
import type { MonetisationStrip } from "./monetisation";
import { daysSince, parsePlayDate } from "./dates";

/** Published weights — shown verbatim in the UI. */
export const COMPOSITE_WEIGHTS = {
  demand: 20,
  wedge: 25,
  vulnerability: 20,
  momentum: 15,
  monetisation: 10,
  freshness: 10,
} as const;

export type ComponentKey = keyof typeof COMPOSITE_WEIGHTS;

export type Confidence = "High" | "Medium" | "Low";

export interface CompositeResult {
  /** Weighted sum over available components, 0–100. */
  score: number;
  components: Partial<Record<ComponentKey, number>>;
  /** Components that had no evidence (excluded, not zeroed). */
  missing: ComponentKey[];
  confidence: Confidence;
  /** Why this confidence band, in one line. */
  confidenceNote: string;
  /** The old gap-based score, kept for transition transparency. */
  legacyGapScore: number | null;
}

function clamp100(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v * 10) / 10));
}

export function demandComponent(medianRatings: number | null): number | null {
  if (medianRatings == null || medianRatings <= 0) return null;
  // log scale: 100 ratings -> 40, 1K -> 60, 10K -> 80, 100K -> 100.
  return clamp100((100 * Math.log10(medianRatings + 1)) / 5);
}

export function wedgeComponent(wedge: WedgeAudit | null): number | null {
  return wedge ? wedge.wedgeScore : null;
}

export function vulnerabilityComponent(
  mining: ReviewMining | null,
  recentDelta: number | null
): number | null {
  if (mining && mining.lowStar >= 10 && mining.themes.length > 0) {
    // Weighted complaint rate: share of low-star reviews coded to themes,
    // severity-weighted. A niche where everyone complains about fixable
    // things is vulnerable; a quiet niche is not.
    const weighted = mining.themes.reduce((s, t) => s + t.weighted, 0);
    const rate = weighted / (mining.lowStar * 3);
    return clamp100(40 + 60 * Math.min(1, rate));
  }
  // Fallback: deteriorating recent rating = vulnerable incumbent.
  if (recentDelta != null) {
    if (recentDelta <= -0.3) return 70;
    if (recentDelta <= -0.1) return 55;
    return 40;
  }
  return null;
}

export function momentumComponent(
  v: Velocity | null,
  ageDays: number | null
): number | null {
  if (!v || !v.hasHistory || v.perDay == null) return null;
  const monthly = v.perDay * 30;
  let m = (100 * Math.log10(monthly + 1)) / 4;
  if (v.acceleration != null) m += v.acceleration > 0 ? 10 : -10;
  // Old + flat is the classic gap-score false positive: cap it.
  if (ageDays != null && ageDays > 730 && monthly < 10) m = Math.min(m, 30);
  return clamp100(m);
}

export function monetisationComponent(
  strip: MonetisationStrip | null
): number | null {
  if (!strip || strip.top10MonetisedCount == null || strip.top10Count === 0) {
    return null;
  }
  return clamp100((strip.top10MonetisedCount / strip.top10Count) * 100);
}

export function freshnessComponent(
  playUpdated: string | number | null | undefined
): number | null {
  const d = parsePlayDate(playUpdated);
  const days = daysSince(d);
  if (days == null) return null;
  if (days <= 90) return 90;
  if (days <= 180) return 70;
  if (days <= 365) return 50;
  if (days <= 730) return 30;
  return 15;
}

export function confidenceBand(args: {
  ratingsCount: number | null;
  reviewSample: number;
  snapshotDays: number;
}): { confidence: Confidence; note: string } {
  const { ratingsCount, reviewSample, snapshotDays } = args;
  if (
    (ratingsCount ?? 0) >= 1000 &&
    reviewSample >= 100 &&
    snapshotDays >= 7
  ) {
    return {
      confidence: "High",
      note: "High evidence: 1,000+ ratings, 100+ sampled reviews, 7+ days of snapshots.",
    };
  }
  if (
    (ratingsCount ?? 0) >= 100 &&
    (reviewSample >= 30 || snapshotDays >= 3)
  ) {
    return {
      confidence: "Medium",
      note: "Medium evidence: some ratings and review/snapshot history, but thin in places.",
    };
  }
  return {
    confidence: "Low",
    note: "Low evidence: small rating base or little history yet — treat the score as a lead, not a verdict.",
  };
}

export function compositeScore(args: {
  medianRatings: number | null;
  wedge: WedgeAudit | null;
  mining: ReviewMining | null;
  recentDelta: number | null;
  velocity: Velocity | null;
  ageDays: number | null;
  monetisation: MonetisationStrip | null;
  playUpdated: string | number | null | undefined;
  ratingsCount: number | null;
  reviewSample: number;
  snapshotDays: number;
  legacyGapScore: number | null;
}): CompositeResult {
  const computed: Partial<Record<ComponentKey, number>> = {
    demand: demandComponent(args.medianRatings) ?? undefined,
    wedge: wedgeComponent(args.wedge) ?? undefined,
    vulnerability: vulnerabilityComponent(args.mining, args.recentDelta) ?? undefined,
    momentum: momentumComponent(args.velocity, args.ageDays) ?? undefined,
    monetisation: monetisationComponent(args.monetisation) ?? undefined,
    freshness: freshnessComponent(args.playUpdated) ?? undefined,
  };
  const components: Partial<Record<ComponentKey, number>> = {};
  const missing: ComponentKey[] = [];
  for (const k of Object.keys(COMPOSITE_WEIGHTS) as ComponentKey[]) {
    const v = computed[k];
    if (v == null) missing.push(k);
    else components[k] = v;
  }
  let weightSum = 0;
  let scoreSum = 0;
  for (const k of Object.keys(components) as ComponentKey[]) {
    weightSum += COMPOSITE_WEIGHTS[k];
    scoreSum += COMPOSITE_WEIGHTS[k] * (components[k] as number);
  }
  const score = weightSum > 0 ? clamp100(scoreSum / weightSum) : 0;
  const { confidence, note } = confidenceBand({
    ratingsCount: args.ratingsCount,
    reviewSample: args.reviewSample,
    snapshotDays: args.snapshotDays,
  });
  return {
    score,
    components,
    missing,
    confidence,
    confidenceNote: note,
    legacyGapScore: args.legacyGapScore,
  };
}
