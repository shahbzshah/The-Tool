/**
 * Shared scan pipeline (manual scans + watchlist cron). One place where a
 * scan's Play details become ranked opportunities + daily snapshots:
 *
 *  1. Legacy gap score (kept for transition transparency).
 *  2. Wedge audit + monetisation strip from the scan's own details.
 *  3. Velocity from snapshot history recorded BEFORE today's snapshot.
 *  4. Transparent composite score (replaces the gap score as `score`).
 *  5. Today's snapshot upsert (one row per app per day).
 *
 * Nothing here invents numbers: a component with no evidence is null
 * and excluded, and a first-seen app gets "collecting history" velocity.
 */

import { prisma } from "@/lib/db";
import { scoreApp, type AppDetail, type ScoredApp } from "./scoring";
import { auditWedge, type WedgeAudit } from "./wedge";
import { monetisationStrip, type MonetisationStrip } from "./monetisation";
import { computeVelocity, isRisingApp, type Velocity } from "./snapshots";
import { compositeScore, type CompositeResult } from "./composite";
import { fetchCategoryRanks } from "./scraper";
import { dayKey } from "./dates";

export interface RankedOpportunity {
  detail: AppDetail;
  legacy: ScoredApp;
  wedge: WedgeAudit;
  monetisation: MonetisationStrip;
  velocity: Velocity;
  composite: CompositeResult;
  isRising: boolean;
  categoryRank: number | null;
  summary: string;
}

