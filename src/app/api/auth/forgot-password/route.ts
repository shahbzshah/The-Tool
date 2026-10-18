import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/forgot-password — request a password reset email.
 * Body: { email: string }
 * Always returns ok (even for unknown emails) to avoid account enumeration.
 */
export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({}));
  if (!email || typeof email !== "string") {
    return NextResponse.json({ ok: true });
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email.trim(), mode: "insensitive" } },
  });

  if (user) {
    // Invalidate old tokens for this user.
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    const token = await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    const base =
      process.env.NEXT_PUBLIC_APP_URL || "https://app-green-ten-35.vercel.app";
    const resetUrl = `${base}/reset-password?token=${token.token}`;

    try {
      await sendEmail(
        user.email,
        "Reset your The-Tool password",
        `<p>You requested a password reset for The-Tool.</p>
         <p><a href="${resetUrl}">Click here to reset your password</a> (expires in 1 hour).</p>
         <p>If you didn't request this, ignore this email.</p>`
      );
    } catch (err) {
      console.error("[forgot-password] email failed:", err);
      // Still return ok — don't leak whether the email was sent.
    }
  }

  return NextResponse.json({ ok: true });
}
