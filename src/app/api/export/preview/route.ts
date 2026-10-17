import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { DOC_KINDS } from "@/lib/constants";
import { skillsForPlatform, getSkillsCacheStatus } from "@/lib/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/export/preview?ideaId= — what the export pack will contain.
 * Informational only; the download is allowed even with gaps.
 */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  try {
    const ideaId = new URL(req.url).searchParams.get("ideaId");
    if (!ideaId) {
      return NextResponse.json(
        { error: "ideaId query param is required." },
        { status: 400 }
      );
    }

    // C5: user-scoped lookup — cross-user previews 404.
    const idea = await prisma.idea.findFirst({
      where: { id: ideaId, project: { userId: auth.user.id } },
      select: {
        id: true,
        projectId: true,
        updatedAt: true,
        project: { select: { platform: true } },
      },
    });
    if (!idea) {
      return NextResponse.json({ error: "Idea not found." }, { status: 404 });
    }

    const documents = await prisma.document.findMany({
      where: { ideaId },
      select: { kind: true, updatedAt: true },
    });
    const docAt = new Map(documents.map((d) => [d.kind, d.updatedAt]));
    const ideaAt = idea.updatedAt.getTime();
    const docs = DOC_KINDS.map((d) => {
      const at = docAt.get(d.kind);
      // Stale when the idea was updated after the doc was generated.
      // 1s tolerance for clock skew between generate and idea timestamps.
      const stale = at != null && ideaAt > at.getTime() + 1000;
      return {
        kind: d.kind,
        label: d.label,
        present: at != null,
        stale,
      };
    });

    const [uploadTotal, uploadIncludable] = await Promise.all([
      prisma.upload.count({ where: { projectId: idea.projectId } }),
      prisma.upload.count({
        where: { projectId: idea.projectId, content: { not: null } },
      }),
    ]);

    const skillNames = skillsForPlatform(idea.project.platform);
    const cacheStatus = getSkillsCacheStatus(skillNames);

    return NextResponse.json({
      platform: idea.project.platform,
      docs,
      refinedBrief: docAt.has("REFINED_BRIEF"),
      uploads: { total: uploadTotal, includable: uploadIncludable },
      skills: {
        names: skillNames,
        status: cacheStatus.cached ? "cached" : "will-download",
        cachedCount: cacheStatus.cachedNames.length,
      },
    });
  } catch (err) {
    console.error("Export preview failed:", err);
    return NextResponse.json({ error: "Preview failed." }, { status: 500 });
  }
}
