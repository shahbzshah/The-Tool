import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { sweepStaleJobs } from "@/lib/scan-jobs";
import { scanKeyword } from "@/lib/hunter/scraper";
import { rankApps, whyItScores } from "@/lib/hunter/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Scans fetch up to 20 app detail pages with politeness delays; give the
// function the full window so it isn't killed mid-scan.
export const maxDuration = 300;

// During `next build`, Next.js may statically evaluate this route; Neon is
// suspended then, so skip DB access while building and return an empty list.
const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

function serializeOpportunity(o: any) {
  return {
    ...o,
    installsMin: o.installsMin?.toString() ?? null,
    reviewsCount: o.reviewsCount?.toString() ?? null,
  };
}

/**
 * Parse an installs string like "5,000,000+" into a number. Mirrors
 * parseInstalls() in lib/hunter/scraper (ScoredApp only carries the raw
 * string, not the numeric count).
 */
function parseInstalls(raw: unknown): number {
  if (!raw) return 0;
  const n = parseInt(String(raw).replace(/,/g, "").replace(/\+/g, "").trim(), 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * POST /api/hunter/scans — run a Play Store opportunity scan.
 * Body: { keyword: string, maxApps?: number }
 * Runs synchronously; typical scan takes 30-60s for 20 apps.
 */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const { keyword, maxApps = 20 } = await req.json().catch(() => ({}));
  if (!keyword || typeof keyword !== "string" || !keyword.trim()) {
    return NextResponse.json({ error: "Missing keyword." }, { status: 400 });
  }

  // Clean up jobs left "running" by crashed/timed-out scans before starting.
  try {
    await sweepStaleJobs();
  } catch (err) {
    console.warn("sweepStaleJobs failed:", err);
  }

  const job = await prisma.scanJob.create({
    data: {
      keyword: keyword.trim(),
      status: "running",
      startedAt: new Date(),
      userId: user.id,
    },
  });

  try {
    const details = await scanKeyword(keyword.trim(), 30, Math.min(maxApps, 20));
    const ranked = rankApps(details);

    // createMany with an empty array throws a Prisma validation error —
    // an empty result is a valid completed scan with 0 results.
    if (ranked.length > 0) {
      await prisma.opportunity.createMany({
        data: ranked.map((s) => {
          // installsMin = the numeric install floor ("5,000,000+" -> 5000000),
          // NOT the reviews count.
          const installsMin = parseInstalls(s.installs);
          return {
            scanJobId: job.id,
            appId: s.appId,
            title: s.title,
            rating: s.rating,
            installs: s.installs,
            installsMin: installsMin > 0 ? BigInt(installsMin) : null,
            reviewsCount: s.reviews ? BigInt(Math.floor(s.reviews)) : null,
            score: s.opportunity,
            category: s.genre,
            summary: whyItScores(s),
            url: `https://play.google.com/store/apps/details?id=${s.appId}`,
            breakdown: JSON.stringify(s.breakdown),
          };
        }),
      });
    }

    const done = await prisma.scanJob.update({
      where: { id: job.id },
      data: { status: "completed", resultsCount: ranked.length, finishedAt: new Date() },
      include: { opportunities: { orderBy: { score: "desc" } } },
    });

    return NextResponse.json({
      scan: {
        id: done.id,
        keyword: done.keyword,
        status: done.status,
        resultsCount: done.resultsCount,
      },
      opportunities: done.opportunities.map(serializeOpportunity),
    });
  } catch (err) {
    await prisma.scanJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        error: err instanceof Error ? err.message : "Scan failed",
        finishedAt: new Date(),
      },
    });
    return NextResponse.json({ error: "Scan failed." }, { status: 500 });
  }
}

/** GET /api/hunter/scans — the signed-in user's recent scan jobs. */
export async function GET(req: Request) {
  if (IS_BUILD) {
    return NextResponse.json({ scans: [], building: true });
  }
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const scans = await prisma.scanJob.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json({ scans });
}
