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
    // "cloud stt" on its own is NOT the Google value — a doc that just
    // says "cloud STT" names no provider. The Google label needs the word
    // "Google" on the same line, near an STT/TTS/speech word.
    { re: /google cloud[^.\n]{0,40}(stt|tts|speech)/i, canonical: "Cloud STT/TTS (Google Cloud)" },
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
    // "Render" is case-sensitive on purpose: lowercase "render" is the
    // everyday verb ("render the dashboard"), not the hosting platform.
    { re: /\bRender\b/, canonical: "Render" },
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
  /** Which doc kinds named each value — so a fix knows what to regenerate. */
  valueSources: Record<string, string[]>;
  conflict: boolean;
};

// Sync model components: a detected component agrees with the lock when
// the lock names that component ("Offline-first with outbox +
// last-write-wins" names all three).
const SYNC_TOKENS: Record<string, string> = {
  "Offline-first": "offline-first",
  "Outbox queue": "outbox",
  "Last-write-wins": "last-write-wins",
  "Field-level merge": "field-level",
  CRDT: "crdt",
};

const ENGINE_OF_VALUE = (value: string): string | null => {
  const lower = value.toLowerCase();
  if (/supabase|postgres/.test(lower)) return "PostgreSQL";
  if (/firestore/.test(lower)) return "Firestore";
  if (/dynamodb|dynamo/.test(lower)) return "DynamoDB";
  if (/mongodb|mongo/.test(lower)) return "MongoDB";
  if (/sqlite/.test(lower)) return "SQLite";
  if (/mysql/.test(lower)) return "MySQL";
  return null;
};

/**
 * Does a detected value agree with the locked decision? Same thing under
 * another label counts as agreement, and so do complementary layers —
 * SQLite is the local half of a local-first database, Node.js + Express
 * is the API runtime in front of a backend platform, and "Cloud STT/TTS"
 * without a named provider is the same mode as the Google Cloud one.
 * This is the one shared rule: the Decisions panel and the consistency
 * audit both use it, so they can never disagree about what counts.
 */
export function valueAgreesWithLock(
  key: TechDecisionKey,
  value: string,
  locked: string
): boolean {
  const lock = locked.toLowerCase();
  const has = (token: string) => lock.includes(token);
  switch (key) {
    case "database": {
      // SQLite is the local layer: it agrees with any cloud database lock.
      if (value === "SQLite") return true;
      return ENGINE_OF_VALUE(value) === ENGINE_OF_VALUE(locked);
    }
    case "frontend": {
      // Bare "React" is the framework underneath React Native and Next.js.
      if (value === "React") return has("react");
      if (value === "React Native + Expo")
        return has("react native") || has("expo");
      if (value === "Next.js") return has("next");
      return has(value.toLowerCase());
    }
    case "backend": {
      if (value === "Node.js + Express")
        return (
          has("node") ||
          has("express") ||
          has("supabase") ||
          has("firebase")
        );
      if (value === "Next.js route handlers") return has("next");
      return has(value.toLowerCase());
    }
    case "auth": {
      if (value === "JWT") return has("jwt");
      if (value.startsWith("Email")) return has("email");
      if (value === "Google OAuth") return has("google");
      if (value === "Magic link") return has("magic");
      return false;
    }
    case "speech": {
      if (value === "On-device STT/TTS" || value === "Whisper (on-device)")
        return (
          has("on-device") || has("on device") || has("local") || has("whisper")
        );
      // Both cloud variants agree with any cloud lock.
      return has("cloud");
    }
    case "sync": {
      const token = SYNC_TOKENS[value];
      return token ? has(token) : false;
    }
    case "hosting": {
      return has(value.toLowerCase());
    }
  }
}

// [keep, drop] — the same thing under two labels; the drop is noise.
// Applied to the pooled values before the conflict is computed.
const ALIAS_DROPS: Partial<Record<TechDecisionKey, [string, string][]>> = {
  database: [["Supabase (PostgreSQL)", "PostgreSQL"]],
  frontend: [["React Native + Expo", "React"]],
  speech: [
    ["Cloud STT/TTS (Google Cloud)", "Cloud STT/TTS (unspecified provider)"],
  ],
};

