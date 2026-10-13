import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

/**
 * GET /api/projects — history feed: recent projects with their ideas.
 * Archived projects are hidden unless ?archived=1 is passed.
 */
export async function GET(req: Request) {
  if (IS_BUILD) {
    return NextResponse.json({ projects: [], building: true });
  }
  // --- Worker F: archived filter ---
  const showArchived = new URL(req.url).searchParams.get("archived") === "1";
  // --- end Worker F addition ---
  try {
    const [projects, usage] = await Promise.all([
      prisma.project.findMany({
        // --- Worker F: hide archived by default ---
        where: showArchived ? undefined : { archivedAt: null },
        // --- end Worker F addition ---
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
              // Pipeline derivation: which docs each idea has.
              documents: { select: { kind: true } },
            },
          },
          uploads: { select: { id: true } },
          stitchPrompt: { select: { id: true } },
        },
      }),
      // Per-project AI token totals for the history cards.
      prisma.aiUsage.groupBy({
        by: ["projectId"],
        _sum: { tokensIn: true, tokensOut: true },
      }),
    ]);
    const tokenByProject = new Map<string, number>();
    for (const row of usage) {
      if (!row.projectId) continue;
      tokenByProject.set(
        row.projectId,
        (row._sum.tokensIn ?? 0) + (row._sum.tokensOut ?? 0)
      );
    }
    const withMeta = projects.map((p) => ({
      ...p,
      aiTokens: tokenByProject.get(p.id) ?? 0,
    }));
    return NextResponse.json({ projects: withMeta });
  } catch (err) {
    console.error("projects DB read failed:", err);
    return NextResponse.json(
      { error: "Temporarily unavailable — please retry in a moment." },
      { status: 503 }
    );
  }
}