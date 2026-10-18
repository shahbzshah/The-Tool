import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

/**
 * GET /api/projects — history feed: recent projects with their ideas.
 * Archived projects are hidden unless ?archived=1 is passed.
 * Text search: ?q= matches project name/category or idea title/pitch.
 * Pagination: ?page= (1-based) & ?limit= (default 30, max 100).
 * Returns { projects, hasMore }.
 */
export async function GET(req: Request) {
  if (IS_BUILD) {
    return NextResponse.json({ projects: [], building: true });
  }
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const params = new URL(req.url).searchParams;
  // --- Worker F: archived filter ---
  const showArchived = params.get("archived") === "1";
  // --- end Worker F addition ---
  const q = (params.get("q") ?? "").trim();
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(params.get("limit") ?? "30", 10) || 30)
  );
  const offset = (page - 1) * limit;
  try {
    // --- Worker F: hide archived by default ---
    // C5: user-scoped — never leak another user's projects.
    const baseWhere = showArchived
      ? { userId: user.id }
      : { userId: user.id, archivedAt: null };
    // --- end Worker F addition ---
    const where = q
      ? {
          AND: [
            baseWhere,
            {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { category: { contains: q, mode: "insensitive" as const } },
                {
                  ideas: {
                    some: {
                      OR: [
                        { title: { contains: q, mode: "insensitive" as const } },
                        { pitch: { contains: q, mode: "insensitive" as const } },
                      ],
                    },
                  },
                },
              ],
            },
          ],
        }
      : baseWhere;
    const fetched = await prisma.project.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit + 1,
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
      });
    const hasMore = fetched.length > limit;
    const projects = hasMore ? fetched.slice(0, limit) : fetched;
    const projectIds = projects.map((p) => p.id);
    const usage = await prisma.aiUsage.groupBy({
      by: ["projectId"],
      where: { userId: user.id, projectId: { in: projectIds } },
      _sum: { tokensIn: true, tokensOut: true },
    });
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
    return NextResponse.json({ projects: withMeta, hasMore });
  } catch (err) {
    console.error("projects DB read failed:", err);
    return NextResponse.json(
      { error: "Temporarily unavailable — please retry in a moment." },
      { status: 503 }
    );
  }
}