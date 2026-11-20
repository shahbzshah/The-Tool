import { NextResponse } from "next/server";
import { requireUser, isAdminUser } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { getGitHubLogin } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/github/status — is GitHub connected, as who, and is the OAuth App configured? Never returns the token. Any signed-in user may read it: the GitHub connection is shared (one token in Settings, set up once by the admin), and the Export page shows the upload section for every account. */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const isAdmin = await isAdminUser(auth.user.id, auth.user.email);

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
      isAdmin,
    });
  }
  try {
    const login = await getGitHubLogin(token);
    return NextResponse.json({
      connected: true,
      login,
      oauthConfigured,
      isAdmin,
    });
  } catch {
    // Token stored but GitHub rejects it (revoked / expired) — treat as
    // disconnected; reconnecting overwrites it.
    return NextResponse.json({
      connected: false,
      login: null,
      oauthConfigured,
      tokenInvalid: true,
      isAdmin,
    });
  }
}
