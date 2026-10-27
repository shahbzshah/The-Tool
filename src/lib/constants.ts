export type DocKindDef = {
  kind: string;
  label: string;
  title: string;
  skipDesignContext?: boolean;
  /** Rendered deterministically from project data, never by the AI. */
  deterministic?: boolean;
  /** Only required when the project needs it (see isKindApplicable). */
  conditional?: "voice" | "offline";
  instructions: string;
};

export const DOC_KINDS: DocKindDef[] = [
  {
    kind: "REFINED_BRIEF",
    label: "REFINED_BRIEF.md",
    title: "Refined Product Brief",
    instructions:
      "Write the refined product brief from the Refine discussion: the problem, the target user, the final feature list (must-have vs later), what was cut and why, positioning against the analyzed competitor, monetization, and open questions. This is the human-readable record of every product decision made in Refine.",
  },
  {
    kind: "PRD",
    label: "PRD.md",
    title: "Product Requirements Document",
    instructions:
      "Include: product overview, problem statement, goals and non-goals, functional requirements (numbered, grouped by feature), non-functional requirements (performance, security, accessibility), user roles and permissions, success metrics, and risks with mitigations.",
  },
  {
    kind: "BRD",
    label: "BRD.md",
    title: "Business Requirements Document",
    instructions:
      "Include: business objectives, market analysis summary, target market and user personas, revenue model and pricing tiers, competitive landscape, go-to-market strategy, resourcing/budget estimate, and business KPIs.",
  },
  {
    kind: "TECHNICAL_SPEC",
    label: "TECHNICAL_SPEC.md",
    title: "Technical Specification",
    instructions:
      "Include: recommended tech stack with justification for each choice, high-level architecture (describe components and data flow), third-party integrations, environment variables needed, security considerations, performance considerations, and deployment strategy.",
  },
  {
    kind: "USER_STORIES",
    label: "USER_STORIES.md",
    title: "User Stories & Acceptance Criteria",
    instructions:
      "Organize by epic. Each story in the format 'As a <role>, I want <action>, so that <benefit>' followed by acceptance criteria in Given/When/Then format. Cover all major features of the app.",
  },
  {
    kind: "WORKFLOW",
    label: "WORKFLOW.md",
    title: "User Flows & Navigation Map",
    instructions:
      "Describe the primary user journey step by step, all key user flows (sign-up, core actions, edge cases), a text-based navigation map showing how screens connect, and error/empty/loading states per screen.",
  },
  {
    kind: "DATABASE_SCHEMA",
    label: "DATABASE_SCHEMA.md",
    title: "Database Schema",
    instructions:
      "For each table: name, purpose, fields with types and constraints, and relationships. Include an entity-relationship description, indexing recommendations, and example CREATE TABLE SQL statements.",
  },
  {
    kind: "API_SPEC",
    label: "API_SPEC.md",
    title: "API Specification",
    instructions:
      "List every endpoint with method, path, purpose, request body/response shape (JSON examples), auth requirements, and error responses. Define the standard error format and status code conventions.",
  },
  {
    kind: "DESIGN_SYSTEM",
    label: "DESIGN_SYSTEM.md",
    title: "Design System",
    instructions:
      "Base this on the Stitch design context provided (DESIGN.md tokens, HTML structure). Include: color palette (with hex tokens), typography scale, spacing system, border radii, shadows, and a component inventory with usage rules for each component.",
  },
  {
    kind: "UI",
    label: "UI.md",
    title: "UI Screens",
    instructions:
      "Build this from the Uploaded Stitch Exports — the actual designed screens, NOT the prompt alone. STRICT RULES: (1) List ONLY screens present in the exports — one entry per export folder. UI components (nav bars, buttons, cards, headers) are components within a screen, NEVER screens themselves. (2) Describe each screen from its actual outline: name the real headings, buttons, inputs, and sections the export contains — no generic filler like 'card-based layout with generous whitespace'. (3) Then add a Feature Coverage section mapping each canonical feature from the Approved App Idea to the screen(s) implementing it. (4) Add a Story Coverage section mapping each user story (sign-up, log in, create/edit/delete flows, settings, voice, sync) to the screen(s) implementing it — stories with no screen must be listed explicitly as gaps, including auth screens and create/edit forms. (5) The 'Missing from design' section may ONLY list canonical features and user stories that have no screen — NEVER invent features. If no exports were uploaded, base the screen list on the Stitch prompt's screens and mark the document as draft pending Stitch export.",
  },
  {
    kind: "FOLDER_STRUCTURE",
    label: "FOLDER_STRUCTURE.md",
    title: "Recommended Folder Structure",
    instructions:
      "Show a full project directory tree in a code block, with a short explanation of each folder/file's purpose and where new features should be added.",
  },
  {
    kind: "RULES",
    label: "RULES.md",
    title: "Coding Rules & Conventions",
    skipDesignContext: true,
    instructions:
      "Include: naming conventions (files, variables, components, DB), code style rules, file organization rules, git commit conventions, testing expectations, and things to never do. Make rules concrete and enforceable. Then include a MANDATORY Security Checklist section with a concrete, enforceable rule for EACH of these 20 items — no item may be skipped or summarized away: " +
      "1. Hide API keys — all secrets in environment variables only, never in source code, client bundles, or logs; separate public vs secret keys. " +
      "2. Purge Git secrets — no secrets ever committed; .gitignore/.env.example patterns; rotate any exposed credential immediately; scrub history if leaked. " +
      "3. Use public DB key — client apps use only the public/anon key; service_role/admin keys stay server-side only. " +
      "4. Enable row-level security — RLS enabled on every table with explicit policies; deny-by-default. " +
      "5. Encrypt sensitive data — encryption at rest for PII/secrets; TLS in transit; never store sensitive data in plaintext. " +
      "6. Enforce server-side auth — verify authentication and authorization on every server endpoint; never trust client claims. " +
      "7. Lock record access — users can only read/write their own records (ownership checks on every query). " +
      "8. Block field tampering — whitelist updatable fields per endpoint; reject mass-assignment of protected fields (role, ownerId, etc.). " +
      "9. Secure session cookies — httpOnly, Secure, SameSite=Lax/Strict; short expiry; rotate on privilege change. " +
      "10. Hash passwords — bcrypt/argon2 with proper work factor; never plaintext, never reversible encryption. " +
      "11. Rate limit login — throttle auth endpoints (e.g. 5 attempts per 15 min per IP); exponential backoff; alert on spikes. " +
      "12. Add bot protection — CAPTCHA/Turnstile on login, register, and public forms. " +
      "13. Parameterize queries — ORM or parameterized statements only; zero string-interpolated SQL. " +
      "14. Validate all input — server-side schema validation (e.g. zod) on every endpoint; reject unknown fields. " +
      "15. Escape user content — escape/sanitize all user content at render; CSP as backstop against XSS. " +
      "16. Restrict file uploads — allowlist file types, size caps, scan content, store outside web root, never execute uploads. " +
      "17. Trim API responses — return only fields the client needs; strip password hashes, tokens, internal IDs. " +
      "18. Add security headers — Content-Security-Policy, Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options, Referrer-Policy. " +
      "19. Force HTTPS — redirect all HTTP to HTTPS; HSTS with preload; no mixed content. " +
      "20. Scan dependencies — lockfiles committed; automated vulnerability scanning (e.g. npm audit/Dependabot); patch critical CVEs promptly.",
  },
  {
    kind: "ARCHITECTURE",
    label: "ARCHITECTURE.md",
    title: "System Architecture",
    instructions:
      "Describe how the app works end to end, using ONLY the locked technical decisions and canonical stack: components and their responsibilities, data flow for the core flows (including auth, voice, and sync when the app has them), folder conventions, state management, API/backend shape, database choice with justification, third-party integrations, offline/sync architecture when the app works offline, and architectural rules that must never be violated. Include a component diagram in text form. Every technology named must match the locked decisions — never introduce alternatives.",
  },
  {
    kind: "TASKS",
    label: "TASKS.md",
    title: "Phased Task Breakdown",
    instructions:
      "Break the build into phased vertical slices, each shippable end to end (Phase 1 setup/scaffold, Phase 2 auth, then one phase per core user flow, then polish/release). For each task: checkbox, concrete deliverable, files involved, acceptance criteria in testable form, and definition of done. Order tasks so each phase builds on the previous one and the app is runnable after every phase. Cover every canonical feature and every user story — no feature without a task, no task without acceptance criteria. Use ONLY the locked technical decisions for stack, database, and services.",
  },
  {
    kind: "DECISIONS",
    label: "DECISIONS.md",
    title: "Technical Decisions Log",
    deterministic: true,
    instructions:
      "Rendered automatically from the project's locked technical decisions — never generated by the AI. Lists each locked decision, the undecided items that must be resolved before building, and the canonical stack lock.",
  },
  {
    kind: "VOICE_SPEC",
    label: "VOICE_SPEC.md",
    title: "Voice Interaction Specification",
    conditional: "voice",
    instructions:
      "Specify the voice feature completely, using ONLY the locked speech decision (cloud vs on-device): intent taxonomy (every intent the app supports, with required and optional slots), 3-5 example utterances per intent, slot extraction and validation rules, ambiguity handling (what happens when slots are missing or unclear), confirmation rules (which actions confirm before executing), error and fallback behavior (parse failure, low confidence, no speech detected, permission denied), confidence thresholds, latency budget, language support, TTS behavior (voice, rate, when speech output happens), barge-in behavior, and the audio privacy stance (whether audio is stored, streamed, retained, or deleted, and for how long). Every intent must map to a user story and an API endpoint or local action.",
  },
  {
    kind: "SYNC_SPEC",
    label: "SYNC_SPEC.md",
    title: "Offline & Sync Specification",
    conditional: "offline",
    instructions:
      "Specify offline-first behavior completely, using ONLY the locked database and sync decisions: local database choice and local schema (including migrations), the outbox/pending-sync queue protocol (enqueue, retry with backoff, ordering, deduplication), conflict resolution rules (state them exactly — last-write-wins vs field-level merge — with worked examples), tombstone handling for deletes, at-rest encryption for the local store, cache scope and eviction rules, background sync limits per platform (including iOS background-execution limits), what the user sees while offline (queue counts, sync status, conflict UI), and an airplane-mode test plan covering every core flow. Every rule must be implementable from this document alone.",
  },
  {
    kind: "MASTER_PROMPT",
    label: "MASTER_PROMPT.md",
    title: "Master Prompt for AI Coding Tools",
    instructions:
      "Write ONE comprehensive self-contained prompt that a developer can paste into an AI coding tool (Cursor, Bolt, v0, etc.) to build this app. Weave together: the app concept, tech stack, all features, design system summary, database schema summary, API surface, folder structure, and coding rules. It must be complete enough that an AI tool could build the app from it alone.",
  },
  {
    kind: "BUILD_GUIDE",
    label: "BUILD_GUIDE.md",
    title: "Vibe Coding Build Guide",
    skipDesignContext: true,
    instructions:
      "Write a complete beginner-to-production vibe-coding playbook tailored to THIS project and its locked tech stack. Follow this exact structure, keeping every step concrete to the project's stack and features (no generic placeholders):\n\n# 1. The Complete Workflow\nShow the full pipeline as a flow: IDEA → RESEARCH → DEFINE USER → PRD → TECH STACK → ARCHITECTURE → DESIGN → PROJECT RULES → TASK BREAKDOWN → SETUP → DEVELOPMENT → TESTING → SECURITY REVIEW → CODE REVIEW → PREVIEW DEPLOY → QA → PRODUCTION → MONITORING → ITERATION. Warn: never skip from IDEA straight to AI to DEPLOY.\n\n# 2. Define What to Build\nFive questions the developer must answer before touching AI tools: (1) What problem are you solving? (2) Who is the user? (3) What is the main outcome? (4) What is the MVP — list ONLY the core features for THIS app? (5) What is explicitly OUT of scope for v1? Stress that the out-of-scope list prevents AI from endlessly expanding the project.\n\n# 3. Research Before Coding\nCover: user research (who needs this, alternatives), competitor analysis (features, UI, pricing, strengths, weaknesses — name real competitors for THIS niche), technical feasibility (APIs, auth, database, hosting, cost for the locked stack). Recommend official docs over random blogs.\n\n# 4. Choose Your AI Coding Tool\nCompare: Replit (browser-based, quick prototypes), Lovable (web apps, UI-heavy), Bolt (fast TS prototypes), Cursor (existing repos, larger projects, local dev), Claude Code (terminal-based, agentic, repo-level tasks). Recommend which fits THIS project and why.\n\n# 5. Environment Setup\nExact install steps for the locked stack: required tools (editor, Node, Git, GitHub account, browser) with version-check commands, plus optional tools (Docker, DB client, deploy CLI).\n\n# 6. Project Scaffolding\nCommands to create the project folder, init Git + GitHub repo from day one (because AI can break things — Git gives rollback). Show the recommended project structure as a directory tree: docs/ (PRD, ARCHITECTURE, DESIGN, TEST_PLAN, SECURITY, DECISIONS, MEMORY), rules/ (for the AI tool), src/, tests/, plus README, TASKS, .env.example, .gitignore. Explain what each file does in one line.\n\n# 7. Documentation Set\nFor each doc, give a tailored outline for THIS app: PRD.md (problem, users, goals, numbered functional requirements, non-goals, success criteria), ARCHITECTURE.md (how it works: components, data flow, folder conventions, architectural rules), DESIGN.md (visual system: style, typography, colors with hex tokens, buttons, cards, responsive/accessibility requirements), RULES.md (the AI rulebook: general, before-coding, UI, security, testing, git conventions), TASKS.md (phased task breakdown with checkboxes — Phase 1 setup, Phase 2 auth, etc. for THIS app's features), DECISIONS.md (ADR format for key technical choices), MEMORY.md (current status, completed, current task, known issues, next step — vs DECISIONS which is permanent), TEST_PLAN.md (what 'working' means: per-feature checklists + responsive breakpoints), SECURITY.md (auth, authorization, secrets, input validation, file uploads), .env.example (every required variable, empty values).\n\n# 8. Minimum Viable Docs\nIf all of that feels heavy, the starter set is: PRD.md, RULES.md, TASKS.md, README.md, .env.example — add the rest as the project grows.\n\n# 9. Giving AI Context\nThe exact opening prompt: have the AI read PRD, ARCHITECTURE, DESIGN, RULES, TASKS first, then explain its implementation plan for the first task WITHOUT writing code yet.\n\n# 10. Build Loop\nThe professional loop for every feature: READ → UNDERSTAND → PLAN → IMPLEMENT → TEST → REVIEW → FIX → COMMIT → UPDATE DOCS. Then next feature.\n\n# 11. Vertical Slices & Small Tasks\nBuild complete user flows (signup → login → dashboard → create → display), not layer by layer. Never assign huge tasks — 'Create the signup UI' beats 'Build authentication'. Show the bad/better/best task-sizing example using THIS app's features.\n\n# 12. Structured Prompting Template\nThe six-part prompt: CONTEXT / TASK / FILES / CONSTRAINTS / ACCEPTANCE CRITERIA / TESTING — with a worked example implementing a real feature from THIS app.\n\n# 13. Testing\nAfter each feature: lint → typecheck → unit → integration → E2E. E2E example flow for THIS app (open → signup → login → core action → verify → logout). Tools for the locked stack.\n\n# 14. Review & Debug With AI\nReview checklist (correctness, architecture, security, error handling, accessibility, responsive, performance, duplication) — report issues before fixing. Debugging template: ERROR / EXPECTED / ACTUAL / REPRO STEPS / CONSTRAINT → ask for root cause first, then smallest fix.\n\n# 15. Git Discipline\nCommit after every working feature (status → add → commit → push), branch per feature for larger work.\n\n# 16. Deploy Pipeline\nPre-deploy QA checklist (functionality, UI at mobile/tablet/desktop, security, code quality gates). Pipeline: LOCAL → PREVIEW → QA → PRODUCTION. Environment variables per environment (dev/staging/prod). Production QA on the live URL (not just localhost). Post-launch: monitoring, error tracking, doc upkeep (TASKS, MEMORY, DECISIONS, README, ARCHITECTURE).\n\nEvery section must reference THIS app's actual features, stack, and hosting target — never the generic student-dashboard example.",
  },
] as const;

