import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  hashPassword,
  createSessionToken,
  sessionCookie,
  validatePassword,
} from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password, name } = await req.json().catch(() => ({}));
  if (!email || typeof email !== "string" || !password || typeof password !== "string") {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }
  const pwError = validatePassword(password);
  if (pwError) {
    return NextResponse.json({ error: pwError }, { status: 400 });
  }

  const normalized = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email: normalized },
  });
  if (existing) {
    return NextResponse.json({
      ok: true,
      message: "If this email is already registered, you can sign in with it instead.",
    });
  }

  // First account ever becomes the admin (bootstrap).
  const adminCount = await prisma.user.count({ where: { isAdmin: true } });

  const user = await prisma.user.create({
    data: {
      email: normalized,
      passwordHash: await hashPassword(password),
      name: typeof name === "string" && name.trim() ? name.trim() : null,
      isAdmin: adminCount === 0,
    },
    select: { id: true, email: true, name: true },
  });

  const token = await createSessionToken(user);
  const res = NextResponse.json({ user });
  res.headers.set("Set-Cookie", sessionCookie(token));
  return res;
}
