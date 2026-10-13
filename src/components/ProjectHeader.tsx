"use client";

import { formatTokens, type PipelineProgress } from "@/lib/pipeline";
import PipelineSteps from "@/components/PipelineSteps";

type ProjectHeaderProps = {
  projectName: string;
  progress: PipelineProgress;
  tokens: number;
};

/**
 * ProjectHeader — project name, the 5-step pipeline indicator
 * (Hunter → Refine → Design → Docs → Export, each step links to its page),
 * and the per-project AI token total.
 */
export default function ProjectHeader({
  projectName,
  progress,
  tokens,
}: ProjectHeaderProps) {
  return (
    <header className="border-b border-border pb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-serif text-2xl font-medium tracking-tight text-foreground">
          {projectName}
        </h1>
        <span
          className="inline-flex items-center gap-1.5 rounded border border-border bg-secondary/40 px-2.5 py-1 font-mono text-xs text-muted-foreground"
          title="AI tokens used across refine and doc generation"
        >
          <span className="material-symbols text-[15px]">neurology</span>
          {formatTokens(tokens)} tokens
        </span>
      </div>
      <PipelineSteps steps={progress.steps} size="full" />
    </header>
  );
}
