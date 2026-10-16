import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Curated agent-skills bundle for the Export pack.
 *
 * Skills are pulled from the public community repo
 * https://github.com/addyosmani/agent-skills and cached on disk so the
 * pack builds even when GitHub is slow or unreachable. The cache refreshes
 * when it is older than 7 days. Every failure is soft: the caller gets a
 * note for the pack README instead of an exception.
 */

export const AGENT_SKILLS_REPO = "addyosmani/agent-skills";
export const AGENT_SKILLS_REF = "HEAD";

const CACHE_DIR = path.join(os.tmpdir(), "agent-skills-cache");
const TIMESTAMP_FILE = path.join(CACHE_DIR, ".fetched-at");
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Only small text companions ship in the pack — no binaries.
const TEXT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".sh",
  ".json",
  ".yaml",
  ".yml",
]);

// The upstream repo is platform-agnostic, so each set picks the skills that
// matter most for that build target. Capped at 8 per pack.
export const SKILL_SETS: Record<"mobile" | "web" | "default", string[]> = {
  mobile: [
    "frontend-ui-engineering",
    "api-and-interface-design",
    "security-and-hardening",
    "test-driven-development",
    "planning-and-task-breakdown",
    "ci-cd-and-automation",
    "debugging-and-error-recovery",
    "performance-optimization",
  ],
  web: [
    "frontend-ui-engineering",
    "browser-testing-with-devtools",
    "api-and-interface-design",
    "security-and-hardening",
    "test-driven-development",
    "planning-and-task-breakdown",
    "debugging-and-error-recovery",
    "performance-optimization",
  ],
  default: [
    "planning-and-task-breakdown",
    "spec-driven-development",
    "frontend-ui-engineering",
    "security-and-hardening",
    "test-driven-development",
    "debugging-and-error-recovery",
    "documentation-and-adrs",
    "git-workflow-and-versioning",
  ],
};

export function skillsForPlatform(
  platform: string | null | undefined
): string[] {
  if (platform === "mobile") return [...SKILL_SETS.mobile];
  if (platform === "web") return [...SKILL_SETS.web];
  return [...SKILL_SETS.default];
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "ideas-app-export/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}

function cacheFresh(): boolean {
  try {
    const at = Number(fs.readFileSync(TIMESTAMP_FILE, "utf8").trim());
    return Number.isFinite(at) && Date.now() - at < SEVEN_DAYS_MS;
  } catch {
    return false;
  }
}

function skillCached(name: string): boolean {
  try {
    return fs
      .statSync(path.join(CACHE_DIR, "skills", name, "SKILL.md"))
      .isFile();
  } catch {
    return false;
  }
}

/** Fast, network-free view of what the cache already holds. */
export function getSkillsCacheStatus(names: string[]): {
  cached: boolean;
  cachedNames: string[];
} {
  const cachedNames = names.filter(skillCached);
  return {
    cached: cacheFresh() && cachedNames.length === names.length,
    cachedNames,
  };
}

type TreeEntry = { path?: string; type?: string };

/**
 * Make sure the selected skills are on disk. Fetches only what is missing
 * or stale: one GitHub tree listing, then the individual skill files from
 * raw.githubusercontent.com. Never throws.
 */
export async function ensureSkillsCache(
  names: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const missing = cacheFresh()
      ? names.filter((n) => !skillCached(n))
      : [...names];
    if (missing.length === 0) return { ok: true };

    fs.mkdirSync(path.join(CACHE_DIR, "skills"), { recursive: true });

    const wanted = new Set(missing);
    const treeUrl = `https://api.github.com/repos/${AGENT_SKILLS_REPO}/git/trees/${AGENT_SKILLS_REF}?recursive=1`;
    const tree = (await fetchText(treeUrl).then((t) =>
      JSON.parse(t)
    )) as { tree?: TreeEntry[] };
    if (!tree.tree) throw new Error("GitHub API did not return a repo tree.");

    const files = tree.tree
      .filter((e) => e.type === "blob" && typeof e.path === "string")
      .map((e) => e.path as string)
      .filter((p) => {
        const parts = p.split("/");
        return (
          parts.length > 2 &&
          parts[0] === "skills" &&
          wanted.has(parts[1]) &&
          TEXT_EXTENSIONS.has(path.extname(p).toLowerCase())
        );
      });
    if (files.length === 0)
      throw new Error("No skill files found in the repo tree.");

    const results = await Promise.allSettled(
      files.map(async (p) => {
        const text = await fetchText(
          `https://raw.githubusercontent.com/${AGENT_SKILLS_REPO}/${AGENT_SKILLS_REF}/${p}`
        );
        const dest = path.join(CACHE_DIR, p);
        // Path-traversal guard: tree paths like skills/x/../../evil.md would
        // pass the filter above but resolve outside the cache directory.
        if (dest !== CACHE_DIR && !dest.startsWith(CACHE_DIR + path.sep)) return;
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, text);
      })
    );
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0)
      throw new Error(`${failed.length} skill file(s) failed to download.`);

    fs.writeFileSync(TIMESTAMP_FILE, String(Date.now()));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function readSkillFiles(name: string): Record<string, string> {
  const dir = path.join(CACHE_DIR, "skills", name);
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
        continue;
      const rel = path.relative(dir, full).split(path.sep).join("/");
      out[`skills/${name}/${rel}`] = fs.readFileSync(full, "utf8");
    }
  };
  if (!fs.existsSync(dir)) return out;
  walk(dir);
  return out;
}

/** Never-throwing wrapper around ensureSkillsCache. */
async function safeEnsure(
  names: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    return await ensureSkillsCache(names);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export type SkillsBundle = {
  /** Zip paths (skills/<name>/...) -> content */
  files: Record<string, string>;
  /** Skill names that actually made it into the bundle */
  included: string[];
  /** Skill names selected for the platform */
  attempted: string[];
  /** Null when everything is included; a human-readable skip reason otherwise */
  note: string | null;
};

/** Build the skills bundle for a project's platform. Never throws. */
export async function buildSkillsBundle(
  platform: string | null | undefined
): Promise<SkillsBundle> {
  const attempted = skillsForPlatform(platform);
  const ensured = await safeEnsure(attempted);

  const files: Record<string, string> = {};
  const included: string[] = [];
  for (const name of attempted) {
    const skillFiles = readSkillFiles(name);
    if (Object.keys(skillFiles).length > 0) {
      Object.assign(files, skillFiles);
      included.push(name);
    }
  }

  let note: string | null = null;
  if (ensured.ok === false) {
    note =
      included.length > 0
        ? `Agent skills: refresh failed (${ensured.error}); the pack includes ${included.length} cached skill(s).`
        : `Agent skills were skipped: ${ensured.error}`;
  } else if (included.length < attempted.length) {
    const missing = attempted.filter((n) => !included.includes(n));
    note = `Agent skills not included: ${missing.join(", ")}.`;
  }
  return { files, included, attempted, note };
}
