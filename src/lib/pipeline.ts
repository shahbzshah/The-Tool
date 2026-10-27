import { DOC_KINDS, applicableKinds, type IdeaLike } from "@/lib/constants";
import { getProjectTokenTotal } from "@/lib/usage";

export type PipelineStepKey = "hunter" | "refine" | "design" | "docs" | "export";

export type PipelineStep = {
  key: PipelineStepKey;
  label: string;
  href: string;
  done: boolean;
  detail?: string;
};

export type PipelineProgress = {
  steps: PipelineStep[];
  doneCount: number;
};

/** Minimal project shape needed to derive pipeline progress. */
export type PipelineProjectInput = {
  id: string;
  category?: string;
  ideas: Array<{
    id: string;
    title?: string;
    pitch?: string;
    features?: string | string[] | null;
    documents: Array<{ kind: string }>;
  }>;
  uploads: Array<{ id: string }>;
};

const STEP_LABELS: Record<PipelineStepKey, string> = {
  hunter: "Hunter",
  refine: "Refine",
  design: "Design",
  docs: "Docs",
  export: "Export",
};

/**
 * Derives per-step pipeline progress from real project data:
 * - Hunter: reached as soon as the project exists (it was created by Hunter).
 * - Refine: done when an idea has a saved REFINED_BRIEF document.
 * - Design: done when the project has at least one design upload.
 * - Docs: done when the primary idea has all applicable DOC_KINDS documents
 *   (core kinds plus voice/sync specs when the idea needs them).
 * - Export: no server-side export record exists, so this is always pending
 *   (done=false) and links to the export page.
 */
export function getPipelineProgress(project: PipelineProjectInput): PipelineProgress {
  const firstIdea = project.ideas[0] ?? null;
  const firstIdeaId = firstIdea?.id ?? "";

  const refineDone = project.ideas.some((idea) =>
    idea.documents.some((d) => d.kind === "REFINED_BRIEF")
  );

  const designDone = project.uploads.length > 0;

  const docsCount = firstIdea ? firstIdea.documents.length : 0;
  // Docs are done when every kind that applies to this idea exists.
  // When the caller has no idea text (history list), only core kinds gate.
  const requiredKinds =
    firstIdea?.title || firstIdea?.pitch
      ? applicableKinds({
          title: firstIdea?.title,
          pitch: firstIdea?.pitch,
          features: firstIdea?.features ?? null,
          category: project.category,
        } satisfies IdeaLike)
      : DOC_KINDS.filter((d) => !d.conditional);
  const presentKinds = new Set(
    firstIdea ? firstIdea.documents.map((d) => d.kind) : []
  );
  const docsDone =
    firstIdea !== null &&
    requiredKinds.every((d) => presentKinds.has(d.kind));

  const steps: PipelineStep[] = [
    {
      key: "hunter",
      label: STEP_LABELS.hunter,
      href: "/",
      done: true,
    },
    {
      key: "refine",
      label: STEP_LABELS.refine,
      href: firstIdeaId
        ? `/refine/${project.id}?idea=${firstIdeaId}`
        : `/refine/${project.id}`,
      done: refineDone,
    },
    {
      key: "design",
      label: STEP_LABELS.design,
      href: `/stitch/${project.id}`,
      done: designDone,
    },
    {
      key: "docs",
      label: STEP_LABELS.docs,
      href: firstIdeaId ? `/docs/${firstIdeaId}` : "#",
      done: docsDone,
      detail: `${docsCount}/${requiredKinds.length}`,
    },
    {
      key: "export",
      label: STEP_LABELS.export,
      href: firstIdeaId ? `/export/${firstIdeaId}` : "#",
      done: false,
    },
  ];

  return { steps, doneCount: steps.filter((s) => s.done).length };
}

/** Per-project AI token total (sum of all logged AiUsage rows). */
export async function getProjectTokens(projectId: string): Promise<number> {
  return getProjectTokenTotal(projectId);
}

/** Human-readable token count, e.g. 12.4k. */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
