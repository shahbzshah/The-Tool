import { DOC_KINDS } from "@/lib/constants";

export type ExportToolId =
  | "cursor"
  | "claude"
  | "copilot"
  | "windsurf"
  | "vscode"
  | "bolt"
  | "lovable"
  | "v0";

export type ExportInput = {
  ideaTitle: string;
  pitch: string;
  docs: Record<string, string>;
};

function docFileMap(docs: Record<string, string>): Record<string, string> {
  const files: Record<string, string> = {};
  for (const d of DOC_KINDS) {
    if (docs[d.kind]) files[`docs/${d.label}`] = docs[d.kind];
  }
  return files;
}

function masterPrompt(docs: Record<string, string>): string | null {
  return docs["MASTER_PROMPT"] ?? null;
}

function rules(docs: Record<string, string>): string | null {
  return docs["RULES"] ?? null;
}

function combinedPrompt(input: ExportInput): string {
  const m = masterPrompt(input.docs);
  const r = rules(input.docs);
  const parts = [
    `# ${input.ideaTitle}`,
    input.pitch,
    "",
    m ?? "No MASTER_PROMPT.md generated — see docs/ for full project documents.",
    r ? `\n# Coding Rules\n${r}` : "",
  ];
  return parts.filter(Boolean).join("\n\n");
}

export type ExportTool = {
  id: ExportToolId;
  name: string;
  emoji: string;
  tagline: string;
  /** Where the user should drop the extracted files */
  usage: string;
  build: (input: ExportInput) => Record<string, string>;
};

export const EXPORT_TOOLS: ExportTool[] = [
  {
    id: "vscode",
    name: "VS Code",
    emoji: "💻",
    tagline: "Settings, extension recs & Copilot instructions",
    usage:
      "Unzip into your project root, then open the folder in VS Code. Copilot Chat picks up .github/copilot-instructions.md automatically; .vscode/ applies settings and extension recommendations on first open.",
    build: (input) => ({
      ".github/copilot-instructions.md": `# ${input.ideaTitle}\n\n${combinedPrompt(input)}`,
      ".vscode/settings.json": JSON.stringify(
        {
          "editor.formatOnSave": true,
          "editor.tabSize": 2,
          "files.eol": "\n",
          "files.trimTrailingWhitespace": true,
          "files.insertFinalNewline": true,
          "search.exclude": {
            "**/node_modules": true,
            "**/dist": true,
            "**/build": true,
            "**/.next": true,
          },
          "typescript.tsdk": "node_modules/typescript/lib",
        },
        null,
        2
      ),
      ".vscode/extensions.json": JSON.stringify(
        {
          recommendations: [
            "dbaeumer.vscode-eslint",
            "esbenp.prettier-vscode",
            "bradlc.vscode-tailwindcss",
            "github.copilot",
            "github.copilot-chat",
          ],
        },
        null,
        2
      ),
      ...docFileMap(input.docs),
    }),
  },
  {
    id: "cursor",
    name: "Cursor",
    emoji: "🖥️",
    tagline: "Rules file + full docs for the AI-native IDE",
    usage:
      "Unzip into your project root. .cursorrules is picked up automatically; reference docs/ in chat with @file.",
    build: (input) => ({
      ".cursorrules": `# Cursor rules for ${input.ideaTitle}\n\n${combinedPrompt(input)}`,
      ...docFileMap(input.docs),
    }),
  },
  {
    id: "claude",
    name: "Claude Code",
    emoji: "🧠",
    tagline: "CLAUDE.md project memory + full docs",
    usage:
      "Unzip into your project root. Claude Code reads CLAUDE.md automatically at session start.",
    build: (input) => ({
      "CLAUDE.md": `# ${input.ideaTitle}\n\n${combinedPrompt(input)}`,
      ...docFileMap(input.docs),
    }),
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    emoji: "🐙",
    tagline: "Copilot instructions file + full docs",
    usage:
      "Unzip into your project root. .github/copilot-instructions.md is read by Copilot Chat as custom instructions.",
    build: (input) => ({
      ".github/copilot-instructions.md": `# ${input.ideaTitle}\n\n${combinedPrompt(input)}`,
      ...docFileMap(input.docs),
    }),
  },
  {
    id: "windsurf",
    name: "Windsurf",
    emoji: "🏄",
    tagline: "Windsurf rules file + full docs",
    usage:
      "Unzip into your project root. .windsurfrules is loaded automatically as Cascade guidelines.",
    build: (input) => ({
      ".windsurfrules": `# ${input.ideaTitle}\n\n${combinedPrompt(input)}`,
      ...docFileMap(input.docs),
    }),
  },
  {
    id: "bolt",
    name: "Bolt.new",
    emoji: "⚡",
    tagline: "One-shot master prompt (paste into Bolt)",
    usage:
      "Open PROMPT.txt, copy the whole thing, and paste it as your first message in Bolt.new.",
    build: (input) => ({
      "PROMPT.txt": combinedPrompt(input),
      ...docFileMap(input.docs),
    }),
  },
  {
    id: "lovable",
    name: "Lovable",
    emoji: "💜",
    tagline: "One-shot master prompt (paste into Lovable)",
    usage:
      "Open PROMPT.txt, copy the whole thing, and paste it as your project description in Lovable.",
    build: (input) => ({
      "PROMPT.txt": combinedPrompt(input),
      ...docFileMap(input.docs),
    }),
  },
  {
    id: "v0",
    name: "v0 by Vercel",
    emoji: "▲",
    tagline: "Design-system-first prompt for UI generation",
    usage:
      "Open PROMPT.txt and paste it into v0. Use the DESIGN_SYSTEM.md extract inline to keep the UI on-brand.",
    build: (input) => {
      const design = input.docs["DESIGN_SYSTEM"];
      return {
        "PROMPT.txt": `${combinedPrompt(input)}${design ? `\n\n# Design System (apply these tokens exactly)\n${design}` : ""}`,
        ...docFileMap(input.docs),
      };
    },
  },
];

export function findTool(id: string): ExportTool | undefined {
  return EXPORT_TOOLS.find((t) => t.id === id);
}
