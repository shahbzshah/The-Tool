/**
 * GitHub push for the export pack: creates a repo (or updates the existing
 * one) and pushes the pack's files as a single commit via the Git Data API
 * — one tree, one commit, not one API call per file.
 *
 * Auth is a user OAuth token (from the Export-page connect flow) or a
 * pasted personal access token with `repo` scope, both stored encrypted
 * in Settings as GITHUB_TOKEN. The token never leaves the server.
 */

const API = "https://api.github.com";

export class GitHubError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function gh(
  token: string,
  path: string,
  init?: RequestInit
): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data as { message?: string }).message ||
      `GitHub API error ${res.status}.`;
    throw new GitHubError(message, res.status);
  }
  return data;
}

/** The OAuth callback URL — the same one registered in the GitHub OAuth App. */
export function githubCallbackUrl(req: Request): string {
  const env = process.env.GITHUB_OAUTH_CALLBACK_URL;
  if (env) return env;
  return `${new URL(req.url).origin}/api/github/callback`;
}

/** Who the token belongs to — used to confirm the connection + as the repo owner. */
export async function getGitHubLogin(token: string): Promise<string> {
  const me = (await gh(token, "/user")) as { login?: string };
  if (!me.login) throw new GitHubError("Could not read the GitHub user.", 401);
  return me.login;
}

/** Repo names: letters, digits, . _ - ; must not start with . or -. */
export function isValidRepoName(name: string): boolean {
  return (
    name.length >= 1 &&
    name.length <= 100 &&
    /^[A-Za-z0-9._-]+$/.test(name) &&
    !name.startsWith(".") &&
    !name.startsWith("-")
  );
}

export type PushResult = {
  repoUrl: string;
  commitSha: string;
  branch: string;
  filesPushed: number;
  created: boolean;
};

/**
 * Push a file map to a repo. Creates the repo when it doesn't exist;
 * otherwise commits on top of its default branch. Returns the repo URL
 * and the new commit SHA.
 */
export async function pushPackToGitHub(opts: {
  token: string;
  repo: string;
  isPrivate: boolean;
  description?: string;
  files: Record<string, string>;
}): Promise<PushResult> {
  const { token, repo, isPrivate, description, files } = opts;
  const owner = await getGitHubLogin(token);
  const paths = Object.keys(files);
  if (paths.length === 0) throw new GitHubError("Nothing to push.", 400);

  // Does the repo already exist?
  let created = false;
  let defaultBranch = "main";
  let headSha: string | null = null;
  let baseTreeSha: string | null = null;
  try {
    const existing = (await gh(token, `/repos/${owner}/${repo}`)) as {
      default_branch?: string;
    };
    defaultBranch = existing.default_branch ?? "main";
  } catch (err) {
    if (!(err instanceof GitHubError) || err.status !== 404) throw err;
    const createdRepo = (await gh(token, "/user/repos", {
      method: "POST",
      body: JSON.stringify({
        name: repo,
        private: isPrivate,
        description: description ?? "",
        auto_init: false,
      }),
    })) as { default_branch?: string };
    defaultBranch = createdRepo.default_branch ?? "main";
    created = true;
  }

  // Current HEAD of the default branch, if the repo has any commit yet.
  if (!created) {
    try {
      const ref = (await gh(
        token,
        `/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`
      )) as { object?: { sha?: string } };
      headSha = ref.object?.sha ?? null;
      if (headSha) {
        const commit = (await gh(
          token,
          `/repos/${owner}/${repo}/git/commits/${headSha}`
        )) as { tree?: { sha?: string } };
        baseTreeSha = commit.tree?.sha ?? null;
      }
    } catch (err) {
      if (!(err instanceof GitHubError) || err.status !== 404) throw err;
      // Empty repo (no commits yet) — the tree below is built from scratch.
      headSha = null;
      baseTreeSha = null;
    }
  }

  // Blobs first, in parallel batches of 10 (a pack is ~110 files).
  const entries: { path: string; mode: "100644"; type: "blob"; sha: string }[] =
    [];
  for (let i = 0; i < paths.length; i += 10) {
    const batch = paths.slice(i, i + 10);
    const blobs = await Promise.all(
      batch.map(async (path) => {
        const blob = (await gh(token, `/repos/${owner}/${repo}/git/blobs`, {
          method: "POST",
          body: JSON.stringify({ content: files[path], encoding: "utf-8" }),
        })) as { sha?: string };
        if (!blob.sha) throw new GitHubError("GitHub did not return a blob SHA.", 502);
        return { path, mode: "100644" as const, type: "blob" as const, sha: blob.sha };
      })
    );
    entries.push(...blobs);
  }

  const tree = (await gh(token, `/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      ...(baseTreeSha ? { base_tree: baseTreeSha } : {}),
      tree: entries,
    }),
  })) as { sha?: string };
  if (!tree.sha) throw new GitHubError("GitHub did not return a tree SHA.", 502);

  const commit = (await gh(token, `/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: created
        ? "Initial commit: export pack from Ideas App"
        : "Update export pack from Ideas App",
      tree: tree.sha,
      ...(headSha ? { parents: [headSha] } : {}),
    }),
  })) as { sha?: string };
  if (!commit.sha) throw new GitHubError("GitHub did not return a commit SHA.", 502);

  if (headSha) {
    await gh(token, `/repos/${owner}/${repo}/git/refs/heads/${defaultBranch}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
  } else {
    await gh(token, `/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${defaultBranch}`,
        sha: commit.sha,
      }),
    });
  }

  return {
    repoUrl: `https://github.com/${owner}/${repo}`,
    commitSha: commit.sha,
    branch: defaultBranch,
    filesPushed: paths.length,
    created,
  };
}
