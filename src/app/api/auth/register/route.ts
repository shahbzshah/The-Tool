import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  hashPassword,
  createSessionToken,
  sessionCookie,
} from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password, name } = await req.json().catch(() => ({}));
  if (
    !email ||
    typeof email !== "string" ||
    !password ||
    typeof password !== "string" ||
    password.length < 6
  ) {
    return NextResponse.json(
      { error: "Email and a password of at least 6 characters are required." },
      { status: 400 }
    );
  }

  const normalized = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email: normalized },
  });
  if (existing) {
    return NextResponse.json(
      { error: "An account with that email already exists." },
      { status: 409 }
    );
  }

  const user = await prisma.user.create({
    data: {
      email: normalized,
      passwordHash: await hashPassword(password),
      name: typeof name === "string" && name.trim() ? name.trim() : null,
    },
    select: { id: true, email: true, name: true },
  });

  const token = await createSessionToken(user);
  const res = NextResponse.json({ user });
  res.headers.set("Set-Cookie", sessionCookie(token));
  return res;
}