/**
 * Scan doc contents for what each one claims. Returns one entry per key
 * that appears anywhere.
 *
 * `conflict` means a doc disagrees with the LOCKED decision when a lock is
 * passed in, and "the docs disagree with each other" when it isn't. The
 * old rule (more than one value mentioned) cried wolf on every layered
 * architecture: SQLite + PostgreSQL is one local-first design, not a
 * disagreement, and neither is "React Native" mentioned alongside "React".
 */
export function detectDecisions(
  docs: { kind: string; content: string }[],
  locked?: TechDecisions
): DetectedDecision[] {
  const found = new Map<
    TechDecisionKey,
    {
      values: Set<string>;
      sources: Set<string>;
      valueSources: Map<string, Set<string>>;
    }
  >();
  for (const doc of docs) {
    if (!doc.content) continue;
    for (const def of TECH_DECISION_DEFS) {
      const lockedValue = locked?.[def.key]?.trim();
      // "Google Cloud" as a speech provider is not a hosting claim:
      // drop it from any line that is about STT/TTS/speech before the
      // hosting patterns run. A genuine hosting mention ("deployed on
      // Google Cloud") sits on a line with no speech words and survives.
      const content =
        def.key === "hosting"
          ? doc.content
              .split("\n")
              .map((line) =>
                /stt|tts|speech/i.test(line)
                  ? line.replace(/google cloud/gi, " ")
                  : line
              )
              .join("\n")
          : doc.content;
      for (const pattern of DETECTION_PATTERNS[def.key]) {
        // A disagreeing value is not counted when its own line also names
        // the locked value — that line is an override note ("the design
        // says Firebase but the LOCKED stack mandates Supabase"), not a
        // claim that the alternative IS the stack. Agreeing values are
        // always counted; without a lock there is no excusal at all.
        const agrees = lockedValue
          ? valueAgreesWithLock(def.key, pattern.canonical, lockedValue)
          : null;
        const re = new RegExp(
          pattern.re.source,
          pattern.re.flags.includes("g")
            ? pattern.re.flags
            : pattern.re.flags + "g"
        );
        let matched = false;
        for (const m of content.matchAll(re)) {
          if (agrees === false) {
            const at = m.index ?? 0;
            const start = content.lastIndexOf("\n", at - 1) + 1;
            const end = content.indexOf("\n", at);
            const line = content.slice(start, end === -1 ? undefined : end);
            const overridden = DETECTION_PATTERNS[def.key].some(
              (p) =>
                p.canonical !== pattern.canonical &&
                lockedValue &&
                valueAgreesWithLock(def.key, p.canonical, lockedValue) &&
                p.re.test(line)
            );
            // Quoted design-label text is not a stack claim either: the
            // docgen prompt tells the AI to note "the design label still
            // says the old provider" — a line doing that names the old
            // provider only to record what the screen shows.
            const quotedLabel = /design label/i.test(line);
            if (overridden || quotedLabel) continue;
          }
          matched = true;
          break;
        }
        if (matched) {
          let entry = found.get(def.key);
          if (!entry) {
            entry = {
              values: new Set(),
              sources: new Set(),
              valueSources: new Map(),
            };
            found.set(def.key, entry);
          }
          entry.values.add(pattern.canonical);
          entry.sources.add(doc.kind);
          const kinds = entry.valueSources.get(pattern.canonical) ?? new Set<string>();
          kinds.add(doc.kind);
          entry.valueSources.set(pattern.canonical, kinds);
        }
      }
    }
  }
  return TECH_DECISION_DEFS.filter((d) => found.has(d.key)).map((d) => {
    const entry = found.get(d.key)!;
    const values = new Set(entry.values);
    for (const [keep, drop] of ALIAS_DROPS[d.key] ?? []) {
      if (values.has(keep)) values.delete(drop);
    }
    const valueList = [...values];
    const lockedValue = locked?.[d.key]?.trim();
    const conflict = lockedValue
      ? valueList.some((v) => !valueAgreesWithLock(d.key, v, lockedValue))
      : values.size > 1;
    const valueSources: Record<string, string[]> = {};
    for (const [value, kinds] of entry.valueSources) {
      if (values.has(value)) valueSources[value] = [...kinds];
    }
    return {
      key: d.key,
      values: valueList,
      sources: [...entry.sources],
      valueSources,
      conflict,
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
