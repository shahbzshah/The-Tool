import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge middleware: (a) page auth — redirect unauthenticated visitors of the
 * pipeline + hunter pages to /login, and (b) per-IP rate limiting on auth
 * and expensive AI/scan API routes.
 *
 * Auth check is cookie presence only (cookie name from src/lib/auth.ts —
 * `tt_session`). Full JWT verification happens inside the API routes;
 * middleware is the coarse gate so deep links and history entries don't
 * leak a signed-out shell to strangers.
 *
 * NOTE: the rate limiter is an in-memory Map per serverless instance — it
 * is NOT shared across instances, so a determined attacker rotating IPs or
 * hitting multiple instances can exceed these limits. Acceptable for now;
 * move to a shared store (e.g. Upstash/Redis) if abuse is observed.
 */

export const config = {
  matcher: [
    "/",
    "/refine/:path*",
    "/stitch/:path*",
    "/docs/:path*",
    "/export/:path*",
    "/history/:path*",
    "/settings/:path*",
    "/hunter/:path*",
    "/api/:path*",
  ],
};

const COOKIE_NAME = "tt_session";

const WINDOW_MS = 60_000; // 1 minute
const AUTH_LIMIT = 5; // /api/auth/* — brute-force protection
const AI_LIMIT = 30; // AI + scan routes — cost protection

// Prefixes for expensive AI/scan endpoints.
const AI_RATE_LIMITED = [
  "/api/docs/generate",
  "/api/ideas",
  "/api/refine",
  "/api/hunter/scans",
  "/api/hunter/ideas/analyze",
  "/api/stitch-review",
];

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function hitRateLimit(key: string, max: number): boolean {
  const now = Date.now();
  // Lazy pruning so the map can't grow without bound on long-lived servers.
  if (buckets.size > 10000) {
    for (const [k, b] of buckets) {
      if (now >= b.resetAt) buckets.delete(k);
    }
  }
  const existing = buckets.get(key);
  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  existing.count += 1;
  return existing.count > max;
}

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

function rateLimitResponse(): NextResponse {
  return NextResponse.json(
    { error: "Too many requests — please wait a minute and try again." },
    { status: 429, headers: { "Retry-After": "60" } }
  );
}

function isRateLimitedRoute(pathname: string): { key: string; max: number } | null {
  // Strict bucket only for credential-bearing routes. /api/auth/me is called
  // on every page load — rate-limiting it logs real users out (audit #5).
  if (
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/register" ||
    pathname === "/api/auth/forgot-password" ||
    pathname === "/api/auth/reset-password"
  ) {
    return { key: "auth", max: AUTH_LIMIT };
  }
  const ai = AI_RATE_LIMITED.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (ai) return { key: "ai", max: AI_LIMIT };
  return null;
}

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // (b) Rate limiting applies to matched API routes.
  if (pathname.startsWith("/api/")) {
    const rule = isRateLimitedRoute(pathname);
    if (rule) {
      const key = `${rule.key}:${clientIp(req)}`;
      if (hitRateLimit(key, rule.max)) return rateLimitResponse();
    }
    return NextResponse.next();
  }

  // (a) Page auth: the matcher already limits middleware to the pipeline +
  // hunter pages. /login, /register, /_next/*, /fonts/* and /favicon.ico are
  // excluded by the matcher above, so anything reaching here needs a session.
  if (!req.cookies.get(COOKIE_NAME)?.value) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}
