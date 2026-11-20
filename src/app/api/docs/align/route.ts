import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { checkAiQuota } from "@/lib/ai-quota";
import { generateDocForIdea, STACK_SENSITIVE_KINDS } from "@/lib/docgen";
import { applicableKinds } from "@/lib/constants";
import { AIConfigError } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/docs/align
 * Regenerates stack-sensitive documents so the whole doc set agrees on the
 * project's canonical stack. Requires a stack lock to be set.
 *
 * Body { ideaId, kind? }: a kind narrows the pass to that one document —
 * the panel aligns kinds one at a time with per-kind progress, so each call
 * must regenerate only that kind. Before this, every call regenerated ALL
 * stack-sensitive kinds, so one click was ~32 sequential AI generations
 * behind a 60s limit and Vercel killed it with a non-JSON error page.
 * Without a kind, all applicable stack-sensitive kinds are regenerated.
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
      include: { project: { select: { stackLock: true, category: true } } },
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

    // Only align kinds that apply to this idea — a habit tracker must not
    // gain an irrelevant voice/sync spec from the align pass.
    let features: string[] = [];
    try {
      const parsed = JSON.parse(idea.features);
      if (Array.isArray(parsed)) features = parsed.map(String);
    } catch {
      // leave empty
    }
    const applicable = applicableKinds({
      title: idea.title,
      pitch: idea.pitch,
      features,
      category: idea.project.category,
    }).map((d) => d.kind);
    // A requested kind narrows the pass to that one document (see header).
    const requestedKind = String(body?.kind ?? "");
    const candidates = requestedKind
      ? STACK_SENSITIVE_KINDS.filter((k) => k === requestedKind)
      : [...STACK_SENSITIVE_KINDS];
    if (requestedKind && candidates.length === 0) {
      return NextResponse.json(
        { error: `Kind ${requestedKind} is not stack-sensitive.` },
        { status: 400 }
      );
    }
    const kinds = candidates.filter((k) => applicable.includes(k));

    const docs = [];
    for (const kind of kinds) {
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