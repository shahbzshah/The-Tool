import { NextResponse } from "next/server";
import { requireUser, isAdminUser } from "@/lib/auth";
import { setSetting } from "@/lib/settings";
import { loadWatchlistKeywords } from "@/lib/hunter/watchlist-keywords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_KEYWORDS = 30;
const MAX_KEYWORD_LEN = 80;

/** GET /api/hunter/watchlist/keywords — the effective watchlist keywords. */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ ok: true, keywords: await loadWatchlistKeywords() });
}

/**
 * PUT /api/hunter/watchlist/keywords — replace the watchlist keywords.
 * Body: { keywords: string[] }. Admin only. An empty array clears the custom
 * list (the defaults take over again).
 */
export async function PUT(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  if (!(await isAdminUser(auth.user.id, auth.user.email))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { keywords } = await req.json().catch(() => ({}));
  if (!Array.isArray(keywords)) {
    return NextResponse.json({ error: "keywords must be an array." }, { status: 400 });
  }
  if (keywords.length > MAX_KEYWORDS) {
    return NextResponse.json(
      { error: `At most ${MAX_KEYWORDS} keywords.` },
      { status: 400 }
    );
  }
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const k of keywords) {
    if (typeof k !== "string") {
      return NextResponse.json(
        { error: "keywords must be non-empty strings." },
        { status: 400 }
      );
    }
    const t = k.trim().slice(0, MAX_KEYWORD_LEN);
    if (!t) continue;
    const dedupeKey = t.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    cleaned.push(t);
  }

  await setSetting(
    "WATCHLIST_KEYWORDS",
    cleaned.length > 0 ? JSON.stringify(cleaned) : ""
  );
  return NextResponse.json({ ok: true, keywords: await loadWatchlistKeywords() });
}
