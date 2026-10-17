import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { AI_DAILY_QUOTA } from "@/lib/ai-quota";
import { formatTokens, getProjectTokens } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/usage — the signed-in user's AI usage in the last 24h
 * vs the daily quota. Fails open: returns 0 on DB error.
 *
 * GET /api/usage?projectId=… — total AI tokens logged for one project
 * (sum of all logged AiUsage rows, in + out), with a display string.
 */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const projectId = new URL(req.url).searchParams.get("projectId");
  if (projectId) {
    // C5: user-scoped lookup so cross-user usage queries 404, not 403.
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    const tokens = await getProjectTokens(projectId);
    return NextResponse.json({ tokens, display: formatTokens(tokens) });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let used = 0;
  try {
    used = await prisma.aiUsage.count({
      where: { userId: user.id, createdAt: { gte: since } },
    });
  } catch (err) {
    console.error("[usage] count failed:", err);
  }
  return NextResponse.json({
    ok: true,
    used,
    quota: AI_DAILY_QUOTA,
    remaining: Math.max(0, AI_DAILY_QUOTA - used),
  });
}
