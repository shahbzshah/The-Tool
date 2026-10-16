import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

export async function GET(req: Request) {
  if (IS_BUILD) {
    return NextResponse.json({ ideas: [], building: true });
  }
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  // C5: user-scoped — only ideas from this user's projects.
  const ideas = await prisma.idea.findMany({
    where: { project: { userId: auth.user.id } },
    orderBy: { createdAt: "desc" },
    include: { project: { select: { category: true } } },
    take: 50,
  });
  return NextResponse.json({ ideas });
}
