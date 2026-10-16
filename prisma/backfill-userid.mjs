#!/usr/bin/env node
/**
 * prisma/backfill-userid.mjs
 *
 * Per-user isolation backfill (Phase 1 of the professional-audit fix).
 *
 * Assigns every existing row with a NULL userId to the oldest user
 * (by createdAt). Runs on every build; it is idempotent — rows that
 * already have a userId are never touched, so repeated runs are no-ops.
 *
 * Tables covered: Project, ScanJob, RefineMessage, AiUsage.
 *
 * Exits 0 in all cases (missing DATABASE_URL, no users yet, DB
 * unreachable) so builds without a live DB never fail on this step.
 * A later build with a reachable DB retries the backfill automatically.
 */

if (!process.env.DATABASE_URL) {
  console.log("[backfill-userid] DATABASE_URL not set — skipping.");
  process.exit(0);
}

const { PrismaClient } = await import("@prisma/client");

const prisma = new PrismaClient();
let code = 0;

try {
  const oldest = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!oldest) {
    process.exit(0); // no users yet — nothing to backfill
  }

  // [model label, Prisma delegate]
  const tables = [
    ["Project", prisma.project],
    ["ScanJob", prisma.scanJob],
    ["RefineMessage", prisma.refineMessage],
    ["AiUsage", prisma.aiUsage],
  ];

  for (const [label, delegate] of tables) {
    try {
      const res = await delegate.updateMany({
        where: { userId: null },
        data: { userId: oldest.id },
      });
      console.log(
        `[backfill-userid] ${label}: backfilled ${res.count} row(s) to user ${oldest.id}`
      );
    } catch (tableErr) {
      // e.g. AiUsage.userId is non-nullable in the schema, so a null
      // filter is rejected there — log and continue with other tables.
      console.warn(`[backfill-userid] ${label}: skipped (${tableErr.message})`);
    }
  }
  // Promote the oldest user to admin if no admin exists yet (existing
  // users predate the isAdmin column; the register route only auto-grants
  // admin to the first-ever signup).
  try {
    const adminCount = await prisma.user.count({ where: { isAdmin: true } });
    if (adminCount === 0) {
      await prisma.user.update({
        where: { id: oldest.id },
        data: { isAdmin: true },
      });
      console.log(`[backfill-userid] promoted oldest user ${oldest.id} to admin`);
    }
  } catch (adminErr) {
    console.warn(`[backfill-userid] admin promotion skipped (${adminErr.message})`);
  }
} catch (err) {
  console.warn(`[backfill-userid] warning: ${err.message} — continuing build`);
} finally {
  await prisma.$disconnect();
}

process.exit(code);
