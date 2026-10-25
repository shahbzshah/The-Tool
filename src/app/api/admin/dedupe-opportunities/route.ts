import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/dedupe-opportunities — one-shot duplicate cleanup.
 * Auth: same cron auth as the watchlist job (CRON_SECRET bearer or Ed25519
 * body-bound signature). Body: { confirm: true }
 *
 * Cause: before the scan/watchlist write paths gained dedupe, every
 * re-scan — including the daily watchlist cron — created a fresh
 * Opportunity row for the same app + keyword, so the list showed the same
 * app once per scan. This collapses each (user, keyword, appId) group to
 * one row, preferring bookmarked, then most analyses, then newest.
 * Deleting an Opportunity cascades to its analyses and evidence rows.
 * New scans already update instead of duplicating, so this is one-time.
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
      { error: "Pass { confirm: true } to run the dedupe." },
      { status: 400 }
    );
  }

  const rows = await prisma.opportunity.findMany({
    select: {
      id: true,
      appId: true,
      title: true,
      isBookmarked: true,
      createdAt: true,
      scanJob: { select: { userId: true, keyword: true } },
      _count: { select: { analyses: true } },
    },
  });

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.scanJob?.userId ?? "?"}|${r.scanJob?.keyword ?? "?"}|${r.appId}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const toDelete: string[] = [];
  const examples: string[] = [];
  let dupGroups = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    dupGroups++;
    const sorted = [...list].sort((a, b) => {
      if (a.isBookmarked !== b.isBookmarked) return a.isBookmarked ? -1 : 1;
      if (a._count.analyses !== b._count.analyses)
        return b._count.analyses - a._count.analyses;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    const [, ...rest] = sorted;
    toDelete.push(...rest.map((r) => r.id));
    if (examples.length < 10) {
      examples.push(`${list[0].title} (kw: ${list[0].scanJob?.keyword}) x${list.length}`);
    }
  }

  let deleted = 0;
  if (toDelete.length > 0) {
    deleted = (
      await prisma.opportunity.deleteMany({ where: { id: { in: toDelete } } })
    ).count;
  }

  return NextResponse.json({
    ok: true,
    totalBefore: rows.length,
    duplicateGroups: dupGroups,
    deleted,
    examples,
  });
}
