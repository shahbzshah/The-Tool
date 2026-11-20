import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { DOC_KINDS } from "@/lib/constants";
import { snapshotDocVersion } from "@/lib/docgen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

export async function GET(req: Request) {
  if (IS_BUILD) {
    return NextResponse.json({ docs: [], building: true });
  }
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const ideaId = new URL(req.url).searchParams.get("ideaId");
  if (!ideaId) {
    return NextResponse.json(
      { error: "ideaId query param is required." },
      { status: 400 }
    );
  }
  // C5: verify the idea belongs to this user — cross-user access 404s.
  const idea = await prisma.idea.findFirst({
    where: { id: ideaId, project: { userId: auth.user.id } },
    select: { id: true },
  });
  if (!idea) {
    return NextResponse.json({ error: "Idea not found." }, { status: 404 });
  }
  const docs = await prisma.document.findMany({
    where: { ideaId },
    select: { id: true, ideaId: true, kind: true, content: true, updatedAt: true },
  });
  return NextResponse.json({ docs });
}

/**
 * PUT /api/docs — save a document's content by hand (the Docs page editor
 * popup). Lets the user write or fix any document, including one with no
 * AI generation path (e.g. Voice Spec on an idea with no voice feature).
 * Snapshots the previous version first, so hand edits keep history exactly
 * like AI generations do.
 */
export async function PUT(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  try {
    const body = await req.json();
    const ideaId = String(body?.ideaId ?? "");
    const kind = String(body?.kind ?? "");
    const content = String(body?.content ?? "");
    if (!ideaId || !kind) {
      return NextResponse.json(
        { error: "ideaId and kind are required." },
        { status: 400 }
      );
    }
    if (!DOC_KINDS.some((d) => d.kind === kind)) {
      return NextResponse.json(
        { error: `Unknown document kind: ${kind}.` },
        { status: 400 }
      );
    }
    const text = content.trim();
    if (!text) {
      return NextResponse.json(
        { error: "Write something first — empty documents cannot be saved." },
        { status: 400 }
      );
    }
    if (text.length > 200000) {
      return NextResponse.json(
        { error: "Document is too long (200,000 character limit)." },
        { status: 400 }
      );
    }
    // C5: verify the idea belongs to this user — cross-user access 404s.
    const idea = await prisma.idea.findFirst({
      where: { id: ideaId, project: { userId: auth.user.id } },
      select: { id: true },
    });
    if (!idea) {
      return NextResponse.json({ error: "Idea not found." }, { status: 404 });
    }
    await snapshotDocVersion(ideaId, kind);
    const doc = await prisma.document.upsert({
      where: { ideaId_kind: { ideaId, kind } },
      create: { ideaId, kind, content: text },
      update: { content: text },
    });
    return NextResponse.json({ doc });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save document.";
    console.error("Doc manual save failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
