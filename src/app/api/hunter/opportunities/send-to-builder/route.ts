import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * POST /api/hunter/opportunities/send-to-builder — push a scanned Play Store
 * opportunity into the build pipeline. Creates a Project with an approved
 * Idea, landing the user on the Design step.
 * Body: { id: string } (Opportunity id).
 */
export async function POST(req: Request) {
  const { id } = await req.json().catch(() => ({}));
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Missing opportunity id." }, { status: 400 });
  }

  const opp = await prisma.opportunity.findUnique({ where: { id } });
  if (!opp) {
    return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
  }

  let breakdown: Record<string, number> = {};
  try {
    breakdown = opp.breakdown ? JSON.parse(opp.breakdown) : {};
  } catch {
    // ignore
  }

  const project = await prisma.project.create({
    data: {
      name: opp.title,
      category: "from-play-store-scan",
      preferences: [
        `Source: Play Store scan (opportunity score ${opp.score}/100)`,
        opp.url ? `Play Store: ${opp.url}` : "",
        `Rating: ${opp.rating ?? "n/a"} · Installs: ${opp.installs ?? "n/a"} · Reviews: ${opp.reviewsCount?.toString() ?? "n/a"}`,
        breakdown.quality !== undefined
          ? `Score breakdown — quality ${breakdown.quality}, gap ${breakdown.gap}, market ${breakdown.market}, competition ${breakdown.competition}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      ideas: {
        create: {
          title: opp.title,
          pitch: `${opp.title} — rated ${opp.rating ?? "n/a"}★ with ${opp.installs ?? "unknown"} installs. Opportunity score ${opp.score}/100: high quality, low distribution. Build a better version capturing this underserved niche.`,
          features: JSON.stringify([]),
          targetAudience: `Users searching for "${opp.category ?? "this niche"}" apps on the Play Store`,
          monetization: null,
          status: "approved",
        },
      },
    },
    include: { ideas: true },
  });

  const idea = project.ideas[0];
  return NextResponse.json({
    projectId: project.id,
    ideaId: idea.id,
    designUrl: `/stitch/${project.id}?idea=${idea.id}`,
  });
}
