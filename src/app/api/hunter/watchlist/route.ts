import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scanKeyword } from "@/lib/hunter/scraper";
import {
  rankScan,
  recordSnapshots,
  playUpdatedString,
  type RankedOpportunity,
} from "@/lib/hunter/persistScan";
import { COMPOSITE_WEIGHTS } from "@/lib/hunter/composite";
import { loadWatchlistKeywords } from "@/lib/hunter/watchlist-keywords";
import { requireUser } from "@/lib/auth";
import { sweepStaleJobs } from "@/lib/scan-jobs";
import { getSetting, setSetting, normalizePublicKeyPem } from "@/lib/settings";
import {
  timingSafeEqual,
} from "crypto";
import { verifyCronAuth } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/hunter/watchlist — run the daily automatic watchlist scans.
 * Runs one scan per seed keyword for every user, skipping keywords already
 * scanned in the last 20 hours. Keywords are user-editable in Settings /
 * the Hunter dashboard and fall back to the hardcoded defaults.
 */

/**
 * Parse the numeric floor out of a Play Store installs string like
 * "5,000,000+" (→ 5000000n). The "+" means "at least", so the parsed
 * number is the floor. Returns null when there is no parseable number.
 */
function parseInstallsMin(installs: string | null | undefined): bigint | null {
  if (!installs) return null;
  const digits = installs.replace(/[^\d]/g, "");
  if (!digits) return null;
  return BigInt(digits);
}

/** Record the outcome of a watchlist run so GET can report it. */
async function recordLastRun(ok: boolean, error?: string): Promise<void> {
  try {
    const payload: { ok: boolean; at: string; error?: string } = {
      ok,
      at: new Date().toISOString(),
    };
    if (error) payload.error = error;
    await setSetting("WATCHLIST_LAST_RUN", JSON.stringify(payload));
  } catch (err) {
    // Run logging must never take down the scan itself.
    console.error("[watchlist] recordLastRun failed:", err instanceof Error ? err.message : err);
  }
}

