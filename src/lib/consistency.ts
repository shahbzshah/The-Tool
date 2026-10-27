/**
 * Deterministic doc-consistency check. No AI calls: it extracts tables,
 * endpoints, and technology claims from the generated markdown and reports
 * where documents disagree with each other or with the locked decisions.
 *
 * Runs on demand (Docs page, Export preview, zip README). Informational —
 * it never blocks a download — but a pack with open contradictions must not
 * claim to be complete.
 */

import {
  DOC_KINDS,
  applicableKinds,
  type IdeaLike,
} from "@/lib/constants";
import {
  parseTechDecisions,
  type TechDecisions,
} from "@/lib/decisions";

export type ConsistencyIssue = {
  type: "database" | "endpoints" | "tables" | "lock" | "missing";
  severity: "blocking" | "gap";
  message: string;
  docs: string[];
};

export type ConsistencyReport = {
  issues: ConsistencyIssue[];
  missingKinds: string[];
  checkedKinds: string[];
  ok: boolean;
};

const ENGINE_PATTERNS: { re: RegExp; canonical: string }[] = [
  { re: /postgres(ql)?\b/i, canonical: "PostgreSQL" },
  { re: /firestore\b/i, canonical: "Firestore" },
  { re: /dynamodb|dynamo\s?db\b/i, canonical: "DynamoDB" },
  { re: /mongodb|mongo\b/i, canonical: "MongoDB" },
  { re: /sqlite\b/i, canonical: "SQLite" },
  { re: /mysql\b/i, canonical: "MySQL" },
  { re: /supabase\b/i, canonical: "Supabase (PostgreSQL)" },
];

function enginesIn(content: string): Set<string> {
  const found = new Set<string>();
  for (const p of ENGINE_PATTERNS) {
    if (p.re.test(content)) found.add(p.canonical);
  }
  return found;
}

function normalizeTableName(name: string): string {
  // Singularize so "users" vs "user" and "calendar_events" vs
  // "calendar_event" compare equal; both sides are normalized the same way.
  const lower = name.toLowerCase().replace(/\s+/g, "_");
  return lower.endsWith("s") && !lower.endsWith("ss") && lower.length > 3
    ? lower.slice(0, -1)
    : lower;
}

const TABLE_NAME_JUNK = new Set(["sql", "example", "table", "schema"]);

function tablesIn(content: string, kind: string): Set<string> {
  const tables = new Set<string>();
  const createTable = /CREATE TABLE\s+["`]?([A-Za-z_][A-Za-z0-9_]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = createTable.exec(content)) !== null) {
    const name = normalizeTableName(m[1]);
    if (!TABLE_NAME_JUNK.has(name)) tables.add(name);
  }
  // Headings like "### Users Table" — only single identifier-like names.
  const headingTable = /^#{2,4}\s+([A-Za-z_][A-Za-z0-9_]*)\s+Table\b/gim;
  while ((m = headingTable.exec(content)) !== null) {
    const name = normalizeTableName(m[1]);
    if (!TABLE_NAME_JUNK.has(name)) tables.add(name);
  }
  if (kind === "MASTER_PROMPT") {
    // Tables list: backticked snake_case identifiers in a "Tables:" block.
    const block = content.match(/Tables:[\s\S]{0,800}/i)?.[0] ?? "";
    const ticked = /`([a-z][a-z0-9_]+)`/g;
    while ((m = ticked.exec(block)) !== null) {
      const name = normalizeTableName(m[1]);
      if (!TABLE_NAME_JUNK.has(name)) tables.add(name);
    }
  }
  return tables;
}

const METHOD_PATH = /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[A-Za-z0-9_\-{}:./]+)/g;

function resourcesIn(content: string): Set<string> {
  const resources = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = METHOD_PATH.exec(content)) !== null) {
    const first = m[2].split("/").filter(Boolean)[0];
    if (first) resources.add(first.toLowerCase().replace(/[{:}].*$/, ""));
  }
  return resources;
}

function canonicalEngine(value: string): string | null {
  const lower = value.toLowerCase();
  for (const p of ENGINE_PATTERNS) {
    if (p.re.test(lower)) return p.canonical;
  }
  return null;
}

