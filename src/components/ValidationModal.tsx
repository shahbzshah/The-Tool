"use client";

import type { IdeaValidation } from "@/lib/constants";

const VERDICT_STYLES: Record<string, string> = {
  strong: "bg-secondary text-secondary-foreground",
  promising: "bg-accent text-accent-foreground",
  risky: "bg-destructive/10 text-destructive border border-destructive/40",
};

export default function ValidationModal({
  validation,
  onClose,
}: {
  validation: IdeaValidation;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="card-shadow max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-2xl text-foreground">
            🔍 Red-Team Report
          </h2>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 font-mono text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <span
          className={`mb-4 inline-flex rounded px-2 py-1 font-mono text-xs uppercase tracking-wider ${
            VERDICT_STYLES[validation.verdict] ??
            "bg-muted text-muted-foreground"
          }`}
        >
          {validation.verdict}
        </span>
        <p className="mb-6 text-muted-foreground">{validation.summary}</p>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <section>
            <h3 className="mb-2 font-mono text-xs uppercase tracking-wider text-foreground">
              Strengths
            </h3>
            <ul className="space-y-2 text-sm">
              {(validation.strengths ?? []).map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-secondary">✓</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-2 font-mono text-xs uppercase tracking-wider text-foreground">
              Risks
            </h3>
            <ul className="space-y-2 text-sm">
              {(validation.risks ?? []).map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-destructive">⚠</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-2 font-mono text-xs uppercase tracking-wider text-foreground">
              Competitors
            </h3>
            <ul className="space-y-2 text-sm">
              {(validation.competitors ?? []).map((c, i) => (
                <li key={i}>
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground"> — {c.note}</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-2 font-mono text-xs uppercase tracking-wider text-foreground">
              Suggestions
            </h3>
            <ul className="space-y-2 text-sm">
              {(validation.suggestions ?? []).map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-primary">→</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}