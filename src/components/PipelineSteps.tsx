"use client";

import Link from "next/link";
import type { PipelineStep } from "@/lib/pipeline";

type PipelineStepsProps = {
  steps: PipelineStep[];
  /** "full" renders larger labeled pills; "compact" renders small pills. */
  size?: "full" | "compact";
};

/**
 * PipelineSteps — the 5-step Hunter → Refine → Design → Docs → Export
 * indicator, restyled to the Telemetry OS ledger pills: numbered mono
 * pills, done steps carry a green check, the current step is solid rust
 * with an "Active" tag, later steps are muted. Each step links to its
 * page. Pure presentational; derive the steps with getPipelineProgress()
 * from "@/lib/pipeline".
 */
export default function PipelineSteps({ steps, size = "full" }: PipelineStepsProps) {
  // The current step is the first one not yet done; when every step is
  // done, the last step reads as the active one.
  const currentIdx = (() => {
    const i = steps.findIndex((s) => !s.done);
    return i === -1 ? steps.length - 1 : i;
  })();

  const pill =
    size === "compact"
      ? "px-2 py-1 text-[11px]"
      : "px-3 py-1.5 text-xs";

  return (
    <nav
      aria-label="Pipeline progress"
      className="flex flex-wrap items-center gap-1.5"
    >
      {steps.map((step, i) => {
        const state =
          i === currentIdx ? "current" : step.done ? "done" : "todo";
        return (
          <Link
            key={step.key}
            href={step.href}
            title={step.detail ? `${step.label}: ${step.detail}` : step.label}
            className={`inline-flex items-center gap-1.5 rounded-md border font-mono font-medium uppercase tracking-[0.08em] transition-colors ${pill} ${
              state === "current"
                ? "border-primary-hover bg-primary text-primary-foreground"
                : state === "done"
                  ? "border-border bg-muted text-muted-foreground hover:text-foreground"
                  : "border-border bg-card text-muted-foreground/70 hover:text-foreground"
            }`}
          >
            {state === "done" && (
              <span
                className="material-symbols text-[13px] leading-none text-score-high"
                aria-hidden
              >
                check
              </span>
            )}
            <span>{i + 1}</span>
            <span>{step.label}</span>
            {state === "current" && <span>Active</span>}
            {step.detail && (
              <span className="normal-case tracking-normal opacity-70">
                {step.detail}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
