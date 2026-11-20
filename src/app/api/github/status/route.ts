import { NextResponse } from "next/server";
import { requireUser, isAdminUser } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { getGitHubLogin } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/github/status — is GitHub connected, as who, and is the OAuth App configured? Never returns the token. */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  if (!(await isAdminUser(auth.user.id, auth.user.email))) {
    return NextResponse.json(
      { error: "Admin access required." },
      { status: 403 }
    );
  }

  const [clientId, clientSecret, token] = await Promise.all([
    getSetting("GITHUB_OAUTH_CLIENT_ID"),
    getSetting("GITHUB_OAUTH_SECRET"),
    getSetting("GITHUB_TOKEN"),
  ]);
  const oauthConfigured = !!(clientId && clientSecret);
  if (!token) {
    return NextResponse.json({
      connected: false,
      login: null,
      oauthConfigured,
    });
  }
  try {
    const login = await getGitHubLogin(token);
    return NextResponse.json({ connected: true, login, oauthConfigured });
  } catch {
    // Token stored but GitHub rejects it (revoked / expired) — treat as
    // disconnected; reconnecting overwrites it.
    return NextResponse.json({
      connected: false,
      login: null,
      oauthConfigured,
      tokenInvalid: true,
    });
  }
}
