import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/**
 * GET /api/hunter/opportunities/[id]/history — the score history of the app
 * behind an opportunity, ordered by scan time (oldest first). User-scoped:
 * the opportunity must belong to the signed-in user.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const opp = await prisma.opportunity.findFirst({
    where: { id: params.id, scanJob: { userId: auth.user.id } },
    select: { appId: true },
  });
  if (!opp) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const history = await prisma.opportunityScoreHistory.findMany({
    where: { userId: auth.user.id, appId: opp.appId },
    orderBy: { scannedAt: "asc" },
    select: { id: true, score: true, scannedAt: true },
  });

  return NextResponse.json({ history });
}
