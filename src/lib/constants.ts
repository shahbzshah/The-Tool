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
};
