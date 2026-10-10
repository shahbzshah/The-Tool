export const DOC_KINDS = [
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
      "Write a step-by-step vibe-coding playbook tailored to THIS project and its locked tech stack — a beginner-to-production guide the developer follows while building with AI coding tools. Structure it as numbered steps: 1) Define the build (problem, user, MVP scope, explicit out-of-scope list to prevent scope creep), 2) Research (users, competitors with strengths/weaknesses, technical feasibility for THIS stack), 3) Environment setup (exact install steps for the locked stack), 4) Project scaffolding (folder structure, git init, .env.example), 5) Documentation order (which docs to write first and why), 6) Giving AI context (which files to have the AI read before coding, in what order), 7) Vertical-slice build loop (one user flow at a time: understand → plan → implement → test → review → commit), 8) Structured prompting template (CONTEXT / TASK / FILES / CONSTRAINTS / ACCEPTANCE CRITERIA / TESTING) with a worked example from THIS app's features, 9) Testing checklist (unit, integration, E2E, responsive breakpoints), 10) Debugging with AI (how to report errors: expected vs actual, repro steps, constraints), 11) Git discipline (small commits, branch per feature), 12) Pre-deploy QA checklist, 13) Deploy pipeline (local → preview → production) for the locked hosting target, 14) Post-launch (monitoring, documentation upkeep). Keep every step concrete to this project's stack and features — no generic placeholders.",
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
