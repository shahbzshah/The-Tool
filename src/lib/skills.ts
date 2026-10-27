import bundled from "./agent-skills-data.json";

/**
 * Curated agent-skills bundle for the Export pack.
 *
 * The skills are BUNDLED with the app — a snapshot of the public repo
 * https://github.com/addyosmani/agent-skills (MIT, (c) 2025 Addy Osmani),
 * fetched 2026-10-27 — instead of downloaded from GitHub at export time.
 * The old runtime download kept failing on Vercel: the unauthenticated
 * GitHub API allows 60 requests/hour per shared egress IP, and the /tmp
 * cache does not survive between serverless instances, so packs regularly
 * shipped without skills/. Bundled skills are in every pack with no
 * network call and no timeout risk.
 *
 * To refresh the snapshot, re-fetch the text files under skills/<name>/
 * from the repo (extensions .md/.txt/.sh/.json/.yaml/.yml only) and
 * replace agent-skills-data.json, keeping its shape.
 */

export const AGENT_SKILLS_REPO = "addyosmani/agent-skills";

const BUNDLED_FILES = (
  bundled as unknown as { files: Record<string, string> }
).files;

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

function skillBundled(name: string): boolean {
  return Object.keys(BUNDLED_FILES).some((p) =>
    p.startsWith(`skills/${name}/`)
  );
}

/** The bundle ships with the app, so every selected skill is always ready. */
export function getSkillsCacheStatus(names: string[]): {
  cached: boolean;
  cachedNames: string[];
} {
  const cachedNames = names.filter(skillBundled);
  return {
    cached: cachedNames.length === names.length,
    cachedNames,
  };
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

  const files: Record<string, string> = {};
  const included: string[] = [];
  for (const name of attempted) {
    const prefix = `skills/${name}/`;
    let found = false;
    for (const [p, content] of Object.entries(BUNDLED_FILES)) {
      if (p.startsWith(prefix)) {
        files[p] = content;
        found = true;
      }
    }
    if (found) included.push(name);
  }

  let note: string | null = null;
  if (included.length < attempted.length) {
    const missing = attempted.filter((n) => !included.includes(n));
    note = `Agent skills not included: ${missing.join(", ")}.`;
  }
  return { files, included, attempted, note };
}
