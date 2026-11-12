import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** C5: ownership check — the idea's project must belong to the signed-in user. */
async function ownedIdea(userId: string, id: string) {
  return prisma.idea.findFirst({
    where: { id, project: { userId } },
    include: { project: { select: { id: true, category: true, preferences: true } } },
  });
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const idea = await ownedIdea(auth.user.id, params.id);
  if (!idea) {
    return NextResponse.json({ error: "Idea not found." }, { status: 404 });
  }
  return NextResponse.json({ idea });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  try {
    const body = await req.json();

    // C5: user-scoped lookup first so cross-user edits 404, not 403.
    const existing = await prisma.idea.findFirst({
      where: { id: params.id, project: { userId: auth.user.id } },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Idea not found." }, { status: 404 });
    }

    // Toggle favorite
    if (typeof body?.favorite === "boolean") {
      const idea = await prisma.idea.update({
        where: { id: params.id },
        data: { favorite: body.favorite },
      });
      return NextResponse.json({ idea });
    }

    // Direct pitch edit — typo fixes and small corrections without the AI
    // (the Refine chat is the normal path, but there must be a way to edit
    // a pitch when the AI is down). Same owner scoping as above. Snapshots
    // the current idea first so the change stays undoable from the History
    // panel, mirroring /api/refine/chat; a snapshot failure never breaks
    // the edit.
    if (typeof body?.pitch === "string" && body.pitch.trim()) {
      const current = await prisma.idea.findFirst({
        where: { id: params.id, project: { userId: auth.user.id } },
        select: {
          id: true,
          title: true,
          pitch: true,
          features: true,
          targetAudience: true,
          monetization: true,
        },
      });
      if (!current) {
        return NextResponse.json({ error: "Idea not found." }, { status: 404 });
      }
      const nextPitch = body.pitch.trim();
      if (nextPitch !== current.pitch) {
        try {
          await prisma.ideaVersion.create({
            data: {
              ideaId: current.id,
              title: current.title,
              pitch: current.pitch,
              features: current.features,
              targetAudience: current.targetAudience,
              monetization: current.monetization,
              note: "before manual edit: pitch",
            },
          });
        } catch (err) {
          console.error("[ideas] failed to snapshot idea version:", err);
        }
      }
      const idea = await prisma.idea.update({
        where: { id: params.id },
        data: { pitch: nextPitch },
      });
      return NextResponse.json({ idea });
    }

    const status = String(body?.status ?? "");
    if (!["draft", "approved"].includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }

    const idea = await prisma.idea.update({
      where: { id: params.id },
      data: { status },
    });
    return NextResponse.json({ idea });
  } catch {
    return NextResponse.json({ error: "Idea not found." }, { status: 404 });
  }
}
