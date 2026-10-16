import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chatJson, AIConfigError } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { checkAiQuota } from "@/lib/ai-quota";
import { parseJsonField, type IdeaValidation } from "@/lib/constants";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/ideas/[id]/validate
 * "Red team" pass: stress-tests the idea (competitors, risks, gaps) and
 * persists the report on the idea.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  if (!(await checkAiQuota(auth.user.id))) {
    return NextResponse.json(
      { error: "Daily AI quota exceeded." },
      { status: 429 }
    );
  }

  try {
    const idea = await prisma.idea.findFirst({
      where: { id: params.id, project: { userId: auth.user.id } },
      include: { project: { select: { category: true } } },
    });
    if (!idea) {
      return NextResponse.json({ error: "Idea not found." }, { status: 404 });
    }

    // Return the cached report if we already validated this idea
    const cached = parseJsonField<IdeaValidation>(idea.validation);
    if (cached) {
      return NextResponse.json({ validation: cached });
    }

    let features: string[] = [];
    try {
      const parsed = JSON.parse(idea.features);
      if (Array.isArray(parsed)) features = parsed.map(String);
    } catch {
      // ignore
    }

    const system =
      "You are a skeptical venture analyst who red-teams startup ideas. You respond ONLY with valid JSON — no markdown fences, no commentary.";

    const user = `Red-team this app idea honestly and concretely.

Category: ${idea.project.category}
Title: ${idea.title}
Pitch: ${idea.pitch}
Features: ${features.join("; ")}
Target audience: ${idea.targetAudience}
Monetization: ${idea.monetization ?? "none stated"}

Be specific and reference real products where relevant. Do not be gratuitously negative — find what genuinely makes it strong too.

Respond with a JSON object:
{"verdict": "strong" | "promising" | "risky", "summary": string (2-3 sentences), "strengths": string[] (2-4 items), "risks": string[] (2-4 items), "competitors": [{"name": string, "note": string}] (2-4 items), "suggestions": string[] (2-4 concrete pivots/changes that would improve the odds)}`;

    const validation = await chatJson<IdeaValidation>(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 0.7, maxTokens: 1500 }
    );

    if (!validation || typeof validation !== "object" || !validation.summary) {
      throw new Error("AI returned an invalid validation report.");
    }

    await prisma.idea.update({
      where: { id: idea.id },
      data: { validation: JSON.stringify(validation) },
    });

    return NextResponse.json({ validation });
  } catch (err) {
    if (err instanceof AIConfigError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    console.error("Validation failed:", err);
    const message =
      err instanceof Error ? err.message : "Failed to validate idea.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}