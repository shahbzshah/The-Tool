import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { chatJson } from "@/lib/ai";
import { checkAiQuota } from "@/lib/ai-quota";
import { logAiUsage, estimateTokens } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  const { projectId, versionKey } = await req.json().catch(() => ({}));
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
        take: 20,
        select: { filename: true, type: true, content: true, batchId: true },
        where: { type: "html" },
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

  const allUploads = project.uploads.filter((u) => u.content);
  if (allUploads.length === 0) {
    return NextResponse.json(
      { error: "No uploaded screens with content to analyze." },
      { status: 400 }
    );
  }

  // Judge ONLY the selected version's screens (the client sends its
  // batchId as versionKey; "legacy" means uploads with no batchId).
  // The old code read the latest 20 uploads across ALL versions, so the
  // verdict cited old files and missed fixes that were already uploaded.
  // No versionKey sent → newest batch, same as the design review.
  const newestBatch = allUploads[0].batchId ?? "legacy";
  const wantedBatch =
    typeof versionKey === "string" && versionKey.length > 0
      ? versionKey
      : newestBatch;
  let uploads = allUploads.filter(
    (u) => (u.batchId ?? "legacy") === wantedBatch
  );
  if (uploads.length === 0) {
    uploads = allUploads.filter(
      (u) => (u.batchId ?? "legacy") === newestBatch
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

  // Build a compact summary of each upload: filename + extracted visible text.
  // Strip HTML tags, scripts, and styles — the AI needs to see what the UI
  // SAYS (buttons, headings, labels), not the markup. Kept to 4000 chars
  // per screen: the old 900-char cut hid real content — on the long
  // Settings screen the notification toggle sits at offset ~1800, the
  // export buttons at ~2700 and crash reporting at ~3200, so the AI
  // kept reporting them missing even after the fixed design was uploaded.
  // A whole version's screens total ~14k chars, so full text stays cheap.
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
      .slice(0, 4000);
  }

  const screensSummary = uploads
    .map((u, i) => {
      const text = extractVisibleText(u.content || "");
      return `--- Screen ${i + 1}: ${u.filename} ---\n${text || "(no readable text in this file)"}`;
    })
    .join("\n\n");

  const buildPrompt = (chunk: string[], offset: number) => `You are analyzing a mobile app UI design against its feature requirements.

APP: ${idea.title}

FEATURES (each must be checked):
${chunk.map((f, i) => `${offset + i + 1}. ${f}`).join("\n")}

UPLOADED SCREENS:
${screensSummary}

For EACH feature above, determine whether the uploaded UI screens actually implement it. A feature is "covered" if any screen shows UI for it — buttons, forms, lists, charts, settings, headings, or labels that would let a user accomplish that feature. The screen filenames also hint at their purpose (e.g. "water-tracking.html" is about water tracking).

Be generous with semantic matching: if a screen's text mentions the concept (e.g. "daily goal", "hydration", "ml"), it covers "customizable daily water intake goals". Only mark NOT covered if no screen has any related UI or text at all.

Respond with ONLY a JSON array, one object per feature, in the same order:
[{"covered": true/false, "matchedFile": "filename or null", "reason": "one sentence explaining why"}]

No other text.`;

  try {
    // One call for all 12 features regularly ran past the 45s limit — the
    // model is slow, and the whole answer (12 objects) takes the longest
    // to generate. Split into halves run in parallel: each call writes
    // half the answer, so the wall time is roughly one half-call.
    // Race the combined work against a 45s timeout — Vercel's gateway
    // times out at 60s, so we fail fast with a clear message instead of
    // a bare 504.
    const CHUNK = 6;
    const chunks: string[][] = [];
    for (let i = 0; i < features.length; i += CHUNK) {
      chunks.push(features.slice(i, i + CHUNK));
    }
    const aiWork = Promise.all(
      chunks.map((chunk, ci) =>
        chatJson<{ covered: boolean; matchedFile: string | null; reason: string }[]>(
          [{ role: "user", content: buildPrompt(chunk, ci * CHUNK) }],
          { temperature: 0.1, maxTokens: 2000 }
        )
      )
    ).then((parts) => parts.flat());
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("AI analysis timed out after 45 seconds. Try again — it may work on retry.")), 45_000)
    );
    const results = await Promise.race([aiWork, timeoutPromise]);

    if (!Array.isArray(results) || results.length !== features.length) {
      throw new Error("AI returned an unexpected shape.");
    }

    await logAiUsage({
      userId: auth.user.id,
      projectId,
      kind: "design-coverage-analysis",
      // Two prompts now (one per half); estimate from the screens summary
      // plus the feature list rather than a single prompt variable.
      tokensIn: estimateTokens(screensSummary.length + features.join(" ").length),
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
