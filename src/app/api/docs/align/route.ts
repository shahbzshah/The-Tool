import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateDocForIdea, STACK_SENSITIVE_KINDS } from "@/lib/docgen";
import { AIConfigError } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 800;

/**
 * POST /api/docs/align
 * Regenerates every stack-sensitive document (TECHNICAL_SPEC,
 * FOLDER_STRUCTURE, RULES, MASTER_PROMPT) so the whole doc set agrees on the
 * project's canonical stack. Requires a stack lock to be set.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const ideaId = String(body?.ideaId ?? "");

    const idea = await prisma.idea.findUnique({
      where: { id: ideaId },
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