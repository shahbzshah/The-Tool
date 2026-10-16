import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

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
