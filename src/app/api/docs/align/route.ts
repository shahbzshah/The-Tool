import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { checkAiQuota } from "@/lib/ai-quota";
import { generateDocForIdea, STACK_SENSITIVE_KINDS } from "@/lib/docgen";
import { AIConfigError } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/docs/align
 * Regenerates every stack-sensitive document (TECHNICAL_SPEC,
 * FOLDER_STRUCTURE, RULES, MASTER_PROMPT) so the whole doc set agrees on the
 * project's canonical stack. Requires a stack lock to be set.
 */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  // AI calls go through the daily per-user quota, same as /api/docs/generate.
  if (!(await checkAiQuota(auth.user.id))) {
    return NextResponse.json(
      { error: "Daily AI quota exceeded." },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const ideaId = String(body?.ideaId ?? "");

    // C5: user-scoped lookup — cross-user alignment 404s.
    const idea = await prisma.idea.findFirst({
      where: { id: ideaId, project: { userId: auth.user.id } },
      include: { project: { select: { stackLock: true } } },
    });
    if (!idea) {
      return NextResponse.json({ error: "Idea not found." }, { status: 404 });
    }
    if (!idea.project.stackLock?.trim()) {
      return NextResponse.json(
        { error: "Set a stack lock first — pick your canonical stack above." },
        { status: 400 }
      );
    }

    const docs = [];
    for (const kind of STACK_SENSITIVE_KINDS) {
      docs.push(await generateDocForIdea(ideaId, kind));
    }

    return NextResponse.json({ docs });
  } catch (err) {
    if (err instanceof AIConfigError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    const message =
      err instanceof Error ? err.message : "Failed to align documents.";
    console.error("Doc alignment failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}