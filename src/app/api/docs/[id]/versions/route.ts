import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/docs/[id]/versions — list saved versions of one document,
 * newest first. The requester must be signed in and the document must exist.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const doc = await prisma.document.findUnique({
    where: { id },
    include: { idea: { select: { id: true, title: true } } },
  });
  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const versions = await prisma.documentVersion.findMany({
    where: { documentId: id },
    orderBy: { version: "desc" },
    select: { id: true, version: true, content: true, createdAt: true },
  });
  return NextResponse.json({
    documentId: id,
    kind: doc.kind,
    ideaTitle: doc.idea.title,
    versions,
  });
}