/** Play `updated` (timestamp or string) -> storable date string. */
export function playUpdatedString(detail: AppDetail): string | null {
  const u = detail.updated;
  if (u == null || u === "") return null;
  if (typeof u === "number") {
    const ms = u < 1e12 ? u * 1000 : u;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return String(u);
}

function whyComposite(
  detail: AppDetail,
  legacy: ScoredApp,
  wedge: WedgeAudit,
  velocity: Velocity,
  strip: MonetisationStrip,
  isRising: boolean
): string {
  const parts: string[] = [];
  parts.push(
    `${detail.title} is rated ${(Number(detail.score ?? 0)).toFixed(1)}★ across ${Number(detail.reviews ?? 0).toLocaleString()} reviews`
  );
  parts.push(detail.installs ? ` with ${detail.installs} installs` : " with a small install base");
  if (velocity.hasHistory && velocity.perDay != null) {
    parts.push(
      `. Momentum: ${velocity.perDay.toFixed(1)} new ratings/day` +
        (velocity.delta30 != null ? ` (${velocity.delta30 >= 0 ? "+" : ""}${velocity.delta30} in the last 30 days)` : "") +
        "."
    );
  } else {
    parts.push(". Momentum: collecting history — velocity appears after the next scan.");
  }
  parts.push(
    ` Wedge for this keyword: ${wedge.wedgeScore}/100` +
      (wedge.smallAppInTop5 ? " (a small app already ranks top 5)" : "") +
      (wedge.branded ? " (branded keyword — one brand dominates it)" : "") +
      "."
  );
  parts.push(` ${strip.line}`);
  if (isRising) parts.push(" Flagged new & rising.");
  parts.push(
    " This is an opportunity to enter — not a predicted success: retention, active users, and real revenue are not visible in Play data."
  );
  void legacy;
  return parts.join("");
}

/**
 * Rank one scan's details. Reads prior snapshots (never today's, which
 * are recorded after ranking) and fetches one category chart at most.
 */
export async function rankScan(
  keyword: string,
  details: AppDetail[]
): Promise<RankedOpportunity[]> {
  if (!details.length) return [];

  // Prior snapshots for velocity (before today's snapshot is recorded).
  const appIds = details.map((d) => d.appId);
  let snapByApp = new Map<string, { day: string; ratingsCount: bigint | null; installsMin: bigint | null; categoryRank: number | null; score: number | null }[]>();
  try {
    const rows = await prisma.appSnapshot.findMany({
      where: { appId: { in: appIds } },
      orderBy: { day: "asc" },
      select: { appId: true, day: true, ratingsCount: true, installsMin: true, categoryRank: true, score: true },
    });
    for (const r of rows) {
      const list = snapByApp.get(r.appId) ?? [];
      list.push(r);
      snapByApp.set(r.appId, list);
    }
  } catch (err) {
    console.warn("[persistScan] snapshot lookup failed:", err);
  }

  // One category chart for the scan's dominant genre (best-effort).
  let rankMap: Map<string, number> | null = null;
  const genreCounts = new Map<string, number>();
  for (const d of details) {
    if (d.genreId) genreCounts.set(d.genreId, (genreCounts.get(d.genreId) ?? 0) + 1);
  }
  const topGenre = [...genreCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (topGenre) {
    rankMap = await fetchCategoryRanks(topGenre, 200);
  }

  // Legacy gap scores (transition transparency only).
  const reviews = details.map((d) => Number(d.reviews ?? 0)).sort((a, b) => a - b);
  const medianReviews = reviews.length ? reviews[Math.floor(reviews.length / 2)] : 1000;
  const legacyByApp = new Map<string, ScoredApp>();
  for (const d of details) {
    legacyByApp.set(d.appId, scoreApp(d, details.length, medianReviews));
  }
  const bestRaw = Math.max(...[...legacyByApp.values()].map((s) => s.raw)) || 1;
  for (const s of legacyByApp.values()) {
    s.opportunity = Math.round(((100 * s.raw) / bestRaw) * 10) / 10;
  }

  // Wedge audit from this scan's top 10 (search order = details order).
  const wedge = auditWedge(
    keyword,
    details.slice(0, 10).map((d) => ({
      appId: d.appId,
      title: d.title,
      rating: d.score != null ? Number(d.score) : null,
      reviewsCount: d.reviews != null ? Number(d.reviews) : null,
      installsMin: d.installs_num != null ? Number(d.installs_num) : null,
    }))
  );

  const ranked: RankedOpportunity[] = details.map((d) => {
    const velocity = computeVelocity(snapByApp.get(d.appId) ?? []);
    const rising = isRisingApp(velocity);
    const legacy = legacyByApp.get(d.appId)!;
    // Monetisation strip is per app (its own flags) + the niche-level
    // top-10 fraction, which is the same for every app in this scan.
    const strip = monetisationStrip(d, details);
    const composite = compositeScore({
      medianRatings: wedge.medianRatings,
      wedge,
      mining: null, // review mining runs at evidence time, not scan time
      recentDelta: null,
      velocity,
      ageDays: velocity.ageDays,
      monetisation: strip,
      playUpdated: d.updated,
      ratingsCount: d.reviews != null ? Number(d.reviews) : null,
      reviewSample: 0,
      snapshotDays: (snapByApp.get(d.appId) ?? []).length,
      legacyGapScore: legacy.opportunity,
    });
    return {
      detail: d,
      legacy,
      wedge,
      monetisation: strip,
      velocity,
      composite,
      isRising: rising,
      categoryRank: rankMap?.get(d.appId) ?? null,
      summary: "",
    };
  });
  for (const r of ranked) {
    r.summary = whyComposite(
      r.detail,
      r.legacy,
      r.wedge,
      r.velocity,
      r.monetisation,
      r.isRising
    );
  }
  ranked.sort((a, b) => b.composite.score - a.composite.score);
  return ranked;
}

/**
 * Record today's snapshot for every scanned app. Upsert on [appId, day]:
 * re-scans on the same day refresh the row instead of duplicating it.
 * Best-effort — snapshot failure must never break a scan.
 */
export async function recordSnapshots(
  ranked: RankedOpportunity[],
  keyword: string
): Promise<void> {
  if (!ranked.length) return;
  const day = dayKey();
  try {
    for (const r of ranked) {
      const d = r.detail;
      const ratings = d.reviews != null ? BigInt(Math.floor(Number(d.reviews))) : null;
      const installsMin =
        d.installs_num != null && Number(d.installs_num) > 0
          ? BigInt(Math.floor(Number(d.installs_num)))
          : null;
      await prisma.appSnapshot.upsert({
        where: { appId_day: { appId: d.appId, day } },
        create: {
          appId: d.appId,
          day,
          ratingsCount: ratings,
          score: d.score != null ? Number(d.score) : null,
          installs: d.installs ?? null,
          installsMin,
          playUpdated: playUpdatedString(d),
          categoryRank: r.categoryRank,
          keyword,
        },
        update: {
          ratingsCount: ratings,
          score: d.score != null ? Number(d.score) : null,
          installs: d.installs ?? null,
          installsMin,
          playUpdated: playUpdatedString(d),
          categoryRank: r.categoryRank,
          keyword,
        },
      });
    }
  } catch (err) {
    console.warn("[persistScan] snapshot recording failed:", err);
  }
}