export async function POST(req: Request) {
  // Read the raw body once: it feeds both the signature check (body-bound
  // format hashes the exact bytes) and the keyword parsing below.
  const rawBody = await req.text();

  if (!(await verifyCronAuth(req, rawBody))) {
    await recordLastRun(false, "Unauthorized");
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await sweepStaleJobs();

  const users = await prisma.user.findMany({ select: { id: true } });
  if (!users.length) {
    await recordLastRun(true);
    return NextResponse.json({ ok: true, scanned: 0, note: "no users yet" });
  }

  // Effective keywords: custom setting if the user edited it, else defaults.
  const effectiveKeywords = await loadWatchlistKeywords();

  // Optional body { keywords: [...] } to scan only a batch — the daily cron
  // calls the endpoint in batches so no single invocation exceeds the
  // function time limit. The batch filters against the effective list.
  let keywords = effectiveKeywords;
  const trimmed = rawBody.trim();
  if (trimmed) {
    try {
      const body = JSON.parse(trimmed);
      if (Array.isArray(body?.keywords) && body.keywords.length > 0) {
        const wanted = new Set(body.keywords.map((k: unknown) => String(k)));
        keywords = effectiveKeywords.filter((k) => wanted.has(k));
        if (!keywords.length) {
          await recordLastRun(false, "No matching keywords");
          return NextResponse.json({ error: "No matching keywords." }, { status: 400 });
        }
      }
    } catch {
      // no body — scan all
    }
  }

  const since = new Date(Date.now() - 20 * 3600 * 1000);
  let scanned = 0;
  const errors: string[] = [];

  for (const user of users) {
    for (const keyword of keywords) {
      try {
        const recent = await prisma.scanJob.findFirst({
          where: { userId: user.id, keyword, createdAt: { gte: since } },
        });
        if (recent) continue;

        const job = await prisma.scanJob.create({
          data: {
            keyword,
            status: "running",
            startedAt: new Date(),
            userId: user.id,
          },
        });

        try {
          const details = await scanKeyword(keyword, 30, 20);
          const ranked = await rankScan(keyword, details);
          // Dedupe: re-scanning a keyword must not create duplicate rows for
          // the same app. Update the existing opportunity (fresh score,
          // re-link to this job) instead, preserving the user's bookmark.
          const toRow = (s: RankedOpportunity) => ({
            appId: s.detail.appId,
            title: s.detail.title,
            rating: s.detail.score != null ? Number(s.detail.score) : null,
            installs: s.detail.installs ?? null,
            installsMin: parseInstallsMin(s.detail.installs),
            reviewsCount: BigInt(Number(s.detail.reviews ?? 0)),
            score: s.composite.score,
            category: s.detail.genre ?? null,
            summary: s.summary,
            thumbnail: s.detail.icon ?? null,
            url: `https://play.google.com/store/apps/details?id=${s.detail.appId}`,
            breakdown: JSON.stringify({
              legacy: { ...s.legacy.breakdown, opportunity: s.legacy.opportunity },
              legacyGapScore: s.legacy.opportunity,
              composite: {
                score: s.composite.score,
                components: s.composite.components,
                weights: COMPOSITE_WEIGHTS,
                confidence: s.composite.confidence,
                confidenceNote: s.composite.confidenceNote,
                missing: s.composite.missing,
              },
              wedge: s.wedge,
              velocity: s.velocity,
              isRising: s.isRising,
            }),
            offersIap: s.detail.offersIAP ?? null,
            containsAds: s.detail.adSupported ?? null,
            priceText: s.detail.priceText ?? null,
            playUpdated: playUpdatedString(s.detail),
            velocityPerDay: s.velocity.perDay,
            deltaRatings30: s.velocity.delta30,
            isRising: s.isRising,
          });
          // Dedupe ranked by appId first (scraper can return the same app twice).
          const seenWl = new Set<string>();
          const uniqueRankedWl = ranked.filter((s) => {
            if (seenWl.has(s.detail.appId)) return false;
            seenWl.add(s.detail.appId);
            return true;
          });
          const existing = await prisma.opportunity.findMany({
            where: {
              appId: { in: uniqueRankedWl.map((s) => s.detail.appId) },
              scanJob: { userId: user.id, keyword },
            },
            select: { id: true, appId: true },
          });
          // Collapse duplicate existing rows per appId to avoid P2002.
          const existingIds = new Map<string, string>();
          const dupIdsWl: string[] = [];
          for (const e of existing) {
            if (existingIds.has(e.appId)) dupIdsWl.push(e.id);
            else existingIds.set(e.appId, e.id);
          }
          if (dupIdsWl.length > 0) {
            await prisma.opportunityAnalysis.deleteMany({ where: { opportunityId: { in: dupIdsWl } } });
            await prisma.opportunity.deleteMany({ where: { id: { in: dupIdsWl } } });
          }
          const creates: ({ scanJobId: string } & ReturnType<typeof toRow>)[] = [];
          for (const s of uniqueRankedWl) {
            const data = { scanJobId: job.id, ...toRow(s) };
            const id = existingIds.get(s.detail.appId);
            if (id) {
              await prisma.opportunity.update({ where: { id }, data });
            } else {
              creates.push(data);
            }
          }
          if (creates.length > 0) {
            await prisma.opportunity.createMany({ data: creates });
          }
          // Today's snapshot + score history for the sparkline.
          // Best-effort — history recording must never break a scan.
          await recordSnapshots(uniqueRankedWl, keyword);
          try {
            await prisma.opportunityScoreHistory.createMany({
              data: uniqueRankedWl.map((s) => ({
                userId: user.id,
                appId: s.detail.appId,
                score: s.composite.score,
                scanJobId: job.id,
              })),
            });
          } catch (histErr) {
            console.warn(`[watchlist] score history recording failed for ${keyword}:`, histErr);
          }
          await prisma.scanJob.update({
            where: { id: job.id },
            data: {
              status: "completed",
              resultsCount: ranked.length,
              finishedAt: new Date(),
            },
          });
          scanned++;
        } catch (err) {
          await prisma.scanJob.update({
            where: { id: job.id },
            data: {
              status: "failed",
              error: err instanceof Error ? err.message : "Scan failed",
              finishedAt: new Date(),
            },
          });
          errors.push(`${keyword}: ${err instanceof Error ? err.message : "failed"}`);
        }
      } catch (err) {
        errors.push(`${keyword}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }
  }

  const ok = errors.length === 0;
  await recordLastRun(ok, ok ? undefined : errors[0]);
  return NextResponse.json({ ok: true, scanned, errors: errors.slice(0, 10) });
}

/**
 * GET /api/hunter/watchlist — report the outcome of the most recent
 * watchlist run. Signed-in users only; lastRun is null if none recorded.
 */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const raw = await getSetting("WATCHLIST_LAST_RUN");
  let lastRun: unknown = null;
  if (raw) {
    try {
      lastRun = JSON.parse(raw);
    } catch {
      lastRun = null;
    }
  }
  return NextResponse.json({ ok: true, lastRun });
}
