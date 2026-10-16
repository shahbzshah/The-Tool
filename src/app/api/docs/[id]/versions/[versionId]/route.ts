import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/docs/[id]/versions/[versionId] — read one saved document
 * version's full content. The versions list endpoint intentionally omits
 * content (payload size), so the docs-page history preview fetches it on
 * demand here. The requester must be signed in and the version must belong
 * to the document.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const { id, versionId } = await params;
  const version = await prisma.documentVersion.findFirst({
    where: { id: versionId, documentId: id },
    select: { id: true, version: true, content: true, createdAt: true },
  });
  if (!version) {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }
  return NextResponse.json({ version });
}
