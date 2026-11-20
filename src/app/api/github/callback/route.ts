import { NextResponse } from "next/server";
import { requireUser, isAdminUser } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";
import { githubCallbackUrl } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function clearCookie(name: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}

/**
 * GET /api/github/callback?code=...&state=... — GitHub sends the user back
 * here after authorizing. Verifies the state cookie, exchanges the code
 * for an access token, stores it encrypted in Settings, and redirects
 * back to the page the flow started from.
 */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  if (!(await isAdminUser(auth.user.id, auth.user.email))) {
    return NextResponse.json(
      { error: "Admin access required." },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieHeader = req.headers.get("cookie");
  const savedState = readCookie(cookieHeader, "github_oauth_state");
  const returnTo = readCookie(cookieHeader, "github_oauth_return") ?? "/";
  const safeReturnTo =
    returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";

  const fail = (message: string) => {
    const res = NextResponse.redirect(
      new URL(
        `${safeReturnTo}${safeReturnTo.includes("?") ? "&" : "?"}github=error&msg=${encodeURIComponent(message)}`,
        url.origin
      )
    );
    res.headers.append("Set-Cookie", clearCookie("github_oauth_state"));
    res.headers.append("Set-Cookie", clearCookie("github_oauth_return"));
    return res;
  };

  if (!code || !state || !savedState || state !== savedState) {
    return fail("GitHub sign-in did not complete — try connecting again.");
  }

  const [clientId, clientSecret] = await Promise.all([
    getSetting("GITHUB_OAUTH_CLIENT_ID"),
    getSetting("GITHUB_OAUTH_SECRET"),
  ]);
  if (!clientId || !clientSecret) {
    return fail("GitHub OAuth App is not set up — add the Client ID and Secret in Settings first.");
  }

  try {
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: githubCallbackUrl(req),
      }),
    });
    const data = await res.json().catch(() => ({}));
    const token = (data as { access_token?: string }).access_token;
    if (!token) {
      const message =
        (data as { error_description?: string }).error_description ||
        "GitHub did not return an access token.";
      return fail(message);
    }
    await setSetting("GITHUB_TOKEN", token);
  } catch (err) {
    return fail(
      err instanceof Error ? err.message : "Could not finish the GitHub connection."
    );
  }

  const res = NextResponse.redirect(
    new URL(
      `${safeReturnTo}${safeReturnTo.includes("?") ? "&" : "?"}github=connected`,
      url.origin
    )
  );
  res.headers.append("Set-Cookie", clearCookie("github_oauth_state"));
  res.headers.append("Set-Cookie", clearCookie("github_oauth_return"));
  return res;
}
