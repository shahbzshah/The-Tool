import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getSetting } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/hunter/watchlist/status — last automatic scan result.
 * Thin wrapper so the dashboard doesn't need to parse the collection route.
 * Auth-required; returns { ok: true, lastRun } with lastRun null if never run.
 */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  let lastRun: { ok: boolean; at: string; error?: string } | null = null;
  try {
    const raw = await getSetting("WATCHLIST_LAST_RUN");
    if (raw) lastRun = JSON.parse(raw);
  } catch {
    lastRun = null;
  }
  return NextResponse.json({ ok: true, lastRun });
}
