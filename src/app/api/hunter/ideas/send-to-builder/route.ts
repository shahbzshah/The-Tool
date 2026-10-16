import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { IdeaAnalysis } from "@/lib/hunter/ai";

/**
 * POST /api/hunter/ideas/send-to-builder — push a trending idea into the
 * build pipeline. Creates a Project with an approved Idea, landing the user
 * on the Design step (strict Design → Docs → Export).
 * Body: { id: string } (TrendIdea id, must have a cached AI analysis).
 */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const { id } = await req.json().catch(() => ({}));
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Missing idea id." }, { status: 400 });
  }

  const trend = await prisma.trendIdea.findUnique({ where: { id } });
  if (!trend) {
    return NextResponse.json({ error: "Idea not found." }, { status: 404 });
  }
  if (!trend.analysis) {
    return NextResponse.json(
      { error: "Analyze this idea first before sending it to the builder." },
      { status: 400 }
    );
  }

  const analysis = JSON.parse(trend.analysis) as IdeaAnalysis;

  // Create the project with the idea pre-filled from the Hunter's analysis.
  const project = await prisma.project.create({
    data: {
      userId: auth.user.id,
      name: trend.title,
      category: "from-opportunity-hunter",
      preferences: `Source: ${trend.source} (${trend.url ?? "n/a"})\nWhy trending: ${analysis.why_trending ?? ""}`,
      ideas: {
        create: {
          title: trend.title,
          pitch: analysis.summary ?? trend.title,
          features: JSON.stringify(analysis.key_features ?? []),
          targetAudience: analysis.target_audience ?? "",
          monetization: analysis.monetization ?? null,
          status: "approved", // Hunter-validated: skip the approval gate
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
