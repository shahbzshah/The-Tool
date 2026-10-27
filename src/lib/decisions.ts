/**
 * Locked technical decisions — the single source of truth that stops docs
 * from contradicting each other.
 *
 * Every doc generation prompt gets the locked decisions injected as a
 * MANDATORY block (see techDecisionsBlock), so a decision recorded once is
 * propagated to every document. Docs generated before a decision was
 * locked are flagged by the consistency check, not silently left wrong.
 *
 * This module is pure (no database access) so the Docs page can reuse the
 * same detection logic client-side if needed. Detection is advisory: it
 * surfaces what the existing docs say so a human can pick the winner when
 * they disagree.
 */

export type TechDecisionKey =
  | "database"
  | "frontend"
  | "backend"
  | "auth"
  | "speech"
  | "sync"
  | "hosting";

export type TechDecisions = Partial<Record<TechDecisionKey, string>>;

export const TECH_DECISION_DEFS: {
  key: TechDecisionKey;
  label: string;
  hint: string;
  suggestions: string[];
}[] = [
  {
    key: "database",
    label: "Database",
    hint: "The one database every doc must use.",
    suggestions: ["PostgreSQL", "Firestore", "SQLite", "MongoDB", "Supabase (PostgreSQL)"],
  },
  {
    key: "frontend",
    label: "Frontend",
    hint: "The one client framework every doc must use.",
    suggestions: ["React Native + Expo", "Flutter", "Next.js", "React + Vite"],
  },
  {
    key: "backend",
    label: "Backend",
    hint: "The one API/backend stack every doc must use.",
    suggestions: ["Node.js + Express", "FastAPI", "Next.js route handlers", "Supabase"],
  },
  {
    key: "auth",
    label: "App auth",
    hint: "How users sign up and log in to the app itself (not calendar OAuth).",
    suggestions: ["Email + password (JWT)", "Google OAuth", "Email + password + Google OAuth"],
  },
  {
    key: "speech",
    label: "Speech mode",
    hint: "Cloud vs on-device speech. Cloud cannot work offline.",
    suggestions: [
      "Cloud STT/TTS (Google Cloud)",
      "On-device STT/TTS",
      "Cloud STT/TTS with typed fallback offline",
    ],
  },
  {
    key: "sync",
    label: "Sync model",
    hint: "How offline work reaches the server, and who wins a conflict.",
    suggestions: [
      "Offline-first with outbox + last-write-wins",
      "Offline-first with outbox + field-level merge",
      "Online-only, no offline queue",
    ],
  },
  {
    key: "hosting",
    label: "Hosting / deploy",
    hint: "Where the backend and the app ship.",
    suggestions: ["Vercel", "Render", "Railway", "EAS + Vercel", "AWS"],
  },
];

const KNOWN_KEYS = new Set<string>(TECH_DECISION_DEFS.map((d) => d.key));

