import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scanKeyword } from "@/lib/hunter/scraper";
import { rankApps, whyItScores } from "@/lib/hunter/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/hunter/watchlist — run the daily automatic watchlist scans.
 * Protected by CRON_SECRET (Bearer token). Runs one scan per seed keyword
 * for every user, skipping keywords already scanned in the last 20 hours.
 */
const WATCHLIST_KEYWORDS = [  "habit tracker",
  "to-do list",
  "pomodoro timer",
  "budget tracker",
  "workout planner",
  "meal planner",
  "sleep tracker",
  "meditation",
  "note taking",
  "water reminder",
  "language learning",
  "expense tracker",
];

/**
 * Verify an Ed25519 request signature from the scheduled watchlist job.
 * The job sends X-Cron-Timestamp (unix seconds) and X-Cron-Signature
 * (base64 signature over the timestamp string). The public key lives in
 * Settings → Cron Public Key, so no shared secret ever needs transmitting.
 */
async function verifyCronSignature(req: Request): Promise<boolean> {
  try {
    const { getSetting, normalizePublicKeyPem } = await import("@/lib/settings");
    const { createPublicKey, verify } = await import("crypto");
    const raw = await getSetting("CRON_PUBLIC_KEY");
    if (!raw) return false;
    const pem = normalizePublicKeyPem(raw);
    const ts = req.headers.get("x-cron-timestamp");
    const sigB64 = req.headers.get("x-cron-signature");
    if (!ts || !sigB64) return false;
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(ts)) > 300) return false; // 5 min freshness
    const pub = createPublicKey(pem.trim());
    return verify(null, Buffer.from(ts, "utf8"), pub, Buffer.from(sigB64, "base64"));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const { getSetting } = await import("@/lib/settings");
  const secret = await getSetting("CRON_SECRET");
  const bearerOk = !!secret && auth === `Bearer ${secret}`;
  if (!bearerOk && !(await verifyCronSignature(req))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const users = await prisma.user.findMany({ select: { id: true } });
  if (!users.length) {
    return NextResponse.json({ ok: true, scanned: 0, note: "no users yet" });
  }

  // Optional body { keywords: [...] } to scan only a batch — the daily cron
  // calls the endpoint in batches so no single invocation exceeds the
  // function time limit.
  let keywords = WATCHLIST_KEYWORDS;
  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body?.keywords) && body.keywords.length > 0) {
      const wanted = new Set(body.keywords.map((k: unknown) => String(k)));
      keywords = WATCHLIST_KEYWORDS.filter((k) => wanted.has(k));
      if (!keywords.length) {
        return NextResponse.json({ error: "No matching keywords." }, { status: 400 });
      }
    }
  } catch {
    // no body — scan all
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
          await prisma.opportunity.createMany({
            data: ranked.map((s) => ({
              scanJobId: job.id,
              appId: s.appId,
              title: s.title,
              rating: s.rating,
              installs: s.installs,
              installsMin: s.reviews ? BigInt(s.reviews) : null,
              reviewsCount: BigInt(s.reviews),
              score: s.opportunity,
              category: s.genre,
              summary: whyItScores(s),
              url: `https://play.google.com/store/apps/details?id=${s.appId}`,
              breakdown: JSON.stringify(s.breakdown),
            })),
          });
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

  return NextResponse.json({ ok: true, scanned, errors: errors.slice(0, 10) });
}
