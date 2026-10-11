import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeOpportunity } from "@/lib/hunter/ai";

/**
 * POST /api/hunter/opportunities/analyze — AI deep-dive on a scanned Play
 * Store opportunity. Returns the structured analysis (summary, strengths,
 * weaknesses, opportunity angle, build plan, monetization) and caches it
 * on the OpportunityAnalysis table.
 * Body: { id: string } (Opportunity id).
 */
export async function POST(req: Request) {
  const { id } = await req.json().catch(() => ({}));
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Missing opportunity id." }, { status: 400 });
  }

  const opp = await prisma.opportunity.findUnique({
    where: { id },
    include: { analyses: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!opp) {
    return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
  }

  // Return the cached analysis if one exists.
  const cached = opp.analyses[0];
  if (cached) {
    try {
      return NextResponse.json({ analysis: JSON.parse(cached.content), cached: true });
    } catch {
      // fall through and regenerate
    }
  }

  const analysis = await analyzeOpportunity({
    title: opp.title,
    rating: opp.rating,
    installs: opp.installs,
    reviewsCount: opp.reviewsCount != null ? Number(opp.reviewsCount) : null,
    score: opp.score,
    category: opp.category,
    breakdown: opp.breakdown,
    url: opp.url,
  });

  await prisma.opportunityAnalysis.create({
    data: {
      opportunityId: opp.id,
      appId: opp.appId,
      provider: "nvidia",
      content: JSON.stringify(analysis),
    },
  });

  return NextResponse.json({ analysis, cached: false });
}
