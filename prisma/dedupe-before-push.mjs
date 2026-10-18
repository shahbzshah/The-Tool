#!/usr/bin/env node
/**
 * prisma/dedupe-before-push.mjs
 *
 * Removes duplicate Opportunity rows BEFORE `prisma db push` creates the
 * @@unique([scanJobId, appId]) index. The old code did blind createMany
 * with zero dedupe, so duplicates exist in production.
 *
 * Keeps one row per (scanJobId, appId): prefer bookmarked, then highest
 * score, then earliest created.
 *
 * Runs before `prisma db push` in the build. Idempotent. Exits 0 always.
 */

if (!process.env.DATABASE_URL) {
  console.log("[dedupe] DATABASE_URL not set — skipping.");
  process.exit(0);
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

try {
  // Find (scanJobId, appId) pairs with more than one row.
  const dupes = await prisma.$queryRaw`
    SELECT "scanJobId", "appId", COUNT(*) as cnt
    FROM "Opportunity"
    WHERE "scanJobId" IS NOT NULL
    GROUP BY "scanJobId", "appId"
    HAVING COUNT(*) > 1
  `;

  let removed = 0;
  for (const d of dupes) {
    const rows = await prisma.opportunity.findMany({
      where: { scanJobId: d.scanJobId, appId: d.appId },
      orderBy: [
        { isBookmarked: "desc" },
        { score: "desc" },
        { createdAt: "asc" },
      ],
      select: { id: true },
    });
    // Keep the first (best), delete the rest.
    const toDelete = rows.slice(1).map((r) => r.id);
    if (toDelete.length > 0) {
      // Delete analyses first (FK), then the opportunities.
      await prisma.opportunityAnalysis.deleteMany({
        where: { opportunityId: { in: toDelete } },
      });
      await prisma.opportunity.deleteMany({
        where: { id: { in: toDelete } },
      });
      removed += toDelete.length;
    }
  }
  console.log(`[dedupe] removed ${removed} duplicate opportunity row(s)`);
} catch (err) {
  console.warn(`[dedupe] warning: ${err.message} — continuing build`);
} finally {
  await prisma.$disconnect();
}

process.exit(0);
