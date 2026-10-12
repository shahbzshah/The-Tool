import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { chat, getModel } from "@/lib/ai";

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

If the user just wants to discuss or asks a question, reply normally with no update block.

SAVING THE REFINED BRIEF:
You also maintain the Refined Brief — the saved file that records every product decision from this conversation. Write it as a fenced block:

\`\`\`brief
# Refined Brief: {app title}
...full markdown brief: the problem, target user, final feature list (must-have vs later), what was cut and why, positioning vs the analyzed competitor, monetization, open questions...
\`\`\`

Rules for the brief block:
- Write it when the user says "save" (or similar), OR when the product definition has solidified after a few decisions — don't wait to be asked twice.
- UPDATE it whenever a later decision changes something already in the brief. Always write the COMPLETE new brief, not a diff.
- The brief block may appear in the same reply as an update block (update first, then brief).
- Keep the visible reply natural — one line saying the brief was saved/updated.`;

/**
 * GET /api/refine/chat?projectId=&ideaId= — load saved conversation history.
 */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const ideaId = url.searchParams.get("ideaId");
  if (!projectId || !ideaId) {
    return NextResponse.json({ error: "Missing projectId or ideaId." }, { status: 400 });
  }

  const messages = await prisma.refineMessage.findMany({
    where: { projectId, ideaId },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true, createdAt: true },
  });
  return NextResponse.json({ messages });
}

/**
 * POST /api/refine/chat — send one chat message about the analyzed opportunity.
 * Body: { projectId, ideaId, message: string }
 * History is loaded from the DB, the reply is saved, and the AI can update
 * the idea via fenced ```update JSON blocks.
 */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const { projectId, ideaId, message } = await req.json().catch(() => ({}));
  if (!projectId || !ideaId || !message || typeof message !== "string") {
    return NextResponse.json(
      { error: "Missing projectId, ideaId or message." },
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

  const history = await prisma.refineMessage.findMany({
    where: { projectId, ideaId },
    orderBy: { createdAt: "asc" },
    take: 40,
    select: { role: true, content: true },
  });

  const reply = await chat(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Here is everything about the idea so far:\n${context}` },
      ...history
        .filter((m) => typeof m.content === "string")
        .map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content.slice(0, 4000),
        })),
      { role: "user", content: message.slice(0, 4000) },
    ] as any,
    { temperature: 0.6, maxTokens: 2048 }
  );

  // Extract a trailing ```update block, apply it, strip it from the reply.
  // A ```brief block (anywhere in the reply) saves/updates the Refined Brief file.
  let cleaned = reply;
  let updatedIdea: any = null;
  let briefSaved = false;

  const briefMatch = reply.match(/```brief\s*([\s\S]*?)\s*```/);
  if (briefMatch && briefMatch[1].trim().length > 50) {
    const briefContent = briefMatch[1].trim().slice(0, 20000);
    await prisma.document.upsert({
      where: { ideaId_kind: { ideaId: idea.id, kind: "REFINED_BRIEF" } },
      create: { ideaId: idea.id, kind: "REFINED_BRIEF", content: briefContent },
      update: { content: briefContent },
    });
    briefSaved = true;
    cleaned = cleaned.replace(briefMatch[0], "").trim();
  }

  const match = cleaned.match(/```update\s*([\s\S]*?)\s*```\s*$/);
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

  // Persist both sides of the exchange.
  await prisma.refineMessage.createMany({
    data: [
      { projectId, ideaId, role: "user", content: message.slice(0, 4000) },
      { projectId, ideaId, role: "assistant", content: cleaned.slice(0, 8000) },
    ],
  });

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
    briefSaved,
    model: await getModel(),
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