/** Parse the stored JSON string into validated decisions. Never throws. */
export function parseTechDecisions(raw: string | null | undefined): TechDecisions {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: TechDecisions = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (KNOWN_KEYS.has(k) && typeof v === "string" && v.trim()) {
        out[k as TechDecisionKey] = v.trim().slice(0, 200);
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * The mandatory block injected into every doc prompt. Empty when nothing is
 * locked yet — the AI then decides, and detection surfaces the result.
 */
export function techDecisionsBlock(decisions: TechDecisions): string {
  const entries = TECH_DECISION_DEFS.filter((d) => decisions[d.key]?.trim());
  if (entries.length === 0) return "";
  const lines = entries.map(
    (d) => `- ${d.label}: ${decisions[d.key]!.trim()}`
  );
  return `
# LOCKED TECHNICAL DECISIONS (MANDATORY)
These decisions are final and already recorded for this project. Every technology, service, and integration in this document MUST match them exactly — do not introduce, recommend, or compare alternatives, and do not contradict them. Where the document would normally list options, list only the locked choice.

${lines.join("\n")}
`;
}

// --- Detection: what do the existing docs say? ---------------------------

type DetectionPattern = { re: RegExp; canonical: string };

const DETECTION_PATTERNS: Record<TechDecisionKey, DetectionPattern[]> = {
  database: [
    { re: /postgres(ql)?\b/i, canonical: "PostgreSQL" },
    { re: /firestore\b/i, canonical: "Firestore" },
    { re: /dynamodb|dynamo\s?db\b/i, canonical: "DynamoDB" },
    { re: /mongodb|mongo\b/i, canonical: "MongoDB" },
    { re: /sqlite\b/i, canonical: "SQLite" },
    { re: /mysql\b/i, canonical: "MySQL" },
    { re: /supabase\b/i, canonical: "Supabase (PostgreSQL)" },
  ],
  frontend: [
    { re: /react\s*native|expo\b/i, canonical: "React Native + Expo" },
    { re: /flutter\b/i, canonical: "Flutter" },
    { re: /next\.js\b/i, canonical: "Next.js" },
    { re: /\breact\b/i, canonical: "React" },
    { re: /swiftui|\bswift\b/i, canonical: "Swift" },
    { re: /kotlin|jetpack\s*compose/i, canonical: "Kotlin" },
  ],
  backend: [
    { re: /node\.?js|express\b/i, canonical: "Node.js + Express" },
    { re: /fastapi\b/i, canonical: "FastAPI" },
    { re: /django\b/i, canonical: "Django" },
    { re: /laravel\b/i, canonical: "Laravel" },
    { re: /next\.js.*route handler|route handler/i, canonical: "Next.js route handlers" },
    { re: /supabase\b/i, canonical: "Supabase" },
    { re: /firebase\b/i, canonical: "Firebase" },
  ],
  auth: [
    { re: /email\s*\+\s*password|email\/password|username and password/i, canonical: "Email + password (JWT)" },
    { re: /\bjwt\b/i, canonical: "JWT" },
    { re: /google\s*oauth|sign in with google/i, canonical: "Google OAuth" },
    { re: /magic\s*link/i, canonical: "Magic link" },
  ],
  speech: [
    { re: /on-device|on device|offline speech|local speech|local model/i, canonical: "On-device STT/TTS" },
    { re: /whisper\b/i, canonical: "Whisper (on-device)" },
    { re: /google cloud speech|cloud speech-to-text|cloud stt/i, canonical: "Cloud STT/TTS (Google Cloud)" },
    { re: /speech-to-text|text-to-speech|\bstt\b|\btts\b/i, canonical: "Cloud STT/TTS (unspecified provider)" },
  ],
  sync: [
    { re: /offline-first/i, canonical: "Offline-first" },
    { re: /outbox/i, canonical: "Outbox queue" },
    { re: /last-write-wins/i, canonical: "Last-write-wins" },
    { re: /field-level (merge|sync)/i, canonical: "Field-level merge" },
    { re: /crdt/i, canonical: "CRDT" },
  ],
  hosting: [
    { re: /vercel\b/i, canonical: "Vercel" },
    { re: /render\b/i, canonical: "Render" },
    { re: /railway\b/i, canonical: "Railway" },
    { re: /\beas\b|expo application services/i, canonical: "EAS" },
    { re: /\baws\b|amazon web services/i, canonical: "AWS" },
    { re: /google cloud(?! speech)|gcp\b/i, canonical: "Google Cloud" },
  ],
};

export type DetectedDecision = {
  key: TechDecisionKey;
  values: string[];
  sources: string[];
  conflict: boolean;
};

/**
 * Scan doc contents for what each one claims. Returns one entry per key
 * that appears anywhere. `conflict` is true when docs name different
 * values for the same key — the human must pick the winner.
 */
export function detectDecisions(
  docs: { kind: string; content: string }[]
): DetectedDecision[] {
  const found = new Map<TechDecisionKey, { values: Set<string>; sources: Set<string> }>();
  for (const doc of docs) {
    if (!doc.content) continue;
    for (const def of TECH_DECISION_DEFS) {
      for (const pattern of DETECTION_PATTERNS[def.key]) {
        if (pattern.re.test(doc.content)) {
          let entry = found.get(def.key);
          if (!entry) {
            entry = { values: new Set(), sources: new Set() };
            found.set(def.key, entry);
          }
          entry.values.add(pattern.canonical);
          entry.sources.add(doc.kind);
        }
      }
    }
  }
  return TECH_DECISION_DEFS.filter((d) => found.has(d.key)).map((d) => {
    const entry = found.get(d.key)!;
    return {
      key: d.key,
      values: [...entry.values],
      sources: [...entry.sources],
      conflict: entry.values.size > 1,
    };
  });
}

// --- DECISIONS.md: rendered deterministically, never by the AI -----------

/** Render DECISIONS.md from the locked record + stack lock. Pure. */
export function buildDecisionsDocContent(opts: {
  projectName: string;
  ideaTitle: string;
  decisions: TechDecisions;
  stackLock: string | null | undefined;
  detected: DetectedDecision[];
}): string {
  const { projectName, ideaTitle, decisions, stackLock, detected } = opts;
  const rows = TECH_DECISION_DEFS.map((d) => {
    const value = decisions[d.key]?.trim();
    const det = detected.find((x) => x.key === d.key);
    const status = value
      ? "Locked"
      : det?.conflict
        ? `UNDECIDED — docs disagree (${det.values.join(" vs ")})`
        : "Undecided";
    return `| ${d.label} | ${value ?? "—"} | ${status} |`;
  });

  const open = TECH_DECISION_DEFS.filter((d) => !decisions[d.key]?.trim()).map(
    (d) => `- [ ] ${d.label}: ${d.hint}`
  );

  return `# Technical Decisions Log

Project: ${projectName} — Idea: ${ideaTitle}

Decisions in this file are the single source of truth. Every document in this pack must match them. When a decision changes, regenerate the affected documents so the pack never contradicts itself.

## Locked decisions

| Decision | Value | Status |
| --- | --- | --- |
${rows.join("\n")}

${
  stackLock?.trim()
    ? `## Canonical tech stack\n\n\`\`\`\n${stackLock.trim()}\n\`\`\`\n`
    : ""
}## Open questions

Decide these before building. Undecided items are the ones most likely to produce contradictions across documents.

${open.length > 0 ? open.join("\n") : "None — every decision is locked."}

## How decisions change

1. Change the value in the project's Locked Decisions panel.
2. Regenerate the affected documents (or run Align).
3. This file re-renders automatically from the locked record — never edit it by hand.
`;
}
