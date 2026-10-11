import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

export async function GET() {
  if (IS_BUILD) {
    return NextResponse.json({ ideas: [], building: true });
  }
  const ideas = await prisma.idea.findMany({
    orderBy: { createdAt: "desc" },
    include: { project: { select: { category: true } } },
    take: 50,
  });
  return NextResponse.json({ ideas });
}
