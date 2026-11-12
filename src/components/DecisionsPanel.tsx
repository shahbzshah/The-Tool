"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  TECH_DECISION_DEFS,
  type DetectedDecision,
  type TechDecisionKey,
  type TechDecisions,
} from "@/lib/decisions";

/**
 * Locked Decisions panel (Docs page). One decision per key, recorded once
 * and injected into every doc generation prompt — so docs stop
 * contradicting each other. Detection (from the consistency check) shows
 * what the existing docs claim; when they disagree, the human picks the
 * winner here. Saving re-renders DECISIONS.md from the locked record.
 */
export default function DecisionsPanel({
  projectId,
  ideaId,
  techDecisions,
  detected,
  onTechDecisionsChange,
  onDocsUpdated,
}: {
  projectId: string;
  ideaId: string;
  techDecisions: TechDecisions;
  detected: DetectedDecision[];
  onTechDecisionsChange: (next: TechDecisions) => void;
  onDocsUpdated: (updated: Record<string, string>) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const def of TECH_DECISION_DEFS) {
      next[def.key] = techDecisions[def.key] ?? "";
    }
    setDraft(next);
  }, [techDecisions]);

  const lockedCount = TECH_DECISION_DEFS.filter(
    (d) => techDecisions[d.key]?.trim()
  ).length;

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const cleaned: TechDecisions = {};
      for (const def of TECH_DECISION_DEFS) {
        const v = (draft[def.key] ?? "").trim();
        if (v) cleaned[def.key] = v;
      }
      const res = await apiFetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ techDecisions: JSON.stringify(cleaned) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save decisions.");
      onTechDecisionsChange(cleaned);
      // Re-render DECISIONS.md deterministically from the new lock.
      const gen = await apiFetch("/api/docs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId, kind: "DECISIONS" }),
      });
      const genData = await gen.json();
      if (gen.ok && genData.doc?.content) {
        onDocsUpdated({ DECISIONS: genData.doc.content });
      }
      setMessage(
        "Decisions locked — every doc generated from now on will follow them. Regenerate or Align to fix existing docs."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card-paper p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="label-caps text-muted-foreground">
          02 // Locked Decisions
        </h2>
        <span className="pill border border-score-high/30 bg-score-high/10 text-score-high">
          {lockedCount}/{TECH_DECISION_DEFS.length} locked
        </span>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Decide once, here. These values are injected as hard rules into every
        generated doc, so the database, auth, speech, and sync choices can no
        longer disagree across documents. Detected values below come from what
        your current docs already say — when they disagree, pick the winner.
      </p>

      <div className="grid gap-3">
        {TECH_DECISION_DEFS.map((def) => {
          const det = detected.find((d) => d.key === def.key);
          const locked = !!techDecisions[def.key]?.trim();
          return (
            <div key={def.key} className="flex flex-col gap-1 rounded-md border border-border bg-muted/50 p-3">
              <label className="flex flex-col text-sm">
                <span className="font-medium text-foreground">
                  {def.label}
                  {locked && (
                    <span className="pill ml-2 border border-score-high/30 bg-score-high/10 text-score-high">
                      locked
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-muted-foreground">{def.hint}</span>
              </label>
              <input
                value={draft[def.key] ?? ""}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, [def.key]: e.target.value }))
                }
                placeholder={def.suggestions[0]}
                list={`decisions-${def.key}`}
                className="input-paper !h-10 !py-2"
              />
              <datalist id={`decisions-${def.key}`}>
                {def.suggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              {det && (
                <p className="text-xs text-muted-foreground">
                  Docs say:{" "}
                  {det.values.map((v) => (
                    <button
                      key={v}
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, [def.key]: v }))
                      }
                      className="mr-1 rounded-md border border-border bg-card px-2 py-0.5 font-mono text-[11px] text-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                    >
                      {v}
                    </button>
                  ))}
                  <span className="text-muted-foreground">
                    ({det.sources.join(", ")})
                  </span>
                  {det.conflict && (
                    <span className="ml-1 font-medium text-destructive">
                      — docs disagree, pick one
                    </span>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {message && <p className="mt-3 text-sm text-primary">{message}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="btn-primary !px-4 !py-2 !text-sm"
        >
          {saving ? "Saving…" : "Save decisions"}
        </button>
      </div>
    </div>
  );
}

export type { TechDecisionKey };
