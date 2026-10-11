import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

/**
 * GET /api/projects — history feed: recent projects with their ideas.
 */
export async function GET() {
  if (IS_BUILD) {
    return NextResponse.json({ projects: [], building: true });
  }
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        ideas: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            title: true,
            pitch: true,
            scores: true,
            favorite: true,
            status: true,
            createdAt: true,
          },
        },
        stitchPrompt: { select: { id: true } },
      },
    });
    return NextResponse.json({ projects });
  } catch (err) {
    console.error("projects DB read failed:", err);
    return NextResponse.json(
      { error: "Temporarily unavailable — please retry in a moment." },
      { status: 503 }
    );
  }
}