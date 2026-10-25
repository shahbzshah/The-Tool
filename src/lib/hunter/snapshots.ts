/**
 * Snapshot history + velocity arithmetic (plan item 1, 5, 11).
 *
 * Snapshots are one row per app per UTC day (see AppSnapshot). Everything
 * here is pure arithmetic over rows the caller fetched — no network, no
 * invented numbers. When history is too short, every velocity field is
 * null and the UI must say "collecting history", never a fake number.
 */

import { dayKey, shiftDay } from "./dates";

export interface SnapshotRow {
  day: string;
  ratingsCount: bigint | number | null;
  installsMin: bigint | number | null;
  categoryRank: number | null;
  score: number | null;
}

export interface Velocity {
  /** Ratings/day over the covered window, or null when uncomputable. */
  perDay: number | null;
  /** Ratings-count change over the last ~30 days (null if no window). */
  delta30: number | null;
  /** Ratings-count change over the last ~7 days (null if no window). */
  delta7: number | null;
  /** Days the velocity window actually covers (0 = no history). */
  daysCovered: number;
  /** True once at least one earlier snapshot exists to compare against. */
  hasHistory: boolean;
  /** Δ30 minus the Δ30 before it (null until ~60 days of history). */
  acceleration: number | null;
  /** Install-bracket upward crossings seen in the history. */
  bracketCrossings: number;
  /** Age in days since the first snapshot (null when first seen today). */
  ageDays: number | null;
  /** Category-rank move over the last ~7 days (negative = climbed). */
  rankMove7d: number | null;
  /** True when the app moved 10+ chart positions in a week. */
  rankAlert: boolean;
}

const BRACKET_LADDER = [
  10, 50, 100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000,
  5000000, 10000000, 50000000, 100000000, 500000000, 1000000000,
];

function toNum(v: bigint | number | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pick the snapshot closest to (but not after) a target day. Returns null
 * when the only snapshots are newer than the target.
 */
function atOrBefore(rows: SnapshotRow[], targetDay: string): SnapshotRow | null {
  let best: SnapshotRow | null = null;
  for (const r of rows) {
    if (r.day <= targetDay && (!best || r.day > best.day)) best = r;
  }
  return best;
}

export function computeVelocity(rowsIn: SnapshotRow[]): Velocity {
  const rows = [...rowsIn].sort((a, b) => (a.day < b.day ? -1 : 1));
  const empty: Velocity = {
    perDay: null,
    delta30: null,
    delta7: null,
    daysCovered: 0,
    hasHistory: false,
    acceleration: null,
    bracketCrossings: 0,
    ageDays: null,
    rankMove7d: null,
    rankAlert: false,
  };
  if (rows.length === 0) return empty;

  const latest = rows[rows.length - 1];
  const latestRatings = toNum(latest.ratingsCount);
  const first = rows[0];
  const ageDays =
    first.day === latest.day
      ? 0
      : Math.round(
          (new Date(`${latest.day}T00:00:00Z`).getTime() -
            new Date(`${first.day}T00:00:00Z`).getTime()) /
            86_400_000
        );

  // Bracket crossings: count upward moves across the standard Play ladder.
  let bracketCrossings = 0;
  let prevBracket = -1;
  for (const r of rows) {
    const installs = toNum(r.installsMin);
    if (installs == null) continue;
    const bracket = BRACKET_LADDER.filter((b) => installs >= b).length;
    if (prevBracket >= 0 && bracket > prevBracket) {
      bracketCrossings += bracket - prevBracket;
    }
    prevBracket = bracket;
  }

  // Rank move over the last ~7 days (rank numbers: lower = better, so a
  // negative move means the app climbed).
  let rankMove7d: number | null = null;
  const weekAgo = atOrBefore(rows, shiftDay(latest.day, -7));
  if (
    weekAgo &&
    weekAgo.categoryRank != null &&
    latest.categoryRank != null &&
    weekAgo.day !== latest.day
  ) {
    rankMove7d = latest.categoryRank - weekAgo.categoryRank;
  }

  if (rows.length < 2 || latestRatings == null) {
    return {
      ...empty,
      hasHistory: rows.length >= 1,
      bracketCrossings,
      ageDays,
      rankMove7d,
      rankAlert: rankMove7d != null && Math.abs(rankMove7d) >= 10,
    };
  }

  // Windowed deltas: compare against the snapshot nearest each target day.
  // When history is shorter than the window, use the earliest snapshot and
  // report the days actually covered — never stretch a 3-day delta into a
  // "30-day" number.
  function deltaFor(daysBack: number): { delta: number; covered: number } | null {
    const base = atOrBefore(rows, shiftDay(latest.day, -daysBack));
    if (!base || base.day === latest.day) return null;
    const baseRatings = toNum(base.ratingsCount);
    if (baseRatings == null) return null;
    const covered = Math.round(
      (new Date(`${latest.day}T00:00:00Z`).getTime() -
        new Date(`${base.day}T00:00:00Z`).getTime()) /
        86_400_000
    );
    if (covered <= 0) return null;
    // latestRatings is proven non-null by the early return above; the
    // closure just can't see that narrowing, so assert it here.
    return { delta: (latestRatings as number) - baseRatings, covered };
  }

  const d30 = deltaFor(30);
  const d7 = deltaFor(7);
  const perDay = d30
    ? d30.delta / d30.covered
    : d7
      ? d7.delta / d7.covered
      : null;

  // Acceleration: this Δ30 vs the Δ30 before it (needs ~60 days).
  let acceleration: number | null = null;
  if (d30) {
    const mid = atOrBefore(rows, shiftDay(latest.day, -30));
    const prior = mid ? atOrBefore(rows, shiftDay(mid.day, -30)) : null;
    if (mid && prior && prior.day !== mid.day) {
      const midRatings = toNum(mid.ratingsCount);
      const priorRatings = toNum(prior.ratingsCount);
      if (midRatings != null && priorRatings != null) {
        acceleration = d30.delta - (midRatings - priorRatings);
      }
    }
  }

  return {
    perDay,
    delta30: d30 ? d30.delta : null,
    delta7: d7 ? d7.delta : null,
    daysCovered: d30 ? d30.covered : d7 ? d7.covered : 0,
    hasHistory: true,
    acceleration,
    bracketCrossings,
    ageDays,
    rankMove7d,
    rankAlert: rankMove7d != null && Math.abs(rankMove7d) >= 10,
  };
}

/**
 * "New & rising" badge rule (plan item 5): young (first seen < 18 months
 * ago) AND moving — accelerating, or crossing install brackets, or a
 * healthy 30-day delta. Old, flat, high-rating apps are exactly what the
 * old gap score over-ranked, so they never get this badge.
 */
export function isRisingApp(v: Velocity): boolean {
  if (!v.hasHistory || v.ageDays == null) return false;
  if (v.ageDays > 540) return false;
  if (v.acceleration != null && v.acceleration > 0) return true;
  if (v.bracketCrossings >= 1 && (v.delta30 ?? 0) > 0) return true;
  if ((v.delta30 ?? 0) > 0 && v.perDay != null && v.perDay > 0) return true;
  return false;
}

/** Today-key helper for snapshot upserts. */
export function todayKey(): string {
  return dayKey();
}
