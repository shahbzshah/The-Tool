import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron-auth";
import { ABANDONED_STATUSES } from "@/lib/hunter/intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/intake/purge — delete abandoned intake jobs older than 24h
 * (plan §7). Auth: same cron auth as the watchlist job (CRON_SECRET bearer <redacted> Ed25519
 * body-bound signature). Body: { confirm: true }.
 *
 * The same purge also runs opportunistically on every POST /api/intake,
 * so the rule holds even before this endpoint is wired to a scheduler.
 * Failed jobs are kept (the user may want to see and retry the error);
 * done jobs are kept (their opportunity link is the record).
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!(await verifyCronAuth(req, rawBody))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  let body: { confirm?: boolean };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (body.confirm !== true) {
    return NextResponse.json(
      { error: "Pass { confirm: true } to run the purge." },
      { status: 400 }
    );
  }
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
  const res = await prisma.intakeJob.deleteMany({
    where: {
      status: { in: [...ABANDONED_STATUSES] },
      createdAt: { lt: cutoff },
    },
  });
  return NextResponse.json({ deleted: res.count });
}
