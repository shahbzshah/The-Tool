import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { serializeIntakeJob } from "@/lib/hunter/intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

async function ownedJob(userId: string, id: string) {
  return prisma.intakeJob.findFirst({ where: { id, userId } });
}

/** GET /api/intake/:id — poll job status (same pattern as scan jobs). */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  if (IS_BUILD) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const job = await ownedJob(auth.user.id, params.id);
  if (!job) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ job: serializeIntakeJob(job) });
}

/** DELETE /api/intake/:id — delete job + stored media. */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const job = await ownedJob(auth.user.id, params.id);
  if (!job) return NextResponse.json({ error: "Not found." }, { status: 404 });
  await prisma.intakeJob.delete({ where: { id: job.id } });
  return NextResponse.json({ deleted: true });
}
