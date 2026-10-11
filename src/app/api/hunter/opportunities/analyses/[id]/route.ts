import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/**
 * DELETE /api/hunter/opportunities/analyses/[id] — delete one AI analysis
 * so a fresh one can be generated.
 */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const analysis = await prisma.opportunityAnalysis.findFirst({
    where: {
      id: params.id,
      opportunity: { scanJob: { userId: auth.user.id } },
    },
  });
  if (!analysis) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  await prisma.opportunityAnalysis.delete({ where: { id: analysis.id } });
  return NextResponse.json({ ok: true });
}
