#!/usr/bin/env node
/**
 * prisma/dedupe-before-push.mjs
 * Removes duplicate Opportunity rows BEFORE `prisma db push` creates the
 * @@unique([scanJobId, appId]) index. Idempotent. Exits 0 always.
 */

if (!process.env.DATABASE_URL) {
  console.log("[dedupe] DATABASE_URL not set — skipping.");
  process.exit(0);
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

try {
  const all = await prisma.opportunity.findMany({
    where: { scanJobId: { not: null } },
    select: { id: true, scanJobId: true, appId: true, isBookmarked: true, score: true, createdAt: true },
  });
  const byKey = new Map();
  for (const r of all) {
    const key = r.scanJobId + "::" + r.appId;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(r);
  }
  let removed = 0;
  for (const rows of byKey.values()) {
    if (rows.length < 2) continue;
    rows.sort((a, b) => {
      if (a.isBookmarked !== b.isBookmarked) return b.isBookmarked - a.isBookmarked;
      if (a.score !== b.score) return b.score - a.score;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
    const toDelete = rows.slice(1).map((r) => r.id);
    await prisma.opportunityAnalysis.deleteMany({ where: { opportunityId: { in: toDelete } } });
    await prisma.opportunity.deleteMany({ where: { id: { in: toDelete } } });
    removed += toDelete.length;
  }
  console.log("[dedupe] removed " + removed + " duplicate opportunity row(s)");
} catch (err) {
  console.warn("[dedupe] warning: " + err.message + " — continuing build");
} finally {
  await prisma.$disconnect();
}

process.exit(0);
