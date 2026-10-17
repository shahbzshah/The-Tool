import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chatJson, AIConfigError } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { checkAiQuota } from "@/lib/ai-quota";
import { estimateTokens, logAiUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 60;

export type StitchReview = {
  alignmentScore: number; // 1-10 — how well the design covers the idea
  matches: string[]; // features well represented in the design
  gaps: string[]; // features from the idea missing in the design
  recommendations: string[]; // concrete prompts/changes for Stitch
};

/**
 * POST /api/stitch-review
 * Compares the approved idea + Stitch prompt against the uploaded design
 * export and reports alignment, gaps, and recommended fixes.
 */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  if (!(await checkAiQuota(auth.user.id))) {
    return NextResponse.json(
      { error: "Daily AI quota exceeded." },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const projectId = String(body?.projectId ?? "");
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required." }, { status: 400 });
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: auth.user.id },
      include: {
        ideas: { where: { status: "approved" } },
        stitchPrompt: true,
        uploads: true,
      },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const idea = project.ideas[0];
    if (!idea) {
      return NextResponse.json(
        { error: "No approved idea in this project yet." },
        { status: 400 }
      );
    }

    const uploadSummaries = project.uploads
      .slice(0, 5)
      .map((u) => {
        const content = (u.content ?? "").slice(0, 3000);
        return `[${u.type}] ${u.filename}\n${content || "(binary/upload — no extracted text)"}`;
      })
      .join("\n\n");

    const designContext = uploadSummaries
      ? `Uploaded design exports:\n${uploadSummaries}`
      : "No design export uploaded yet — review the Stitch prompt against the idea alone and note that no export was provided.";

    const system =
      "You are a meticulous product designer reviewing whether a UI design matches the product it was designed for. You respond ONLY with valid JSON — no markdown fences, no commentary.";

    const user = `Review how well the design covers the approved app idea.

Idea: ${idea.title}
Pitch: ${idea.pitch}
Features:
${(() => {
  try {
    const arr = JSON.parse(idea.features);
    return Array.isArray(arr) ? arr.map((f: string) => `- ${f}`).join("\n") : "";
  } catch {
    return "";
  }
})()}
${project.stitchPrompt ? `\nStitch prompt used (screens: ${project.stitchPrompt.screens}):\n${project.stitchPrompt.promptText.slice(0, 2000)}` : "\n(No Stitch prompt generated.)"}

${designContext}

Respond with a JSON object:
{"alignmentScore": number (1-10, how well the design/prompt covers the idea's features), "matches": string[] (features well represented), "gaps": string[] (features from the idea missing or underrepresented in the design), "recommendations": string[] (concrete, copy-paste-ready additions or tweaks to fix each gap)}`;

    const review = await chatJson<StitchReview>(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 0.6, maxTokens: 1500 }
    );

    if (!review || typeof review !== "object" || typeof review.alignmentScore !== "number") {
      throw new Error("AI returned an invalid review.");
    }

    // Track NVIDIA token consumption (estimated — the API returns no usage).
    await logAiUsage({
      userId: auth.user.id,
      projectId,
      kind: "design",
      tokensIn: estimateTokens(system.length + user.length),
      tokensOut: estimateTokens(JSON.stringify(review).length),
    });

    return NextResponse.json({ review });
  } catch (err) {
    if (err instanceof AIConfigError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    console.error("Stitch review failed:", err);
    const message =
      err instanceof Error ? err.message : "Failed to review design.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}