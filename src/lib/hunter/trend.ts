/**
 * 90-day trend slope (plan item 10). Two real, free signals, combined:
 *
 *  1. Play rating-velocity acceleration (Δ30 vs prior Δ30) from snapshots.
 *  2. Hacker News discussion velocity for the keyword (Algolia counts:
 *     stories in the last 90 days vs the 90 days before).
 *
 * A single-day spike is noise; a 90-day slope is signal. The slope is
 * shown as a small dated sparkline of snapshot ratings counts, never as
 * a bare number.
 *
 * Google Trends is NOT wired here: the unofficial clients are archived
 * (pytrends) or flaky, and the official API is application-gated. The
 * slope ships from Play + HN data; Trends is a follow-up, not a blocker.
 * Reddit is deliberately NOT a core dependency (approval/commercial risk).
 */

import type { Velocity } from "./snapshots";

export type TrendDirection = "rising" | "flat" | "falling" | "unknown";

export interface TrendSlope {
  direction: TrendDirection;
  /** Play acceleration (ratings Δ30 minus prior Δ30), or null. */
  playAcceleration: number | null;
  /** HN stories mentioning the keyword, last 90 days. */
  hnRecent: number | null;
  /** HN stories mentioning the keyword, prior 90 days. */
  hnPrior: number | null;
  /** (recent − prior) / max(prior, 1), or null when HN failed. */
  hnSlope: number | null;
  note: string;
}

async function hnCount(
  keyword: string,
  fromSec: number,
  toSec: number
): Promise<number | null> {
  try {
    const params = new URLSearchParams({
      query: keyword,
      tags: "story",
      hitsPerPage: "1",
      numericFilters: `created_at_i>${fromSec},created_at_i<=${toSec}`,
    });
    const res = await fetch(`https://hn.algolia.com/api/v1/search?${params}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.nbHits === "number" ? data.nbHits : null;
  } catch {
    return null;
  }
}

export async function trendSlope(
  keyword: string,
  velocity: Velocity | null
): Promise<TrendSlope> {
  const now = Math.floor(Date.now() / 1000);
  const d90 = 90 * 86400;
  const [recent, prior] = await Promise.all([
    hnCount(keyword, now - d90, now),
    hnCount(keyword, now - 2 * d90, now - d90),
  ]);
  const hnSlope =
    recent != null && prior != null ? (recent - prior) / Math.max(prior, 1) : null;
  const acc = velocity?.acceleration ?? null;

  // Direction: both signals agree, or the one available signal decides.
  // HN slope > +0.5 = rising discussion; Play acceleration > 0 = rising app.
  let direction: TrendDirection = "unknown";
  const hnDir =
    hnSlope == null ? 0 : hnSlope > 0.5 ? 1 : hnSlope < -0.5 ? -1 : 0;
  const playDir = acc == null ? 0 : acc > 0 ? 1 : acc < 0 ? -1 : 0;
  const sum = hnDir + playDir;
  if (sum > 0) direction = "rising";
  else if (sum < 0) direction = "falling";
  else if (hnSlope != null || acc != null) direction = "flat";

  const parts: string[] = [];
  if (acc != null) {
    parts.push(
      acc > 0
        ? `Play rating velocity is accelerating (+${acc} ratings vs the prior 30 days)`
        : acc < 0
          ? `Play rating velocity is slowing (${acc} ratings vs the prior 30 days)`
          : "Play rating velocity is flat vs the prior 30 days"
    );
  }
  if (recent != null && prior != null) {
    parts.push(
      `Hacker News mentions of "${keyword}": ${recent} stories in the last 90 days vs ${prior} in the 90 days before`
    );
  }
  if (parts.length === 0) {
    parts.push(
      "No trend history yet — the slope appears once snapshots and discussion data accumulate."
    );
  }
  parts.push(
    "Google Trends is not connected yet (follow-up); this slope uses Play velocity + Hacker News discussion only."
  );
  return {
    direction,
    playAcceleration: acc,
    hnRecent: recent,
    hnPrior: prior,
    hnSlope,
    note: parts.join(". ") + ".",
  };
}
