import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/uploads/[id] — fetch one upload's content for preview.
 * Ownership checked via the parent project.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const upload = await prisma.upload.findFirst({
    where: {
      id,
      project: { userId: auth.user.id },
    },
    select: { id: true, filename: true, type: true, content: true },
  });
  if (!upload) {
    return NextResponse.json({ error: "Upload not found." }, { status: 404 });
  }
  return NextResponse.json({ upload });
}
