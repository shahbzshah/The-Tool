import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { chat } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You are a product strategist helping refine a mobile app idea before it goes to visual design. The user has an AI market analysis of a real Play Store opportunity and wants to discuss it with you: add features, cut scope, sharpen the audience, decide the MVP.

You have the full analysis and the current idea definition below. Talk like a sharp product partner: concrete, opinionated, brief. Ask one good question at a time when something is genuinely undecided. Don't lecture.

IMPORTANT — WRITING BACK TO THE IDEA:
When the conversation reaches a concrete decision (a feature added/cut, audience sharpened, pitch rewritten, monetization chosen), append a fenced JSON block at the very end of your reply so the idea gets updated:

\`\`\`update
{
  "features": ["full updated feature list"],
  "pitch": "updated pitch, or omit if unchanged",
  "targetAudience": "updated audience, or omit if unchanged",
  "monetization": "updated monetization, or omit if unchanged"
}
\`\`\`

Rules for the update block:
- Only include it when something actually changed. Never include it just to echo.
- "features" must always be the COMPLETE new list, not just the delta.
- Omit keys that didn't change.
- The user sees your words, not the JSON — keep the visible reply natural and mention what you updated in one line.

If the user just wants to discuss or asks a question, reply normally with no update block.`;

/**
 * POST /api/refine/chat — chat with the AI about the analyzed opportunity.
 * Body: { projectId, ideaId, messages: [{ role: "user"|"assistant", content }] }
 * The AI can update the idea via fenced ```update JSON blocks; the API
 * applies them and returns the cleaned reply plus the refreshed idea.
 */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const { projectId, ideaId, messages } = await req.json().catch(() => ({}));
  if (!projectId || !ideaId || !Array.isArray(messages)) {
    return NextResponse.json({ error: "Missing projectId, ideaId or messages." }, { status: 400 });
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

  const context = [
    `App idea: ${idea.title}`,
    `Current pitch: ${idea.pitch}`,
    `Current features: ${features.length ? features.join("; ") : "(none yet)"}`,
    `Target audience: ${idea.targetAudience}`,
    `Monetization: ${idea.monetization ?? "(undecided)"}`,
    idea.project.preferences
      ? `\nMarket analysis:\n${idea.project.preferences}`
      : "",
  ].join("\n");

  const reply = await chat(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Here is everything about the idea so far:\n${context}` },
      ...messages
        .filter((m: any) => m && typeof m.content === "string")
        .slice(-20)
        .map((m: any) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content.slice(0, 4000),
        })),
    ] as any,
    { temperature: 0.6, maxTokens: 2048 }
  );

  // Extract a trailing ```update block, apply it, strip it from the reply.
  let cleaned = reply;
  let updatedIdea: any = null;
  const match = reply.match(/```update\s*([\s\S]*?)\s*```\s*$/);
  if (match) {
    cleaned = reply.slice(0, match.index).trim();
    try {
      const upd = JSON.parse(match[1]);
      const data: any = {};
      if (Array.isArray(upd.features)) data.features = JSON.stringify(upd.features);
      if (typeof upd.pitch === "string" && upd.pitch.trim()) data.pitch = upd.pitch.trim();
      if (typeof upd.targetAudience === "string" && upd.targetAudience.trim())
        data.targetAudience = upd.targetAudience.trim();
      if (typeof upd.monetization === "string" && upd.monetization.trim())
        data.monetization = upd.monetization.trim();
      if (Object.keys(data).length > 0) {
        updatedIdea = await prisma.idea.update({
          where: { id: idea.id },
          data,
        });
      }
    } catch {
      // Malformed update block — leave the idea untouched.
    }
  }

  let refreshedFeatures: string[] = features;
  if (updatedIdea) {
    try {
      refreshedFeatures = JSON.parse(updatedIdea.features ?? "[]");
    } catch {
      // ignore
    }
  }

  return NextResponse.json({
    reply: cleaned,
    idea: updatedIdea
      ? {
          id: updatedIdea.id,
          title: updatedIdea.title,
          pitch: updatedIdea.pitch,
          features: refreshedFeatures,
          targetAudience: updatedIdea.targetAudience,
          monetization: updatedIdea.monetization,
        }
      : null,
  });
}
