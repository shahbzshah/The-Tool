import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

export async function GET(req: Request) {
  if (IS_BUILD) {
    return NextResponse.json({ docs: [], building: true });
  }
  const ideaId = new URL(req.url).searchParams.get("ideaId");
  if (!ideaId) {
    return NextResponse.json(
      { error: "ideaId query param is required." },
      { status: 400 }
    );
  }
  const docs = await prisma.document.findMany({
    where: { ideaId },
    select: { id: true, ideaId: true, kind: true, content: true, updatedAt: true },
  });
  return NextResponse.json({ docs });
}
