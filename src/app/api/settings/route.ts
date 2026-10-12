import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { settingsStatus, setSetting, SETTING_DEFS } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/settings — which keys are configured (never returns values). */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ settings: await settingsStatus() });
}

/** POST /api/settings — body: { key, value }. Empty value deletes. */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const { key, value } = await req.json().catch(() => ({}));
  if (!SETTING_DEFS.some((d) => d.key === key)) {
    return NextResponse.json({ error: "Unknown setting." }, { status: 400 });
  }
  try {
    await setSetting(String(key), String(value ?? ""));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, settings: await settingsStatus() });
}
