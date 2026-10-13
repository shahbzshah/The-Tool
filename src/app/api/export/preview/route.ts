import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DOC_KINDS } from "@/lib/constants";
import { skillsForPlatform, getSkillsCacheStatus } from "@/lib/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/export/preview?ideaId= — what the export pack will contain.
 * Informational only; the download is allowed even with gaps.
 */
export async function GET(req: Request) {
  try {
    const ideaId = new URL(req.url).searchParams.get("ideaId");
    if (!ideaId) {
      return NextResponse.json(
        { error: "ideaId query param is required." },
        { status: 400 }
      );
    }

    const idea = await prisma.idea.findUnique({
      where: { id: ideaId },
      select: {
        id: true,
        projectId: true,
        project: { select: { platform: true } },
      },
    });
    if (!idea) {
      return NextResponse.json({ error: "Idea not found." }, { status: 404 });
    }

    const documents = await prisma.document.findMany({
      where: { ideaId },
      select: { kind: true },
    });
    const present = new Set(documents.map((d) => d.kind));
    const docs = DOC_KINDS.map((d) => ({
      kind: d.kind,
      label: d.label,
      present: present.has(d.kind),
    }));

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
      refinedBrief: present.has("REFINED_BRIEF"),
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
