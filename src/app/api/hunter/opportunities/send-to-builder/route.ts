import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/**
 * POST /api/hunter/opportunities/send-to-builder — push a scanned Play Store
 * opportunity into the build pipeline. Creates a Project with an approved
 * Idea, landing the user on the Design step.
 * Body: { id: string } (Opportunity id).
 */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const { id } = await req.json().catch(() => ({}));
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

  let breakdown: Record<string, number> = {};
  try {
    breakdown = opp.breakdown ? JSON.parse(opp.breakdown) : {};
  } catch {
    // ignore
  }

  // The analyzed doc travels with the project so the builder has the full
  // breakdown: summary, strengths, weaknesses, opportunity, build plan.
  let analysisText = "";
  const latest = opp.analyses[0];
  if (latest) {
    try {
      const a = JSON.parse(latest.content);
      const lines: string[] = [];
      if (a.summary) lines.push(`Summary: ${a.summary}`);
      if (Array.isArray(a.strengths)) lines.push(`Strengths: ${a.strengths.join("; ")}`);
      if (Array.isArray(a.weaknesses)) lines.push(`Weaknesses: ${a.weaknesses.join("; ")}`);
      if (a.opportunity) lines.push(`Opportunity: ${a.opportunity}`);
      if (Array.isArray(a.build_plan)) lines.push(`Build plan: ${a.build_plan.join("; ")}`);
      if (a.monetization) lines.push(`Monetization: ${a.monetization}`);
      analysisText = lines.join("\n");
    } catch {
      // ignore
    }
  }

  const project = await prisma.project.create({
    data: {
      name: opp.title,
      category: "from-play-store-scan",
      preferences: [
        `Source: Play Store scan (opportunity score ${opp.score}/100)`,
        opp.url ? `Play Store: ${opp.url}` : "",
        `Rating: ${opp.rating ?? "n/a"} · Installs: ${opp.installs ?? "n/a"} · Reviews: ${opp.reviewsCount?.toString() ?? "n/a"}`,
        breakdown.quality !== undefined
          ? `Score breakdown — quality ${breakdown.quality}, gap ${breakdown.gap}, market ${breakdown.market}, competition ${breakdown.competition}`
          : "",
        analysisText ? `\nAI analysis:\n${analysisText}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      ideas: {
        create: {
          title: opp.title,
          pitch: `${opp.title} — rated ${opp.rating ?? "n/a"}★ with ${opp.installs ?? "unknown"} installs. Opportunity score ${opp.score}/100: high quality, low distribution. Build a better version capturing this underserved niche.`,
          features: JSON.stringify([]),
          targetAudience: `Users searching for "${opp.category ?? "this niche"}" apps on the Play Store`,
          monetization: null,
          status: "approved",
        },
      },
    },
    include: { ideas: true },
  });

  const idea = project.ideas[0];
  return NextResponse.json({
    projectId: project.id,
    ideaId: idea.id,
    refineUrl: `/refine/${project.id}?idea=${idea.id}`,
  });
}
