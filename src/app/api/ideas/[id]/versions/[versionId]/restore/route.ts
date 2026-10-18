import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ideas/[id]/versions/[versionId]/restore — copy a snapshot's
 * fields back onto the idea. The current state is snapshotted first (note
 * "before restore"), so restoring is itself undoable.
 * Scoped: idea → project → signed-in user.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string; versionId: string } }
) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const idea = await prisma.idea.findFirst({
    where: { id: params.id, project: { userId: auth.user.id } },
  });
  if (!idea) {
    return NextResponse.json({ error: "Idea not found." }, { status: 404 });
  }

  const version = await prisma.ideaVersion.findFirst({
    where: { id: params.versionId, ideaId: idea.id },
  });
  if (!version) {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }

  // Snapshot the current state first — restore is undoable. Best-effort:
  // a snapshot failure must never block the restore itself.
  try {
    await prisma.ideaVersion.create({
      data: {
        ideaId: idea.id,
        title: idea.title,
        pitch: idea.pitch,
        features: idea.features,
        targetAudience: idea.targetAudience,
        monetization: idea.monetization,
        note: "before restore",
      },
    });
  } catch (err) {
    console.error("[ideas/versions] failed to snapshot before restore:", err);
  }

  const updated = await prisma.idea.update({
    where: { id: idea.id },
    data: {
      title: version.title,
      pitch: version.pitch,
      features: version.features,
      targetAudience: version.targetAudience,
      monetization: version.monetization,
    },
  });

  let features: string[] = [];
  try {
    features = JSON.parse(updated.features ?? "[]");
  } catch {
    // ignore
  }
  return NextResponse.json({ idea: { ...updated, features } });
}
