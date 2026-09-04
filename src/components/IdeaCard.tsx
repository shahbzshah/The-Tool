"use client";

import Link from "next/link";
import { useState } from "react";
import ValidationModal from "@/components/ValidationModal";
import {
  averageScore,
  parseJsonField,
  type IdeaScores,
  type IdeaValidation,
} from "@/lib/constants";

export type IdeaCardIdea = {
  id: string;
  projectId: string;
  title: string;
  pitch: string;
  features: string;
  targetAudience: string;
  monetization: string | null;
  scores?: string | null;
  validation?: string | null;
  favorite?: boolean;
  status: string;
};

function parseFeatures(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function ScoreBadge({ label, value }: { label: string; value: number }) {
  const tone =
    value >= 8
      ? "text-secondary-foreground bg-secondary"
      : value >= 6
        ? "text-accent-foreground bg-accent"
        : "text-muted-foreground bg-muted";
  return (
    <span
      title={`${label}: ${value}/10`}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] ${tone}`}
    >
      {label[0]}
      {value}
    </span>
  );
}

export default function IdeaCard({
  idea,
  onApprove,
  onToggleFavorite,
  onToggleCompare,
  selectedForCompare,
  onRemixed,
  busy,
}: {
  idea: IdeaCardIdea;
  onApprove: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onToggleCompare: (id: string) => void;
  selectedForCompare: boolean;
  onRemixed: (project: unknown) => void;
  busy: boolean;
}) {
  const [remixing, setRemixing] = useState(false);
  const [validating, setValidating] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  const features = parseFeatures(idea.features);
  const approved = idea.status === "approved";
  const scores = parseJsonField<IdeaScores>(idea.scores ?? null);
  const avg = averageScore(scores);
  const validation = parseJsonField<IdeaValidation>(idea.validation ?? null);

  async function remix() {
    setRemixing(true);
    setCardError(null);
    try {
      const res = await fetch(`/api/ideas/${idea.id}/remix`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Remix failed.");
      onRemixed(data.project);
    } catch (err) {
      setCardError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setRemixing(false);
    }
  }

  async function validate() {
    setValidating(true);
    setCardError(null);
    try {
      const res = await fetch(`/api/ideas/${idea.id}/validate`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Validation failed.");
      setShowValidation(true);
    } catch (err) {
      setCardError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setValidating(false);
    }
  }

  return (
    <div
      className={`card-shadow rounded-lg border bg-card p-6 transition-colors hover:border-input ${
        selectedForCompare ? "border-primary" : "border-border"
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <span
            className={`mb-2 inline-flex w-max items-center gap-1 rounded px-2 py-1 font-mono text-xs uppercase tracking-wider ${
              approved
                ? "bg-secondary text-secondary-foreground"
                : "bg-accent text-accent-foreground"
            }`}
          >
            {approved ? "Approved ✓" : "Idea"}
          </span>
          <h3 className="font-serif text-2xl leading-8 text-foreground">
            {idea.title}
          </h3>
          {scores && (
            <div className="mt-2 flex items-center gap-1.5">
              <ScoreBadge label="novelty" value={scores.novelty} />
              <ScoreBadge label="feasibility" value={scores.feasibility} />
              <ScoreBadge label="demand" value={scores.marketDemand} />
              <span className="ml-1 font-mono text-xs font-bold text-primary">
                avg {avg}/10
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => onToggleFavorite(idea.id)}
            aria-label={idea.favorite ? "Remove favorite" : "Add favorite"}
            title={idea.favorite ? "Remove favorite" : "Add to favorites"}
            className={`text-xl transition-transform hover:scale-110 active:scale-90 ${
              idea.favorite ? "text-primary" : "text-muted-foreground/40"
            }`}
          >
            {idea.favorite ? "★" : "☆"}
          </button>
          <label className="flex cursor-pointer flex-col items-center font-mono text-[10px] text-muted-foreground/60 hover:text-muted-foreground">
            <input
              type="checkbox"
              checked={selectedForCompare}
              onChange={() => onToggleCompare(idea.id)}
              className="h-3.5 w-3.5 accent-[var(--primary)]"
            />
            compare
          </label>
        </div>
      </div>

      <p className="mb-6 text-muted-foreground">{idea.pitch}</p>

      {features.length > 0 && (
        <div className="mb-6">
          <h4 className="mb-3 font-mono text-xs uppercase tracking-wider text-foreground">
            Core features
          </h4>
          <ul className="space-y-2">
            {features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-primary">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 border-t border-border/30 py-4 sm:grid-cols-2">
        <div>
          <span className="mb-1 block font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Audience
          </span>
          <span className="text-sm font-medium">{idea.targetAudience}</span>
        </div>
        {idea.monetization && (
          <div>
            <span className="mb-1 block font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Monetization
            </span>
            <span className="text-sm font-medium">{idea.monetization}</span>
          </div>
        )}
      </div>

      {approved ? (
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/stitch/${idea.projectId}`}
            className="flex items-center gap-2 rounded bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Stitch Prompt 🎨
          </Link>
          <Link
            href={`/docs/${idea.id}`}
            className="flex items-center gap-2 rounded border border-foreground px-4 py-2 font-medium text-foreground transition-colors hover:bg-muted"
          >
            Docs 📄
          </Link>
          <Link
            href={`/export/${idea.id}`}
            className="flex items-center gap-2 rounded bg-secondary px-4 py-2 font-medium text-secondary-foreground transition-colors hover:bg-secondary/90"
          >
            Export 🤖
          </Link>
          <ActionButtons
            remixing={remixing}
            validating={validating}
            hasValidation={!!validation}
            onRemix={remix}
            onValidate={validate}
          />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => onApprove(idea.id)}
            disabled={busy}
            className="rounded bg-primary px-6 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            I Like This!
          </button>
          <ActionButtons
            remixing={remixing}
            validating={validating}
            hasValidation={!!validation}
            onRemix={remix}
            onValidate={validate}
          />
        </div>
      )}

      {showValidation && validation && (
        <ValidationModal
          validation={validation}
          onClose={() => setShowValidation(false)}
        />
      )}
    </div>
  );
}

function ActionButtons({
  remixing,
  validating,
  hasValidation,
  onRemix,
  onValidate,
}: {
  remixing: boolean;
  validating: boolean;
  hasValidation: boolean;
  onRemix: () => void;
  onValidate: () => void;
}) {
  return (
    <>
      <button
        onClick={onRemix}
        disabled={remixing || validating}
        title="Generate 3 remix variations of this idea"
        className="rounded border border-border px-3 py-2 font-mono text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
      >
        {remixing ? "Remixing…" : "Remix 🔄"}
      </button>
      <button
        onClick={onValidate}
        disabled={remixing || validating}
        title="Stress-test this idea: competitors, risks, suggestions"
        className="rounded border border-border px-3 py-2 font-mono text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
      >
        {validating ? "Analyzing…" : hasValidation ? "Red Team 🔍 ✓" : "Red Team 🔍"}
      </button>
    </>
  );
}
