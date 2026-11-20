import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireUser } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { githubCallbackUrl } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cookie(name: string, value: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

/**
 * GET /api/github/auth?returnTo=/export/<ideaId> — start the GitHub OAuth
 * connect flow. Redirects to github.com; GitHub sends the user back to
 * /api/github/callback. The return URL is kept in a cookie (validated to
 * a same-site path on the way back) so the callback knows where to send
 * the user afterwards.
 */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  // Any signed-in user may connect: the token is shared (one token in
  // Settings), so connecting as the same GitHub account is equivalent.

  const clientId = await getSetting("GITHUB_OAUTH_CLIENT_ID");
  if (!clientId) {
    return NextResponse.json(
      {
        error:
          "GitHub OAuth App is not set up yet — add the Client ID and Secret in Settings first.",
      },
      { status: 400 }
    );
  }

  const url = new URL(req.url);
  const returnTo = url.searchParams.get("returnTo") ?? "/";
  const safeReturnTo =
    returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  const state = randomBytes(16).toString("hex");

  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", githubCallbackUrl(req));
  authorize.searchParams.set("scope", "repo");
  authorize.searchParams.set("state", state);

  const res = NextResponse.redirect(authorize);
  res.headers.append("Set-Cookie", cookie("github_oauth_state", state, 600));
  res.headers.append("Set-Cookie", cookie("github_oauth_return", safeReturnTo, 600));
  return res;
}
