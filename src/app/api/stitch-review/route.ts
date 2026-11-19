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

    // Review only the CURRENT version's screens: uploads are grouped by
    // batchId (one import = one version). The newest batch is the current
    // version; older batches are previous designs, not evidence about this
    // one. HTML only — screenshots and DESIGN.md carry no screen text.
    const htmlUploads = project.uploads
      .filter((u) => u.type === "html" && u.content)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (htmlUploads.length === 0) {
      return NextResponse.json(
        { error: "Upload a Stitch design export first — the review needs actual screens to compare against your idea." },
        { status: 400 }
      );
    }
    const currentBatch = htmlUploads[0].batchId ?? "legacy";
    const currentScreens = htmlUploads
      .filter((u) => (u.batchId ?? "legacy") === currentBatch)
      .slice(0, 6);

    // The AI needs what the UI SAYS, not the markup — raw HTML (scripts,
    // styles, Tailwind classes) bloats the prompt and slows the model.
    // Same visible-text extraction as the coverage analysis.
    function extractVisibleText(html: string): string {
      return html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 900);
    }

    const uploadSummaries = currentScreens
      .map((u) => {
        const text = extractVisibleText(u.content ?? "");
        return `[screen] ${u.filename}\n${text || "(no readable text in this file)"}`;
      })
      .join("\n\n");

    if (!uploadSummaries.trim()) {
      return NextResponse.json(
        { error: "Upload a Stitch design export first — the review needs actual screens to compare against your idea." },
        { status: 400 }
      );
    }

    const designContext = `Uploaded design exports:\n${uploadSummaries}`;

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
{"alignmentScore": number (1-10, how well the design/prompt covers the idea's features), "matches": string[] (features well represented, at most 5, one short line each), "gaps": string[] (features from the idea missing or underrepresented in the design, at most 5, one short line each), "recommendations": string[] (concrete, copy-paste-ready additions or tweaks to fix each gap, at most 5, one short line each)}`;

    // Race the AI call against a 45s timeout — Vercel's gateway times out
    // at 60s, so we fail fast with a clear JSON message instead of a bare
    // 504 with an empty body (which the client can only show as a generic
    // "Review timed out"). Same fix as the coverage analysis: the model
    // is slow right now and a big raw-HTML prompt regularly blew the limit.
    const aiPromise = chatJson<StitchReview>(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 0.6, maxTokens: 1200 }
    );
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Review timed out after 45 seconds. Try again — it may work on retry.")), 45_000)
    );
    const review = await Promise.race([aiPromise, timeoutPromise]);

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