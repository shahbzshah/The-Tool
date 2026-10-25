import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/hunter/opportunities — the signed-in user's opportunities across
 * all their scans. Query: ?search= &bookmarked=1 &page=1 &perPage=20
 */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const url = new URL(req.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const bookmarkedOnly = url.searchParams.get("bookmarked") === "1";
  const keywordFilter = url.searchParams.get("keyword")?.trim() ?? "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const perPage = Math.min(
    50,
    Math.max(1, parseInt(url.searchParams.get("perPage") ?? "20", 10) || 20)
  );

  const where: any = { scanJob: { userId: user.id } };
  if (bookmarkedOnly) where.isBookmarked = true;
  if (search) where.title = { contains: search, mode: "insensitive" };
  if (keywordFilter) where.scanJob = { userId: user.id, keyword: keywordFilter };

  // Defensive collapse: the same app must never appear twice in the list,
  // even if a racing pair of scans created duplicate rows before the
  // write-path dedupe could collapse them. Group by (appId, keyword),
  // keeping bookmarked rows, then the newest, then sort by score for
  // display. Pagination runs on the collapsed list so page counts stay true.
  const all = await prisma.opportunity.findMany({
    where,
    orderBy: [{ isBookmarked: "desc" }, { createdAt: "desc" }],
    include: {
      scanJob: { select: { keyword: true, createdAt: true } },
    },
  });
  const seen = new Set<string>();
  const collapsed = all.filter((o) => {
    const key = `${o.appId}|${o.scanJob?.keyword ?? "?"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  collapsed.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const total = collapsed.length;
  const opportunities = collapsed.slice((page - 1) * perPage, page * perPage);

  return NextResponse.json({
    opportunities: opportunities.map((o) => ({
      ...o,
      installsMin: o.installsMin?.toString() ?? null,
      reviewsCount: o.reviewsCount?.toString() ?? null,
    })),
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  });
}
