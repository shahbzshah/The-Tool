import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { settingsStatus, setSetting, SETTING_DEFS } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-only guard: 401 when signed out, 403 when not an admin. */
async function requireAdmin(
  req: Request
): Promise<NextResponse | null> {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const admin = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { isAdmin: true },
  });
  if (!admin?.isAdmin) {
    return NextResponse.json(
      { error: "Admin access required." },
      { status: 403 }
    );
  }
  return null;
}

/** GET /api/settings — which keys are configured (never returns values). */
export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return NextResponse.json({ settings: await settingsStatus() });
}

/** POST /api/settings — body: { key, value }. Empty value deletes. */
export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

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
