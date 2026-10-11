import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scanKeyword } from "@/lib/hunter/scraper";
import { rankApps } from "@/lib/hunter/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/hunter/scans — run a Play Store opportunity scan.
 * Body: { keyword: string, maxApps?: number }
 * Runs synchronously; typical scan takes 30-60s for 20 apps.
 */
export async function POST(req: Request) {
  const { keyword, maxApps = 20 } = await req.json().catch(() => ({}));
  if (!keyword || typeof keyword !== "string" || !keyword.trim()) {
    return NextResponse.json({ error: "Missing keyword." }, { status: 400 });
  }

  const job = await prisma.scanJob.create({
    data: { keyword: keyword.trim(), status: "running", startedAt: new Date() },
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
      opportunities: done.opportunities.map((o) => ({
        ...o,
        installsMin: o.installsMin?.toString() ?? null,
        reviewsCount: o.reviewsCount?.toString() ?? null,
      })),
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

/** GET /api/hunter/scans — recent scan jobs. */
export async function GET() {
  const scans = await prisma.scanJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { _count: { select: { opportunities: true } } },
  });
  return NextResponse.json({ scans });
}
