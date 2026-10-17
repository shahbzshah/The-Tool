import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ownership check: the project must belong to the signed-in user (404 otherwise). */
async function ownedProject(userId: string, id: string) {
  return prisma.project.findFirst({
    where: { id, userId },
    select: { id: true, name: true, stackLock: true, decisions: true },
  });
}

/** GET /api/projects/[id] — project incl. stack lock. */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const project = await ownedProject(auth.user.id, params.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  return NextResponse.json({ project });
}

/**
 * PATCH /api/projects/[id] — update project fields.
 * Body may include any of:
 *   { stackLock: string | null }   — set or clear the canonical tech stack lock
 *   { name: string }                — rename (non-empty, max 200 chars)
 *   { notes: string | null }        — free-text notes (empty string clears)
 *   { archived: boolean }           — true sets archivedAt, false clears it
 *   { decisions: string | null }     — JSON array string of applied refine
 *                                     decisions (null clears the log)
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  try {
    const body = await req.json();
    const data: {
      stackLock?: string | null;
      name?: string;
      notes?: string | null;
      archivedAt?: Date | null;
      decisions?: string | null;
    } = {};

    // --- Worker F: extended PATCH fields (rename / notes / archive) ---
    if ("name" in body) {
      const name = String(body.name).trim().slice(0, 200);
      if (!name) {
        return NextResponse.json(
          { error: "Name must not be empty." },
          { status: 400 }
        );
      }
      data.name = name;
    }

    if ("notes" in body) {
      const raw = body.notes;
      data.notes =
        raw === null || String(raw).trim() === ""
          ? null
          : String(raw).slice(0, 20000);
    }

    if ("archived" in body) {
      data.archivedAt = body.archived ? new Date() : null;
    }
    // --- end Worker F addition ---

    if ("stackLock" in body) {
      const raw = body.stackLock;
      data.stackLock =
        raw === null ? null : String(raw).trim().slice(0, 2000) || null;
    }

    // Decisions log — stored as a JSON array string so the Refine page can
    // rebuild the panel after a refresh.
    if ("decisions" in body) {
      const raw = body.decisions;
      if (raw === null) {
        data.decisions = null;
      } else {
        const str = String(raw);
        let parsed: unknown;
        try {
          parsed = JSON.parse(str);
        } catch {
          return NextResponse.json(
            { error: "decisions must be a JSON array string." },
            { status: 400 }
          );
        }
        if (!Array.isArray(parsed)) {
          return NextResponse.json(
            { error: "decisions must be a JSON array string." },
            { status: 400 }
          );
        }
        data.decisions = str.slice(0, 20000);
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No updatable field provided (name, notes, archived, stackLock, decisions)." },
        { status: 400 }
      );
    }

    // C5: user-scoped lookup first so cross-user updates 404, not 403.
    const existing = await ownedProject(auth.user.id, params.id);
    if (!existing) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const project = await prisma.project.update({
      where: { id: params.id },
      data,
      select: {
        id: true,
        name: true,
        notes: true,
        archivedAt: true,
        stackLock: true,
        decisions: true,
      },
    });
    return NextResponse.json({ project });
  } catch {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
}

// --- Worker F: DELETE /api/projects/[id] ---
/**
 * DELETE /api/projects/[id] — delete a project. Prisma cascades remove its
 * ideas, documents (+ versions), uploads, and stitch prompt records; orphaned
 * AiUsage rows are cleaned up explicitly since they carry no relation.
 */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  try {
    // C5: user-scoped lookup first so cross-user deletes 404, not 403.
    const existing = await ownedProject(auth.user.id, params.id);
    if (!existing) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    await prisma.$transaction([
      prisma.aiUsage.deleteMany({ where: { projectId: params.id } }),
      prisma.project.delete({ where: { id: params.id } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
}
// --- end Worker F addition ---
