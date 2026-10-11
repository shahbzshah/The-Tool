import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  verifyPassword,
  createSessionToken,
  sessionCookie,
} from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || typeof email !== "string" || !password || typeof password !== "string") {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json(
      { error: "Wrong email or password." },
      { status: 401 }
    );
  }

  const token = await createSessionToken({
    id: user.id,
    email: user.email,
    name: user.name,
  });
  const res = NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
  });
  res.headers.set("Set-Cookie", sessionCookie(token));
  return res;
}
