import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

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
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;
  // --- Worker F: archived filter ---
  const showArchived = new URL(req.url).searchParams.get("archived") === "1";
  // --- end Worker F addition ---
  try {
    const [projects, usage] = await Promise.all([
      prisma.project.findMany({
        // --- Worker F: hide archived by default ---
        // C5: user-scoped — never leak another user's projects.
        where: showArchived
          ? { userId: user.id }
          : { userId: user.id, archivedAt: null },
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
      // C5: user-scoped, matching the projects we return.
      prisma.aiUsage.groupBy({
        by: ["projectId"],
        where: { userId: user.id },
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