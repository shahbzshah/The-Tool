import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { checkConsistency } from "@/lib/consistency";
import { detectDecisions } from "@/lib/decisions";
import { applicableKinds } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/docs/consistency?ideaId= — deterministic doc-consistency report
 * plus detected technical decisions from the current documents.
 *
 * No AI calls. Fast enough to run on every Docs page load: it tells the
 * user which documents disagree, which required docs are missing, and what
 * the existing docs collectively claim, so a human can lock the winner.
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

    const idea = await prisma.idea.findFirst({
      where: { id: ideaId, project: { userId: auth.user.id } },
      include: {
        documents: { select: { kind: true, content: true } },
        project: { select: { techDecisions: true, category: true } },
      },
    });
    if (!idea) {
      return NextResponse.json({ error: "Idea not found." }, { status: 404 });
    }

    let features: string[] = [];
    try {
      const parsed = JSON.parse(idea.features);
      if (Array.isArray(parsed)) features = parsed.map(String);
    } catch {
      // leave empty
    }

    const report = checkConsistency({
      docs: idea.documents,
      idea: {
        title: idea.title,
        pitch: idea.pitch,
        features,
        category: idea.project.category,
      },
      techDecisionsRaw: idea.project.techDecisions,
    });

    return NextResponse.json({
      ...report,
      detected: detectDecisions(idea.documents),
      applicableKinds: applicableKinds({
        title: idea.title,
        pitch: idea.pitch,
        features,
        category: idea.project.category,
      }).map((d) => d.kind),
    });
  } catch (err) {
    console.error("Consistency check failed:", err);
    return NextResponse.json(
      { error: "Consistency check failed." },
      { status: 500 }
    );
  }
}
