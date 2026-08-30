import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chatJson, AIConfigError } from "@/lib/ai";
import { getTrends, formatTrendsForPrompt } from "@/lib/trends";
import type { GeneratedIdea } from "@/lib/constants";

export const runtime = "nodejs";
export const maxDuration = 120;

const IDEAS_PER_REQUEST = 3;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const category = String(body?.category ?? "").trim();
    const preferences = String(body?.preferences ?? "").trim();

    if (!category) {
      return NextResponse.json(
        { error: "Category is required." },
        { status: 400 }
      );
    }

    const trends = await getTrends();

    const system =
      "You are a startup idea generator. You respond ONLY with valid JSON — no markdown fences, no commentary.";

    const user = `Generate ${IDEAS_PER_REQUEST} distinct, realistic, buildable app ideas.

Category: ${category}
${preferences ? `User preferences/constraints: ${preferences}` : ""}

${formatTrendsForPrompt(trends)}

Rules:
- Each idea must be specific and concrete (no generic "Uber for X" fluff).
- Each must be buildable by a solo developer in weeks, not years.
- 4-6 features per idea.
- Vary the ideas: different angles within the category.

Respond with a JSON array of exactly ${IDEAS_PER_REQUEST} objects:
[{"title": string, "pitch": string (2-3 sentences), "features": string[], "targetAudience": string, "monetization": string}]`;

    const ideas = await chatJson<GeneratedIdea[]>(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 1.1, maxTokens: 2500 }
    );

    if (!Array.isArray(ideas) || ideas.length === 0) {
      throw new Error("AI returned no ideas.");
    }

    const project = await prisma.project.create({
      data: {
        name: `${category} — ${new Date().toLocaleDateString()}`,
        category,
        preferences: preferences || null,
        ideas: {
          create: ideas.slice(0, IDEAS_PER_REQUEST).map((idea) => ({
            title: String(idea.title ?? "Untitled idea"),
            pitch: String(idea.pitch ?? ""),
            features: JSON.stringify(
              Array.isArray(idea.features) ? idea.features.map(String) : []
            ),
            targetAudience: String(idea.targetAudience ?? ""),
            monetization: idea.monetization ? String(idea.monetization) : null,
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
    console.error("Idea generation failed:", err);
    const message =
      err instanceof Error ? err.message : "Failed to generate ideas.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
