import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scanKeyword } from "@/lib/hunter/scraper";
import { rankApps, whyItScores } from "@/lib/hunter/scoring";
import { loadWatchlistKeywords } from "@/lib/hunter/watchlist-keywords";
import { requireUser } from "@/lib/auth";
import { sweepStaleJobs } from "@/lib/scan-jobs";
import { getSetting, setSetting, normalizePublicKeyPem } from "@/lib/settings";
import {
  timingSafeEqual,
  createPublicKey,
  createHash,
  verify,
} from "crypto";

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
function parseInstallsMin(installs: string | null): bigint | null {
  if (!installs) return null;
  const digits = installs.replace(/[^\d]/g, "");
  if (!digits) return null;
  return BigInt(digits);
}

/** Length-safe wrapper around timingSafeEqual (length mismatch → false). */
function bearerEquals(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Verify cron-job authentication. Two accepted paths:
 *  1. Bearer token — Settings → CRON_SECRET (backup path).
 *  2. Ed25519 signature — the job sends X-Cron-Timestamp (unix seconds) and
 *     X-Cron-Signature (base64). New (required) message format, bound to the
 *     request body:
 *
 *         timestamp + "\n" + method + "\n" + path + "\n" + sha256hex(rawBody)
 *
 *     e.g. "1728800000\nPOST\n/api/hunter/watchlist\n9f2c…"
 *     The public key lives in Settings → Cron Public Key, so no shared
 *     secret ever needs transmitting.
 *  3. LEGACY fallback: a signature over the timestamp alone. Kept only for
 *     backward compatibility while the cron migrates to the body-bound
 *     format — REMOVE THIS BRANCH once the migration is confirmed.
 */
async function verifyCronAuth(
  req: Request,
  rawBody: string
): Promise<boolean> {
  const secret = await getSetting("CRON_SECRET");
  const auth = req.headers.get("authorization") ?? "";
  if (secret && bearerEquals(auth, `Bearer ${secret}`)) return true;

  try {
    const raw = await getSetting("CRON_PUBLIC_KEY");
    if (!raw) return false;
    const pem = normalizePublicKeyPem(raw);
    const ts = req.headers.get("x-cron-timestamp");
    const sigB64 = req.headers.get("x-cron-signature");
    if (!ts || !sigB64) return false;
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(ts)) > 300) return false; // 5 min freshness
    const pub = createPublicKey(pem.trim());
    const sig = Buffer.from(sigB64, "base64");
    const bodyHash = createHash("sha256").update(rawBody, "utf8").digest("hex");
    const message = [
      ts,
      req.method.toUpperCase(),
      new URL(req.url).pathname,
      bodyHash,
    ].join("\n");
    if (verify(null, Buffer.from(message, "utf8"), pub, sig)) return true;
    // LEGACY fallback: timestamp-only message. TODO: remove after the
    // cron job is confirmed to be sending the body-bound format.
    if (verify(null, Buffer.from(ts, "utf8"), pub, sig)) {
      console.warn(
        "[watchlist] accepted legacy timestamp-only cron signature — fallback scheduled for removal"
      );
      return true;
    }
    return false;
  } catch {
    return false;
  }
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
          const ranked = rankApps(details);
          // Dedupe: re-scanning a keyword must not create duplicate rows for
          // the same app. Update the existing opportunity (fresh score,
          // re-link to this job) instead, preserving the user's bookmark.
          const toRow = (s: (typeof ranked)[number]) => ({
            appId: s.appId,
            title: s.title,
            rating: s.rating,
            installs: s.installs,
            installsMin: parseInstallsMin(s.installs),
            reviewsCount: BigInt(s.reviews),
            score: s.opportunity,
            category: s.genre,
            summary: whyItScores(s),
            url: `https://play.google.com/store/apps/details?id=${s.appId}`,
            breakdown: JSON.stringify(s.breakdown),
          });
          const existing = await prisma.opportunity.findMany({
            where: {
              appId: { in: ranked.map((s) => s.appId) },
              scanJob: { userId: user.id, keyword },
            },
            select: { id: true, appId: true },
          });
          const existingIds = new Map(existing.map((e) => [e.appId, e.id]));
          const creates: ({ scanJobId: string } & ReturnType<typeof toRow>)[] = [];
          for (const s of ranked) {
            const data = { scanJobId: job.id, ...toRow(s) };
            const id = existingIds.get(s.appId);
            if (id) {
              await prisma.opportunity.update({ where: { id }, data });
            } else {
              creates.push(data);
            }
          }
          if (creates.length > 0) {
            await prisma.opportunity.createMany({ data: creates });
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
