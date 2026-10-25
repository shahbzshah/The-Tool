import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { analyzeOpportunity } from "@/lib/hunter/ai";
import { getEvidencePacket } from "@/lib/hunter/evidence";

/**
 * POST /api/hunter/opportunities/analyze — grounded AI scorecard for a
 * scanned Play Store opportunity.
 *
 * Flow: build (or reuse, < 7 days old) the computed evidence packet,
 * then run the LLM on ONLY that packet. The returned scorecard is
 * validated in code: numbers must trace to packet fields, Unknown is
 * never 0, quotes must match packet quotes verbatim.
 *
 * Body: { id: string, refresh?: boolean }. Without refresh, a cached
 * analysis is returned. With refresh, evidence is rebuilt and a fresh
 * scorecard replaces the cached analysis.
 */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const { id, refresh } = await req.json().catch(() => ({}));
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Missing opportunity id." }, { status: 400 });
  }

  const opp = await prisma.opportunity.findFirst({
    where: { id, scanJob: { userId: auth.user.id } },
    include: { analyses: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!opp) {
    return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
  }

  // Return the cached analysis if one exists and no refresh was asked.
  const cached = opp.analyses[0];
  if (cached && !refresh) {
    try {
      return NextResponse.json({ analysis: JSON.parse(cached.content), cached: true });
    } catch {
      // fall through and regenerate
    }
  }

  const packet = await getEvidencePacket(opp.id, { force: !!refresh });
  if (!packet) {
    return NextResponse.json(
      { error: "Could not build the evidence packet for this opportunity." },
      { status: 500 }
    );
  }

  let analysis;
  try {
    analysis = await analyzeOpportunity(packet);
  } catch (err) {
    console.error("[analyze] grounded analysis failed:", err);
    return NextResponse.json(
      { error: "Analysis failed — the AI call did not return a valid scorecard. Tap to retry." },
      { status: 502 }
    );
  }

  // Replace any cached analysis so the detail page always shows the
  // newest scorecard (old prose analyses stay readable until replaced).
  if (cached) {
    await prisma.opportunityAnalysis.delete({ where: { id: cached.id } }).catch(() => {});
  }
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
