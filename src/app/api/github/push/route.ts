import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { buildExportPack } from "@/lib/export-pack";
import {
  pushPackToGitHub,
  isValidRepoName,
  GitHubError,
} from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/github/push — push the finished export pack to GitHub as a
 * repo. Body: { ideaId, tool, repo, isPrivate }. Creates the repo when it
 * doesn't exist; otherwise commits on top of its default branch. The
 * pack is built by the same builder the zip download uses, so the repo
 * always matches the downloadable pack.
 */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  // Any signed-in user may push their own idea's pack (buildExportPack is
  // owner-scoped to auth.user.id); the GitHub connection itself is shared.

  try {
    const body = await req.json().catch(() => ({}));
    const ideaId = String(body?.ideaId ?? "");
    const toolId = String(body?.tool ?? "");
    const repo = String(body?.repo ?? "").trim();
    const isPrivate = body?.isPrivate !== false;

    if (!ideaId || !toolId) {
      return NextResponse.json(
        { error: "ideaId and tool are required." },
        { status: 400 }
      );
    }
    if (!isValidRepoName(repo)) {
      return NextResponse.json(
        {
          error:
            "Repo name must be 1–100 characters of letters, digits, . _ -, and must not start with . or -.",
        },
        { status: 400 }
      );
    }

    const token = await getSetting("GITHUB_TOKEN");
    if (!token) {
      return NextResponse.json(
        { error: "GitHub is not connected — connect it from the Export page first." },
        { status: 401 }
      );
    }

    const pack = await buildExportPack({
      ideaId,
      userId: auth.user.id,
      toolId,
    });

    const result = await pushPackToGitHub({
      token,
      repo,
      isPrivate,
      description: `Export pack for "${pack.ideaTitle}"`,
      files: pack.files,
    });
    return NextResponse.json({ ...result, ideaTitle: pack.ideaTitle });
  } catch (err) {
    console.error("GitHub push failed:", err);
    if (err instanceof GitHubError) {
      // 401 from GitHub means the stored token is dead — say so plainly
      // instead of a generic failure.
      const status = err.status === 401 ? 401 : 502;
      const message =
        err.status === 401
          ? "GitHub rejected the stored token — reconnect GitHub and try again."
          : err.message;
      return NextResponse.json({ error: message }, { status });
    }
    const message =
      err instanceof Error ? err.message : "GitHub push failed.";
    const status =
      /idea not found|approve this idea|no documents|unknown export tool/i.test(
        message
      )
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
