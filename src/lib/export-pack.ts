/**
 * Build the export pack's file map — the same files that go into the
 * downloadable zip, reused by the GitHub push so the two never drift
 * apart. Returns every file as a path → text-content map, plus the
 * repo-friendly slug of the idea title.
 *
 * Files: the selected tool's pack (docs, rules, scaffold stubs), the
 * curated agent skills for the project's platform, deterministic
 * .env.example + .gitignore, the stored design uploads (text only —
 * screenshots carry no stored bytes and are skipped), a README with the
 * consistency report, and a STALE_WARNING.txt when the idea changed
 * after the docs were generated.
 */

import { prisma } from "@/lib/db";
import { findTool } from "@/lib/exporters";
import { DOC_KINDS, applicableKinds } from "@/lib/constants";
import { buildSkillsBundle } from "@/lib/skills";
import { checkConsistency } from "@/lib/consistency";
import { collectEnvVars, buildEnvExample, buildGitignore } from "@/lib/packfiles";

export type ExportPack = {
  files: Record<string, string>;
  slug: string;
  ideaTitle: string;
};

export async function buildExportPack(opts: {
  ideaId: string;
  userId: string;
  toolId: string;
}): Promise<ExportPack> {
  const { ideaId, userId, toolId } = opts;

  const tool = findTool(toolId);
  if (!tool) {
    throw new Error(`Unknown export tool: ${toolId}.`);
  }

  // C5: user-scoped lookup — cross-user exports 404.
  const idea = await prisma.idea.findFirst({
    where: { id: ideaId, project: { userId } },
    include: {
      project: {
        select: {
          category: true,
          platform: true,
          stackLock: true,
          techDecisions: true,
        },
      },
    },
  });
  if (!idea) {
    throw new Error("Idea not found.");
  }
  if (idea.status !== "approved") {
    throw new Error("Approve this idea first.");
  }

  const documents = await prisma.document.findMany({ where: { ideaId } });
  if (documents.length === 0) {
    throw new Error(
      "No documents generated yet. Generate the docs first, then export."
    );
  }

  const docs: Record<string, string> = {};
  for (const d of documents) docs[d.kind] = d.content;

  const files = tool.build({
    ideaTitle: idea.title,
    pitch: idea.pitch,
    docs,
  });

  // Curated agent skills for the project's platform (cached, fail-soft —
  // the pack still builds when GitHub is unreachable).
  const skillsBundle = await buildSkillsBundle(idea.project.platform);
  Object.assign(files, skillsBundle.files);

  // Deterministic scaffold files — generated from the pack's own
  // documents, so every pack ships with them, no AI call, no download.
  files[".env.example"] = buildEnvExample(collectEnvVars(docs));
  const stackText = [
    idea.project.stackLock ?? "",
    idea.project.techDecisions ?? "",
  ].join(" ");
  files[".gitignore"] = buildGitignore(stackText);

  // Deterministic consistency report for the README: contradictions must
  // be visible in the pack, never silently shipped.
  let features: string[] = [];
  try {
    const parsed = JSON.parse(idea.features);
    if (Array.isArray(parsed)) features = parsed.map(String);
  } catch {
    // leave empty
  }
  const consistency = checkConsistency({
    docs: documents.map((d) => ({ kind: d.kind, content: d.content })),
    idea: {
      title: idea.title,
      pitch: idea.pitch,
      features,
      category: idea.project.category,
    },
    techDecisionsRaw: idea.project.techDecisions,
  });
  const applicableKindList = applicableKinds({
    title: idea.title,
    pitch: idea.pitch,
    features,
    category: idea.project.category,
  }).map((d) => d.label);
  const consistencySection =
    consistency.issues.length === 0
      ? "No contradictions detected across documents and locked decisions."
      : consistency.issues.map((i) => `- ${i.message}`).join("\n");

  // Design uploads with stored content (text exports: md/html). Screenshots
  // carry no stored bytes, so they are counted as skipped, not included.
  const uploads = await prisma.upload.findMany({
    where: { projectId: idea.projectId },
    select: { filename: true, content: true },
  });
  let includedUploads = 0;
  let skippedUploads = 0;
  for (const u of uploads) {
    if (!u.content) {
      skippedUploads++;
      continue;
    }
    const safe = u.filename
      .split("/")
      .filter((p) => p && p !== "." && p !== "..")
      .join("/");
    if (!safe || safe.length > 200) {
      skippedUploads++;
      continue;
    }
    files[`uploads/${safe}`] = u.content;
    includedUploads++;
  }

  const skillsLine =
    skillsBundle.included.length > 0
      ? `skills/ — ${skillsBundle.included.length} curated agent skill(s) from addyosmani/agent-skills${skillsBundle.note ? ` (${skillsBundle.note})` : ""}`
      : `(none) — ${skillsBundle.note ?? "no skills selected"}`;
  const uploadsLine =
    includedUploads > 0
      ? `uploads/ — ${includedUploads} design file(s)${skippedUploads > 0 ? `, ${skippedUploads} skipped (no stored content)` : ""}`
      : skippedUploads > 0
        ? `(none) — ${skippedUploads} upload(s) have no stored content to include`
        : "(none) — no design uploads yet";

  // Warn when the idea changed after docs were generated — those docs may
  // not reflect the current idea. Mirrors the stale check in
  // /api/export/preview (1s tolerance for clock skew).
  const labelByKind = new Map(DOC_KINDS.map((d) => [d.kind, d.label]));
  const staleDocs = documents.filter(
    (d) => idea.updatedAt.getTime() > d.updatedAt.getTime() + 1000
  );
  if (staleDocs.length > 0) {
    files["STALE_WARNING.txt"] =
      `WARNING: ${staleDocs.length} document(s) in this pack may be outdated.\n` +
      `The idea was updated after these documents were generated. Regenerate\n` +
      `them from the Docs page before handing this pack to a builder.\n\n` +
      `Stale documents:\n` +
      staleDocs
        .map(
          (d) =>
            `  - ${labelByKind.get(d.kind) ?? d.kind}` +
            ` (doc generated ${d.updatedAt.toISOString()},` +
            ` idea updated ${idea.updatedAt.toISOString()})`
        )
        .join("\n") +
      "\n";
  }

  // Always include a README explaining where to put the files
  files["README.txt"] = `${tool.name} export pack for "${idea.title}"
Generated by Ideas App.

HOW TO USE:
${tool.usage}

AGENT SKILLS:
${skillsLine}

DESIGN UPLOADS:
${uploadsLine}

DOC CONSISTENCY (checked from the documents themselves):
${consistencySection}

REQUIRED DOCUMENTS FOR THIS PROJECT:
${applicableKindList.map((l) => `  - ${l}`).join("\n")}

CONTENTS:
${Object.keys(files)
  .filter((f) => f !== "README.txt")
  .map((f) => `  - ${f}`)
  .join("\n")}`;

  const slug =
    idea.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "project";

  return { files, slug, ideaTitle: idea.title };
}
