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

  // Intake rows (upload / link / own-idea) are ideas, not Play apps:
  // their pitch must not cite a rating/installs they don't have. The
  // Hunter path below is untouched.
  const isIntake = !!opp.source && opp.source !== "hunter";
  const intakeDraft = (breakdown as Record<string, any>).draft as
    | { topic?: string; app_concept?: string | null; audience?: string | null }
    | undefined;
  const sourceLabel = isIntake
    ? opp.source === "own-idea"
      ? "your own idea"
      : opp.source === "link"
        ? "a pasted link"
        : "an upload"
    : "Play Store scan";

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
      if (Array.isArray(a.user_pain_points)) lines.push(`User pain points: ${a.user_pain_points.join("; ")}`);
      if (a.competition) lines.push(`Competition: ${a.competition}`);
      if (Array.isArray(a.differentiation)) lines.push(`Differentiation: ${a.differentiation.join("; ")}`);
      if (a.opportunity) lines.push(`Opportunity: ${a.opportunity}`);
      if (a.mvp_scope) {
        if (Array.isArray(a.mvp_scope.must_have)) lines.push(`MVP must-haves: ${a.mvp_scope.must_have.join("; ")}`);
        if (Array.isArray(a.mvp_scope.later)) lines.push(`Postpone until later: ${a.mvp_scope.later.join("; ")}`);
      }
      if (Array.isArray(a.build_plan)) lines.push(`Build plan: ${a.build_plan.join("; ")}`);
      if (a.monetization) lines.push(`Monetization: ${a.monetization}`);
      if (Array.isArray(a.risks)) lines.push(`Risks: ${a.risks.join("; ")}`);
      if (a.go_to_market) lines.push(`Go to market: ${a.go_to_market}`);
      analysisText = lines.join("\n");
    } catch {
      // ignore
    }
  }

  const project = await prisma.project.create({
    data: {
      userId: auth.user.id,
      name: opp.title,
      category: isIntake ? "from-intake" : "from-play-store-scan",
      platform: "mobile", // Play Store opportunity → Android + iOS native app, web optional
      preferences: [
        `Source: ${sourceLabel} (opportunity score ${opp.score}/100)`,
        opp.url ? `Original link: ${opp.url}` : "",
        isIntake
          ? ""
          : `Rating: ${opp.rating ?? "n/a"} · Installs: ${opp.installs ?? "n/a"} · Reviews: ${opp.reviewsCount?.toString() ?? "n/a"}`,
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
          pitch: isIntake
            ? `${opp.title} — ${opp.summary ?? "Researched app idea"}. Opportunity score ${opp.score}/100 from ${sourceLabel} research.`
            : `${opp.title} — rated ${opp.rating ?? "n/a"}★ with ${opp.installs ?? "unknown"} installs. Opportunity score ${opp.score}/100: high quality, low distribution. Build a better version capturing this underserved niche.`,
          features: JSON.stringify([]),
          targetAudience: isIntake
            ? (intakeDraft?.audience && intakeDraft.audience.toLowerCase() !== "null"
                ? intakeDraft.audience
                : `Users interested in "${opp.title}"`)
            : `Users searching for "${opp.category ?? "this niche"}" apps on the Play Store`,
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
