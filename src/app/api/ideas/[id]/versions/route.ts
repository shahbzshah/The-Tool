import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ideas/[id]/versions — list idea snapshots (IdeaVersion rows),
 * newest first. Scoped: idea → project → signed-in user.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const idea = await prisma.idea.findFirst({
    where: { id: params.id, project: { userId: auth.user.id } },
    select: { id: true },
  });
  if (!idea) {
    return NextResponse.json({ error: "Idea not found." }, { status: 404 });
  }

  const versions = await prisma.ideaVersion.findMany({
    where: { ideaId: idea.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      note: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ versions });
}
