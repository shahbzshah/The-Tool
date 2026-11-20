import { NextResponse } from "next/server";
import { requireUser, isAdminUser } from "@/lib/auth";
import { setSetting } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/github/disconnect — forget the stored GitHub token. */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  if (!(await isAdminUser(auth.user.id, auth.user.email))) {
    return NextResponse.json(
      { error: "Admin access required." },
      { status: 403 }
    );
  }
  await setSetting("GITHUB_TOKEN", "");
  return NextResponse.json({ ok: true });
}
