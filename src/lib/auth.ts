import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./db";

const COOKIE_NAME = "tt_session";

function getSecret(): Uint8Array {
  // Falls back to a dev-only secret; set AUTH_SECRET in production.
  const s =
    process.env.AUTH_SECRET ||
    process.env.NVIDIA_API_KEY ||
    "dev-only-secret-change-me";
  return new TextEncoder().encode(s);
}

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ id: user.id, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
}

export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const cookie = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(COOKIE_NAME + "="));
  if (!cookie) return null;
  const token = decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1));
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.id !== "string" || typeof payload.email !== "string") {
      return null;
    }
    // Confirm the user still exists.
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, email: true, name: true },
    });
    return user;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${encodeURIComponent(
    token
  )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}; Secure`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
}

/** Helper for protected routes: returns the user or an401 response. */
export async function requireUser(
  req: Request
): Promise<{ user: SessionUser } | { response: NextResponse }> {
  const user = await getSessionUser(req);
  if (!user) {
    return {
      response: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
    };
  }
  return { user };
}
