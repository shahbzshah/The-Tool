import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

async function ownedOpportunity(userId: string, id: string) {
  return prisma.opportunity.findFirst({
    where: { id, scanJob: { userId } },
  });
}

/** GET /api/hunter/opportunities/[id] — one opportunity with its analyses. */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const opp = await prisma.opportunity.findFirst({
    where: { id: params.id, scanJob: { userId: auth.user.id } },
    include: {
      analyses: { orderBy: { createdAt: "desc" } },
      scanJob: { select: { keyword: true } },
    },
  });
  if (!opp) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({
    opportunity: {
      ...opp,
      installsMin: opp.installsMin?.toString() ?? null,
      reviewsCount: opp.reviewsCount?.toString() ?? null,
    },
  });
}

/** PATCH /api/hunter/opportunities/[id] — toggle bookmark. Body: { isBookmarked: boolean } */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const opp = await ownedOpportunity(auth.user.id, params.id);
  if (!opp) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const { isBookmarked } = await req.json().catch(() => ({}));
  const updated = await prisma.opportunity.update({
    where: { id: opp.id },
    data: { isBookmarked: !!isBookmarked },
  });
  return NextResponse.json({
    opportunity: {
      ...updated,
      installsMin: updated.installsMin?.toString() ?? null,
      reviewsCount: updated.reviewsCount?.toString() ?? null,
    },
  });
}

/** DELETE /api/hunter/opportunities/[id] — delete the opportunity. */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const opp = await ownedOpportunity(auth.user.id, params.id);
  if (!opp) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  await prisma.opportunity.delete({ where: { id: opp.id } });
  return NextResponse.json({ ok: true });
}
