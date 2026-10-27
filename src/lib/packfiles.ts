/**
 * Deterministic scaffold files included in every export pack. These are
 * generated from the pack's own documents — no AI call, no network — so a
 * pack never ships without them.
 */

const ENV_TOKEN =
  /\b([A-Z][A-Z0-9_]{2,})\b/g;

/** Env-var-like tokens worth including: known suffixes + the documented set. */
const ENV_SUFFIXES = [
  "_KEY",
  "_SECRET",
  "_TOKEN",
  "_URL",
  "_DSN",
  "_HOST",
  "_PORT",
  "_BUCKET",
  "_REGION",
  "_PROJECT",
  "_ACCOUNT",
  "_PASSWORD",
  "_USER",
  "_ID",
  "_NAME",
];

const ALWAYS_KNOWN = [
  "DATABASE_URL",
  "JWT_SECRET",
  "GOOGLE_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
];

/**
 * Collect environment variable names from every document's text, plus the
 * standard ones for a database/JWT backend when the docs imply them.
 */
export function collectEnvVars(
  docs: Record<string, string>,
  opts: { mentionsDatabase?: boolean; mentionsJwt?: boolean } = {}
): string[] {
  const found = new Set<string>();
  const allText = Object.values(docs).join("\n");
  let m: RegExpExecArray | null;
  const tokenRe = new RegExp(ENV_TOKEN.source, "g");
  while ((m = tokenRe.exec(allText)) !== null) {
    const token = m[1];
    if (token.startsWith("HTTP") || token === "URL") continue;
    if (
      ENV_SUFFIXES.some((s) => token.endsWith(s)) ||
      ALWAYS_KNOWN.includes(token) ||
      token.startsWith("EXPO_PUBLIC_") ||
      token.startsWith("NEXT_PUBLIC_")
    ) {
      found.add(token);
    }
  }
  for (const known of ALWAYS_KNOWN) {
    if (allText.includes(known)) found.add(known);
  }
  const lower = allText.toLowerCase();
  if (opts.mentionsDatabase ?? /postgres|firestore|dynamodb|mongodb|sqlite|mysql|database/.test(lower)) {
    found.add("DATABASE_URL");
  }
  if (opts.mentionsJwt ?? /\bjwt\b|json web token/.test(lower)) {
    found.add("JWT_SECRET");
  }
  return [...found].sort();
}

/** Render .env.example: every variable, empty values, grouped by comment. */
export function buildEnvExample(vars: string[]): string {
  const lines = [
    "# Environment variables for this project.",
    "# Copy to .env and fill in real values. Never commit .env.",
    "# Generated from the pack's own documents — add any variable the build introduces.",
    "",
  ];
  if (vars.length === 0) {
    lines.push("# No environment variables were named in the documents.");
    lines.push("# Add DATABASE_URL / JWT_SECRET / provider keys here as the build needs them.");
  } else {
    for (const v of vars) lines.push(`${v}=`);
  }
  lines.push("");
  return lines.join("\n");
}

const GITIGNORE_BASE = `node_modules/
.env
.env.*
!.env.example
dist/
build/
coverage/
*.log
.DS_Store
`;

const GITIGNORE_MOBILE = `
# React Native / Expo
.expo/
android/app/build/
android/.gradle/
ios/build/
ios/Pods/
ios/*.xcworkspace
*.jks
*.keystore
`;

const GITIGNORE_WEB = `
# Next.js / web
.next/
out/
`;

/** Render .gitignore for the project's stack. Stack text decides the extras. */
export function buildGitignore(stackText: string): string {
  const lower = (stackText ?? "").toLowerCase();
  let out = GITIGNORE_BASE;
  if (/react native|expo|flutter/.test(lower)) out += GITIGNORE_MOBILE;
  if (/next\.js|nextjs|vite|react/.test(lower)) out += GITIGNORE_WEB;
  return out;
}
