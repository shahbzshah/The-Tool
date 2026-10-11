import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { chat } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DRAFT_SYSTEM = `You are a product strategist. You are given a full AI market analysis of a real Play Store opportunity. Draft the FIRST complete version of the app idea from it.

Output ONLY a fenced JSON block — no other text:

\`\`\`update
{
  "features": ["8-12 concrete, specific features — what the app DOES, not vague goals"],
  "pitch": "2-3 sentence pitch: what it is, who it's for, why it wins",
  "targetAudience": "specific audience description",
  "monetization": "concrete monetization model"
}
\`\`\`

Rules:
- Features must be concrete and buildable (e.g. "offline-first task sync via local SQLite" not "great UX").
- Base everything on the analysis: target the weaknesses and gaps it found, keep the strengths.
- "features" must be the COMPLETE list.`;

/**
 * POST /api/refine/draft — draft the first version of a Hunter idea from its
 * market analysis. Body: { projectId, ideaId }.
 * Only runs when the idea has no features yet.
 */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const { projectId, ideaId } = await req.json().catch(() => ({}));
  if (!projectId || !ideaId) {
    return NextResponse.json(
      { error: "Missing projectId or ideaId." },
      { status: 400 }
    );
  }

  const idea = await prisma.idea.findFirst({
    where: { id: ideaId, projectId },
    include: { project: true },
  });
  if (!idea) {
    return NextResponse.json({ error: "Idea not found." }, { status: 404 });
  }

  let features: string[] = [];
  try {
    features = JSON.parse(idea.features ?? "[]");
  } catch {
    // ignore
  }
  if (features.length > 0) {
    return NextResponse.json(
      { error: "This idea already has features — refine it in chat instead." },
      { status: 400 }
    );
  }
  if (!idea.project.preferences) {
    return NextResponse.json(
      { error: "No market analysis to draft from." },
      { status: 400 }
    );
  }

  const reply = await chat(
    [
      { role: "system", content: DRAFT_SYSTEM },
      {
        role: "user",
        content: `App: ${idea.title}\n\nMarket analysis:\n${idea.project.preferences.slice(0, 12000)}`,
      },
    ],
    { temperature: 0.6, maxTokens: 2048 }
  );

  const match = reply.match(/```update\s*([\s\S]*?)\s*```/);
  if (!match) {
    return NextResponse.json(
      { error: "The AI didn't return a draft. Try again." },
      { status: 500 }
    );
  }

  let upd: any;
  try {
    upd = JSON.parse(match[1]);
  } catch {
    return NextResponse.json(
      { error: "The AI returned a bad draft. Try again." },
      { status: 500 }
    );
  }

  const data: any = {};
  if (Array.isArray(upd.features) && upd.features.length > 0)
    data.features = JSON.stringify(upd.features.map(String));
  if (typeof upd.pitch === "string" && upd.pitch.trim())
    data.pitch = upd.pitch.trim();
  if (typeof upd.targetAudience === "string" && upd.targetAudience.trim())
    data.targetAudience = upd.targetAudience.trim();
  if (typeof upd.monetization === "string" && upd.monetization.trim())
    data.monetization = upd.monetization.trim();

  if (!data.features) {
    return NextResponse.json(
      { error: "The AI didn't return features. Try again." },
      { status: 500 }
    );
  }

  const updated = await prisma.idea.update({
    where: { id: idea.id },
    data,
  });

  let newFeatures: string[] = [];
  try {
    newFeatures = JSON.parse(updated.features ?? "[]");
  } catch {
    // ignore
  }

  // Record the draft in the conversation history.
  const summary =
    `I've drafted the first version of "${updated.title}" from the market analysis — ` +
    `${newFeatures.length} features, pitch, audience, and monetization are set. ` +
    `Take a look at "The idea so far" and tell me what to change: add features, cut scope, or sharpen anything.`;
  await prisma.refineMessage.create({
    data: { projectId, ideaId, role: "assistant", content: summary },
  });

  return NextResponse.json({
    idea: {
      id: updated.id,
      title: updated.title,
      pitch: updated.pitch,
      features: newFeatures,
      targetAudience: updated.targetAudience,
      monetization: updated.monetization,
    },
    summary,
  });
}
