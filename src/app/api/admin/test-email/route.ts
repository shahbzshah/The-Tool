import { NextResponse } from "next/server";
import { requireUser, isAdminUser } from "@/lib/auth";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/test-email — send a test email to verify Resend setup.
 * Body: { to: string }
 * Admin only. Returns the Resend error if sending fails.
 */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  if (!(await isAdminUser(auth.user.id, auth.user.email))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { to } = await req.json().catch(() => ({}));
  if (!to || typeof to !== "string") {
    return NextResponse.json({ error: "Recipient email is required." }, { status: 400 });
  }

  try {
    await sendEmail(
      to.trim(),
      "The-Tool email test",
      "<p>If you're reading this, Resend is working.</p>"
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
