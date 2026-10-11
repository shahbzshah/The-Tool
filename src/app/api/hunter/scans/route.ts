import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { scanKeyword } from "@/lib/hunter/scraper";
import { rankApps, whyItScores } from "@/lib/hunter/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
