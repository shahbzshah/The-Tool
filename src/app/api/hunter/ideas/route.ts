import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ideasFeed } from "@/lib/hunter/trends";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * GET /api/hunter/ideas — trending app ideas (Hacker News).
 * Cached in the database for 6 hours; empty results cached 5 min.
 */
export async function GET() {
  // Check for a fresh cached feed.
  const cached = await prisma.trendIdea.findMany({
    orderBy: { hotness: "desc" },
    take: 30,
  });
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
    orderBy: { hotness: "desc" },
    take: 30,
  });
  return NextResponse.json({ ideas: fresh, cached: false });
}
