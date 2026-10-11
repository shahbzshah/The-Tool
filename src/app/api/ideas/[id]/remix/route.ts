import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chatJson, AIConfigError } from "@/lib/ai";
import { getCachedTrends, formatTrendsForPrompt } from "@/lib/trends";
import type { GeneratedIdea } from "@/lib/constants";

export const runtime = "nodejs";
export const maxDuration = 60;

const VARIANTS = 3;

/**
 * POST /api/ideas/[id]/remix
 * Generates fresh variations of an existing idea, seeded by its content.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const source = await prisma.idea.findUnique({
      where: { id: params.id },
      include: { project: { select: { category: true, preferences: true } } },
    });
    if (!source) {
      return NextResponse.json({ error: "Idea not found." }, { status: 404 });
    }

    const trends = await getCachedTrends();

    const recentIdeas = await prisma.idea.findMany({
      orderBy: { createdAt: "desc" },
      select: { title: true },
      take: 30,
    });
    const existing =
      recentIdeas.length > 0
        ? `\n\nAlready seen (do not repeat):\n${recentIdeas
            .map((i) => `- ${i.title}`)
            .join("\n")}`
        : "";

    let features: string[] = [];
    try {
      const parsed = JSON.parse(source.features);
      if (Array.isArray(parsed)) features = parsed.map(String);
    } catch {
      // ignore
    }

    const system =
      "You are a startup idea generator. You respond ONLY with valid JSON — no markdown fences, no commentary.";

    const user = `Create ${VARIANTS} remix variations of this app idea. Each variation must keep the spirit of the original but change something meaningful: a different target audience, a different business model, a different platform, a bold twist on the core feature, or a different angle entirely.

Original idea (${source.project.category}): ${source.title}
Pitch: ${source.pitch}
Features: ${features.join("; ")}
Target audience: ${source.targetAudience}
${source.project.preferences ? `Original constraints: ${source.project.preferences}` : ""}

${formatTrendsForPrompt(trends)}${existing}

Rules:
- Each remix must be specific, concrete, and buildable by a solo developer in weeks.
- 4-6 features per remix.
- Score every remix honestly (5 = average, 10 = exceptional) on novelty, feasibility, and marketDemand.

Respond with a JSON array of exactly ${VARIANTS} objects:
[{"title": string, "pitch": string (2-3 sentences), "features": string[], "targetAudience": string, "monetization": string, "scores": {"novelty": number, "feasibility": number, "marketDemand": number}}]`;

    const ideas = await chatJson<GeneratedIdea[]>(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 1.15, maxTokens: 4000 }
    );

    if (!Array.isArray(ideas) || ideas.length === 0) {
      throw new Error("AI returned no remixes.");
    }

    const project = await prisma.project.create({
      data: {
        name: `Remix of ${source.title} — ${new Date().toLocaleDateString()}`,
        category: source.project.category,
        preferences: source.project.preferences,
        ideas: {
          create: ideas.slice(0, VARIANTS).map((idea) => ({
            title: String(idea.title ?? "Untitled remix"),
            pitch: String(idea.pitch ?? ""),
            features: JSON.stringify(
              Array.isArray(idea.features) ? idea.features.map(String) : []
            ),
            targetAudience: String(idea.targetAudience ?? ""),
            monetization: idea.monetization ? String(idea.monetization) : null,
            scores: idea.scores
              ? JSON.stringify({
                  novelty: Number(idea.scores.novelty) || 5,
                  feasibility: Number(idea.scores.feasibility) || 5,
                  marketDemand: Number(idea.scores.marketDemand) || 5,
                })
              : null,
          })),
        },
      },
      include: { ideas: true },
    });

    return NextResponse.json({ project });
  } catch (err) {
    if (err instanceof AIConfigError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    console.error("Remix failed:", err);
    const message =
      err instanceof Error ? err.message : "Failed to remix idea.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}