export type DocKind = (typeof DOC_KINDS)[number]["kind"];

export const CATEGORIES = [
  "SaaS / Web App",
  "Mobile App",
  "AI Tool",
  "Productivity",
  "E-commerce",
  "Social / Community",
  "Game / Entertainment",
  "Developer Tool",
  "Health & Fitness",
  "Finance",
  "Education",
  "Other",
] as const;

export type GeneratedIdea = {
  title: string;
  pitch: string;
  features: string[];
  targetAudience: string;
  monetization?: string;
  scores?: IdeaScores;
};

export type IdeaScores = {
  novelty: number; // 1-10
  feasibility: number; // 1-10
  marketDemand: number; // 1-10
};

export type IdeaValidation = {
  verdict: "strong" | "promising" | "risky";
  summary: string;
  strengths: string[];
  risks: string[];
  competitors: { name: string; note: string }[];
  suggestions: string[];
};

export function averageScore(scores: IdeaScores | null | undefined): number {
  if (!scores) return 0;
  const { novelty = 0, feasibility = 0, marketDemand = 0 } = scores;
  return Math.round(((novelty + feasibility + marketDemand) / 3) * 10) / 10;
}

export function parseJsonField<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/** Conditional doc kinds only apply when the project needs them. Pure and client-safe. */
const VOICE_KEYWORDS = [
  "voice",
  "speech",
  "audio",
  "microphone",
  "dictat",
  "talk to",
  "speak",
  "voice-first",
  "voice assistant",
  "voice command",
];

const OFFLINE_KEYWORDS = [
  "offline",
  "outbox",
  "airplane",
  "no connection",
  "local-first",
  "two-way sync",
  "conflict resolution",
  "works offline",
  "without internet",
];

export type IdeaLike = {
  title?: string | null;
  pitch?: string | null;
  features?: string[] | string | null;
  category?: string | null;
};

function ideaText(idea: IdeaLike): string {
  const features = Array.isArray(idea.features)
    ? idea.features.join(" ")
    : typeof idea.features === "string"
      ? idea.features
      : "";
  return [idea.title, idea.pitch, features, idea.category]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Whether a doc kind is required for this idea. Core kinds always apply. */
export function isKindApplicable(kind: DocKindDef, idea: IdeaLike): boolean {
  if (!kind.conditional) return true;
  const text = ideaText(idea);
  const keywords =
    kind.conditional === "voice" ? VOICE_KEYWORDS : OFFLINE_KEYWORDS;
  return keywords.some((k) => text.includes(k));
}

/** Doc kinds required for this idea: all core kinds plus applicable conditional ones. */
export function applicableKinds(idea: IdeaLike): DocKindDef[] {
  return DOC_KINDS.filter((d) => isKindApplicable(d, idea));
}
