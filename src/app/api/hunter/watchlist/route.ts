import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scanKeyword } from "@/lib/hunter/scraper";
import { rankApps, whyItScores } from "@/lib/hunter/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/hunter/watchlist — run the daily automatic watchlist scans.
 * Protected by CRON_SECRET (Bearer token). Runs one scan per seed keyword
 * for every user, skipping keywords already scanned in the last 20 hours.
 */
const WATCHLIST_KEYWORDS = [
  "habit tracker",
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

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const users = await prisma.user.findMany({ select: { id: true } });
  if (!users.length) {
    return NextResponse.json({ ok: true, scanned: 0, note: "no users yet" });
  }

  const since = new Date(Date.now() - 20 * 3600 * 1000);
  let scanned = 0;
  const errors: string[] = [];

  for (const user of users) {
    for (const keyword of WATCHLIST_KEYWORDS) {
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
