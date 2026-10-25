import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getEvidencePacket } from "@/lib/hunter/evidence";

/**
 * GET /api/hunter/opportunities/[id]/evidence — the computed evidence
 * packet for one opportunity (wedge audit, velocity, review themes with
 * code-verified quotes, monetisation strip, freshness, trend slope, range
 * estimate, composite score, cross-check links).
 *
 * The packet is cached for 7 days; ?refresh=1 rebuilds it. Building runs
 * Play fetches (details + reviews, capped) and can take ~10–30s, so the
 * detail page loads the opportunity first and fetches this second.
 * Never throws: a failed build returns { evidence: null, note } and the
 * page degrades to scan-time data.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const opp = await prisma.opportunity.findFirst({
    where: { id: params.id, scanJob: { userId: auth.user.id } },
    select: { id: true },
  });
  if (!opp) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const url = new URL(req.url);
  const packet = await getEvidencePacket(opp.id, {
    force: url.searchParams.get("refresh") === "1",
  });
  if (!packet) {
    return NextResponse.json({
      evidence: null,
      note: "Evidence could not be built right now — Play data was unreachable. Scan-time scores still apply.",
    });
  }
  return NextResponse.json({ evidence: packet });
}
