import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { chatJson } from "@/lib/ai";
import { checkAiQuota } from "@/lib/ai-quota";
import { logAiUsage, estimateTokens } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/design/analyze-coverage — AI analyzes uploaded Stitch screens
 * against the idea's feature list to determine which features are actually
 * covered by the UI. Uses the user's NVIDIA API key (via lib/ai).
 *
 * Body: { projectId: string }
 * Returns: { results: [{ feature, covered, matchedFile, reason }] }
 */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const { projectId } = await req.json().catch(() => ({}));
  if (!projectId || typeof projectId !== "string") {
    return NextResponse.json({ error: "Project ID is required." }, { status: 400 });
  }

  // Verify ownership.
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: auth.user.id },
    include: {
      ideas: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { features: true, title: true },
      },
      uploads: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { filename: true, type: true, content: true },
      },
    },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const idea = project.ideas[0];
  if (!idea) {
    return NextResponse.json({ error: "No idea found for this project." }, { status: 400 });
  }

  let features: string[] = [];
  try {
    const parsed = JSON.parse(idea.features);
    features = Array.isArray(parsed) ? parsed : [];
  } catch {
    return NextResponse.json({ error: "Could not parse idea features." }, { status: 400 });
  }
  if (features.length === 0) {
    return NextResponse.json({ error: "No features to analyze." }, { status: 400 });
  }

  const uploads = project.uploads.filter((u) => u.content);
  if (uploads.length === 0) {
    return NextResponse.json(
      { error: "No uploaded screens with content to analyze." },
      { status: 400 }
    );
  }

  // Check AI quota.
  const quotaOk = await checkAiQuota(auth.user.id);
  if (!quotaOk) {
    return NextResponse.json(
      { error: "Daily AI quota reached. Try again tomorrow." },
      { status: 429 }
    );
  }

  // Build a compact summary of each upload: filename + first 2000 chars.
  const screensSummary = uploads
    .map((u, i) => {
      const snippet = (u.content || "").slice(0, 2000).replace(/\s+/g, " ").trim();
      return `--- Screen ${i + 1}: ${u.filename} (${u.type}) ---\n${snippet}`;
    })
    .join("\n\n");

  const prompt = `You are analyzing a mobile app UI design against its feature requirements.

APP: ${idea.title}

FEATURES (each must be checked):
${features.map((f, i) => `${i + 1}. ${f}`).join("\n")}

UPLOADED SCREENS:
${screensSummary}

For EACH feature above, determine whether the uploaded UI screens actually implement it. A feature is "covered" if any screen shows UI for it — buttons, forms, lists, charts, settings, etc. that would let a user accomplish that feature. Be generous with semantic matching (e.g. a "hydration tracker with goal slider" covers "customizable daily water intake goals") but honest — don't mark covered if there's no real UI for it.

Respond with ONLY a JSON array, one object per feature, in the same order:
[{"covered": true/false, "matchedFile": "filename or null", "reason": "one sentence explaining why"}]

No other text.`;

  try {
    const results = await chatJson<{ covered: boolean; matchedFile: string | null; reason: string }[]>(
      [{ role: "user", content: prompt }],
      { temperature: 0.3, maxTokens: 4000 }
    );

    if (!Array.isArray(results) || results.length !== features.length) {
      throw new Error("AI returned an unexpected shape.");
    }

    await logAiUsage({
      userId: auth.user.id,
      projectId,
      kind: "design-coverage-analysis",
      tokensIn: estimateTokens(prompt.length),
      tokensOut: estimateTokens(JSON.stringify(results).length),
    });

    return NextResponse.json({
      results: features.map((feature, i) => ({
        feature,
        covered: !!results[i]?.covered,
        matchedFile: results[i]?.matchedFile || null,
        reason: results[i]?.reason || "",
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
