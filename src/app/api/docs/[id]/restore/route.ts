import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { snapshotDocVersion } from "@/lib/docgen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/docs/[id]/restore — restore a saved DocumentVersion into the
 * document's live content. The document's CURRENT content is snapshotted as a
 * new version first, so restoring never loses history.
 * Body: { versionId: string }
 * C6: scoped through idea -> project.userId (cross-user access 404s).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const versionId = String(body?.versionId ?? "");
  if (!versionId) {
    return NextResponse.json(
      { error: "versionId is required." },
      { status: 400 }
    );
  }

  const version = await prisma.documentVersion.findFirst({
    where: {
      id: versionId,
      documentId: id,
      document: { idea: { project: { userId: auth.user.id } } },
    },
    include: { document: { select: { id: true } } },
  });
  if (!version) {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }

  // Snapshot the live content first — the restore itself becomes revertible.
  const doc = await prisma.document.findUnique({
    where: { id },
    select: { ideaId: true, kind: true },
  });
  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  await snapshotDocVersion(doc.ideaId, doc.kind);

  const updated = await prisma.document.update({
    where: { id },
    data: { content: version.content },
    select: { id: true, kind: true, content: true, updatedAt: true },
  });
  return NextResponse.json({
    doc: updated,
    restoredFrom: version.version,
  });
}
