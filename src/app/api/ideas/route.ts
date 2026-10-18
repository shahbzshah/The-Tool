import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

export async function GET(req: Request) {
  if (IS_BUILD) {
    return NextResponse.json({ ideas: [], building: true });
  }
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").trim();
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(params.get("limit") ?? "30", 10) || 30)
  );
  const offset = (page - 1) * limit;

  // C5: user-scoped — only ideas from this user's projects.
  const where = q
    ? {
        project: { userId: auth.user.id },
        OR: [
          { title: { contains: q, mode: "insensitive" as const } },
          { pitch: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : { project: { userId: auth.user.id } };
  const fetched = await prisma.idea.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { project: { select: { category: true } } },
    skip: offset,
    take: limit + 1,
  });
  const hasMore = fetched.length > limit;
  const ideas = hasMore ? fetched.slice(0, limit) : fetched;
  return NextResponse.json({ ideas, hasMore });
}
