import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, isAdminUser, hashPassword } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/reset-password — admin resets any user's password.
 * Body: { email: string, newPassword: string }
 * Admin only. Password must be at least 8 characters.
 */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  if (!(await isAdminUser(auth.user.id, auth.user.email))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { email, newPassword } = await req.json().catch(() => ({}));
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email.trim(), mode: "insensitive" } },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });

  return NextResponse.json({ ok: true, email: user.email });
}

/**
 * GET /api/admin/reset-password — list users (for the admin reset UI).
 * Admin only. Returns id, email, isAdmin, createdAt.
 */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  if (!(await isAdminUser(auth.user.id, auth.user.email))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: { id: true, email: true, isAdmin: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ users });
}