export function checkConsistency(opts: {
  docs: { kind: string; content: string }[];
  idea: IdeaLike;
  techDecisionsRaw?: string | null;
}): ConsistencyReport {
  const { docs, idea, techDecisionsRaw } = opts;
  const byKind = new Map(docs.map((d) => [d.kind, d.content ?? ""]));
  const issues: ConsistencyIssue[] = [];

  // --- Missing kinds -----------------------------------------------------
  const required = applicableKinds(idea).map((d) => d.kind);
  const missingKinds = required.filter((k) => !byKind.get(k)?.trim());
  for (const kind of missingKinds) {
    const label = DOC_KINDS.find((d) => d.kind === kind)?.label ?? `${kind}.md`;
    issues.push({
      type: "missing",
      severity: "gap",
      message: `Missing document: ${label} — generate it so the pack is complete.`,
      docs: [],
    });
  }

  // --- Database agreement -------------------------------------------------
  const engineDocs = ["TECHNICAL_SPEC", "BRD", "MASTER_PROMPT", "DATABASE_SCHEMA"];
  const perDocEngines = new Map<string, Set<string>>();
  for (const kind of engineDocs) {
    const content = byKind.get(kind);
    if (content?.trim()) perDocEngines.set(kind, enginesIn(content));
  }
  const allEngines = new Set<string>();
  for (const set of perDocEngines.values()) for (const e of set) allEngines.add(e);
  if (allEngines.size > 1) {
    const parts = [...perDocEngines.entries()]
      .filter(([, set]) => set.size > 0)
      .map(([kind, set]) => `${kind} says ${[...set].join(", ")}`);
    issues.push({
      type: "database",
      severity: "blocking",
      message: `Database differs across documents: ${parts.join("; ")}. Lock one database in Locked Decisions, then regenerate the disagreeing docs.`,
      docs: [...perDocEngines.keys()],
    });
  }

  // --- Locked-decision agreement ------------------------------------------
  const locked: TechDecisions = parseTechDecisions(techDecisionsRaw);
  const lockedEngine = locked.database ? canonicalEngine(locked.database) : null;
  if (lockedEngine) {
    for (const [kind, set] of perDocEngines) {
      if (set.size > 0 && !set.has(lockedEngine)) {
        issues.push({
          type: "lock",
          severity: "blocking",
          message: `${kind} names ${[...set].join(", ")} but the locked database decision is ${locked.database}. Regenerate it with the lock applied.`,
          docs: [kind],
        });
      }
    }
  }

  // --- Endpoint / resource agreement ---------------------------------------
  const apiSpec = byKind.get("API_SPEC");
  const master = byKind.get("MASTER_PROMPT");
  if (apiSpec?.trim() && master?.trim()) {
    const apiResources = resourcesIn(apiSpec);
    const masterResources = resourcesIn(master);
    const onlyInMaster = [...masterResources].filter((r) => !apiResources.has(r) && r !== "token");
    // /token is the auth endpoint — its absence from the master prompt
    // summary is fine, as is its presence in API_SPEC alone.
    const onlyInApi = [...apiResources].filter((r) => !masterResources.has(r) && r !== "token");
    for (const r of onlyInMaster) {
      issues.push({
        type: "endpoints",
        severity: "blocking",
        message: `/${r} endpoints appear in MASTER_PROMPT but have no definition in API_SPEC. Add them to API_SPEC or remove them from the master prompt.`,
        docs: ["MASTER_PROMPT", "API_SPEC"],
      });
    }
    for (const r of onlyInApi) {
      issues.push({
        type: "endpoints",
        severity: "gap",
        message: `/${r} endpoints are defined in API_SPEC but never mentioned in MASTER_PROMPT.`,
        docs: ["API_SPEC", "MASTER_PROMPT"],
      });
    }
  }

  // --- Table agreement ------------------------------------------------------
  const schemaTables = byKind.get("DATABASE_SCHEMA");
  const masterTables = byKind.get("MASTER_PROMPT");
  if (schemaTables?.trim() && masterTables?.trim()) {
    const inSchema = tablesIn(schemaTables, "DATABASE_SCHEMA");
    const inMaster = tablesIn(masterTables, "MASTER_PROMPT");
    if (inSchema.size > 0 && inMaster.size > 0) {
      const onlySchema = [...inSchema].filter((t) => !inMaster.has(t));
      const onlyMaster = [...inMaster].filter((t) => !inSchema.has(t));
      if (onlySchema.length > 0 || onlyMaster.length > 0) {
        const parts: string[] = [];
        if (onlySchema.length > 0)
          parts.push(`only in DATABASE_SCHEMA: ${onlySchema.join(", ")}`);
        if (onlyMaster.length > 0)
          parts.push(`only in MASTER_PROMPT: ${onlyMaster.join(", ")}`);
        issues.push({
          type: "tables",
          severity: "blocking",
          message: `Table names differ between documents (${parts.join("; ")}). The schema and the master prompt must name the same tables with the same relationships.`,
          docs: ["DATABASE_SCHEMA", "MASTER_PROMPT"],
        });
      }
    }
  }

  return {
    issues,
    missingKinds,
    checkedKinds: docs.map((d) => d.kind),
    ok: issues.length === 0,
  };
}
