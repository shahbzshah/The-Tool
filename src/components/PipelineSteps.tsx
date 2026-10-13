"use client";

import Link from "next/link";
import type { PipelineStep } from "@/lib/pipeline";

type PipelineStepsProps = {
  steps: PipelineStep[];
  /** "full" renders labeled pills; "compact" renders small linked dots/labels. */
  size?: "full" | "compact";
};

/**
 * PipelineSteps — the 5-step Hunter → Refine → Design → Docs → Export
 * indicator. Each step links to its page. Pure presentational; derive the
 * steps with getPipelineProgress() from "@/lib/pipeline".
 */
export default function PipelineSteps({ steps, size = "full" }: PipelineStepsProps) {
  if (size === "compact") {
    return (
      <nav aria-label="Pipeline progress" className="flex items-center gap-1">
        {steps.map((step, i) => (
          <span key={step.key} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden className="text-border">·</span>}
            <Link
              href={step.href}
              title={step.detail ? `${step.label}: ${step.detail}` : step.label}
              className={`inline-flex items-center gap-1 font-mono text-[11px] transition-colors ${
                step.done
                  ? "font-semibold text-score-high hover:underline"
                  : "text-muted-foreground/70 hover:text-foreground"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  step.done ? "bg-score-high" : "bg-muted-foreground/30"
                }`}
              />
              {step.label}
              {step.detail && (
                <span className="opacity-70">({step.detail})</span>
              )}
            </Link>
          </span>
        ))}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Pipeline progress"
      className="mt-3 flex flex-wrap items-center gap-1.5"
    >
      {steps.map((step, i) => (
        <span key={step.key} className="flex items-center gap-1.5">
          {i > 0 && (
            <span
              aria-hidden
              className={`mx-0.5 h-px w-4 ${
                step.done ? "bg-score-high/60" : "bg-border"
              }`}
            />
          )}
          <Link
            href={step.href}
            title={step.detail ? `${step.label}: ${step.detail}` : step.label}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-xs transition-colors ${
              step.done
                ? "border-score-high/30 bg-score-high/10 text-score-high hover:bg-score-high/20"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="material-symbols text-[14px]">
              {step.done ? "check_circle" : "radio_button_unchecked"}
            </span>
            {step.label}
            {step.detail && <span className="opacity-70">{step.detail}</span>}
          </Link>
        </span>
      ))}
    </nav>
  );
}
