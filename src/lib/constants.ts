export const DOC_KINDS = [
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
      "Build this from the Uploaded Stitch Exports — the actual designed screens, NOT the prompt alone. For every screen: name, purpose, key components and layout, and the user flows it supports. Then add a Feature Coverage section mapping each canonical feature from the Approved App Idea to the screen(s) implementing it. Any feature with no corresponding screen MUST be listed under 'Missing from design' — never drop it, never invent features. If no exports were uploaded, base the screen list on the Stitch prompt's screens and mark the document as draft pending Stitch export.",
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
    instructions:
      "Include: naming conventions (files, variables, components, DB), code style rules, file organization rules, git commit conventions, testing expectations, and things to never do. Make rules concrete and enforceable.",
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
