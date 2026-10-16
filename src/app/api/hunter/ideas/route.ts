import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ideasFeed } from "@/lib/hunter/trends";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * During `next build`, Next.js may statically evaluate this route. Neon is
 * suspended then, so touching the DB would fail the build. Skip DB access
 * while building and return an empty feed — the real data is served at runtime.
 */
const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

/**
 * GET /api/hunter/ideas — trending app ideas (Hacker News).
 * Cached in the database for 6 hours; empty results cached 5 min.
 * M29: the list only selects { id, title, source, hotness, url, createdAt } —
 * the heavy text/analysis payload is fetched per-idea on demand.
 */
const ideaListSelect = {
  id: true,
  title: true,
  source: true,
  hotness: true,
  url: true,
  createdAt: true,
} as const;

export async function GET(req: Request) {
  if (IS_BUILD) {
    return NextResponse.json({ ideas: [], cached: false, building: true });
  }
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  // Check for a fresh cached feed.
  let cached;
  try {
    cached = await prisma.trendIdea.findMany({
      select: ideaListSelect,
      orderBy: { hotness: "desc" },
      take: 30,
    });
  } catch (err) {
    console.error("hunter/ideas DB read failed:", err);
    return NextResponse.json(
      { error: "Temporarily unavailable — please retry in a moment." },
      { status: 503 }
    );
  }
  const newest = cached[0]?.createdAt?.getTime() ?? 0;
  const age = Date.now() - newest;
  const ttl = cached.length === 0 ? 5 * 60 * 1000 : CACHE_TTL_MS;

  if (cached.length > 0 && age < ttl) {
    return NextResponse.json({
      ideas: cached,
      cached: true,
    });
  }

  // Fetch fresh.
  const ideas = await ideasFeed();

  // Replace the cache.
  await prisma.trendIdea.deleteMany({});
  if (ideas.length > 0) {
    await prisma.trendIdea.createMany({
      data: ideas.map((i) => ({
        title: i.title,
        source: i.source,
        hotness: i.hotness,
        url: i.url,
        text: i.text,
      })),
    });
  }

  const fresh = await prisma.trendIdea.findMany({
    select: ideaListSelect,
    orderBy: { hotness: "desc" },
    take: 30,
  });
  return NextResponse.json({ ideas: fresh, cached: false });
}
