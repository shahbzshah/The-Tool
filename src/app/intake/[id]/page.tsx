"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";

/**
 * Intake job page (plan §2 step 4, §7): the confirmation gate.
 * Research never runs on an unseen draft — the user edits the topic,
 * keywords and audience here, then confirms. Low-confidence drafts open
 * with the help question instead of a topic.
 */

type Draft = {
  topic: string;
  app_concept: string | null;
  audience: string | null;
  visible_text: string[];
  objects_and_actions: string[];
  keywords: string[];
  confidence: number | null;
  needs_user_help: boolean;
  help_question: string | null;
  motion_summary: string | null;
  visual_failed: boolean;
};

type Job = {
  id: string;
  source: string;
  status: string;
  originalName: string | null;
  linkUrl: string | null;
  thumbnail: string | null;
  draft: Draft;
  opportunityId: string | null;
  error: string | null;
};

const SOURCE_LABEL: Record<string, string> = {
  upload: "Uploaded media",
  link: "Pasted link",
  "own-idea": "Your own idea",
};

export default function IntakeJobPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [researching, setResearching] = useState(false);
  const [actionError, setActionError] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  // Editable draft fields.
  const [topic, setTopic] = useState("");
  const [appConcept, setAppConcept] = useState("");
  const [audience, setAudience] = useState("");
  const [keywordsText, setKeywordsText] = useState("");
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/intake/${params.id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoadError(data.error ?? "Job not found.");
      return;
    }
    const j = data.job as Job;
    setJob(j);
    if (!dirty) {
      setTopic(j.draft.topic);
      setAppConcept(j.draft.app_concept ?? "");
      setAudience(j.draft.audience && j.draft.audience.toLowerCase() !== "null" ? j.draft.audience : "");
      setKeywordsText(j.draft.keywords.join(", "));
    }
    if (j.status === "researching") setResearching(true);
    else setResearching(false);
  }, [params.id, dirty]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll every 2s while researching (plan §7), stop on done/failed.
  useEffect(() => {
    if (!researching) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [researching, load]);

  async function saveEdits(): Promise<boolean> {
    setActionError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/intake/${params.id}/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          app_concept: appConcept,
          audience,
          keywords: keywordsText.split(",").map((k) => k.trim()).filter(Boolean),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't save edits.");
      setDirty(false);
      setJob(data.job as Job);
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't save edits.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function runResearch() {
    setActionError("");
    if (dirty) {
      const ok = await saveEdits();
      if (!ok) return;
    }
    setResearching(true);
    try {
      const res = await fetch(`/api/intake/${params.id}/research`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? data.job?.error ?? "Research failed.");
      setJob(data.job as Job);
      if (data.opportunityId) router.push(`/hunter/opportunities/${data.opportunityId}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Research failed. Try again.");
      setResearching(false);
      load();
    }
  }

  async function deleteJob() {
    setShowDelete(false);
    await fetch(`/api/intake/${params.id}`, { method: "DELETE" });
    router.push("/");
  }

  const inputCls =
    "w-full rounded border border-input bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40";

  if (loadError) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-muted-foreground">{loadError}</p>
        <Link href="/" className="mt-4 inline-block text-sm text-primary underline">
          Back home
        </Link>
      </main>
    );
  }
  if (!job) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  const locked = job.status === "researching" || job.status === "done";
  const canResearch = job.status === "awaiting_confirm" || job.status === "failed";

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-muted-foreground underline">
          ← Home
        </Link>
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {SOURCE_LABEL[job.source] ?? job.source}
        </span>
      </div>

      <h1 className="font-serif text-2xl font-medium tracking-tight text-foreground">
        Confirm the topic
      </h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Check what the engine understood, fix anything wrong, then confirm.
        Research only runs on what you approve here.
      </p>

      {job.thumbnail && (
        <img
          src={job.thumbnail}
          alt="Uploaded media or imported thumbnail"
          className="w-full max-h-72 rounded border border-border object-contain bg-muted"
        />
      )}
      {job.linkUrl && (
        <p className="truncate text-sm text-muted-foreground">
          From:{" "}
          <a href={job.linkUrl} target="_blank" rel="noreferrer" className="text-primary underline">
            {job.linkUrl}
          </a>
        </p>
      )}

      {job.draft.needs_user_help && job.status === "awaiting_confirm" && (
        <div className="rounded border border-score-medium/30 bg-score-medium/10 px-4 py-3">
          <p className="text-sm font-semibold text-score-medium">
            {job.draft.visual_failed
              ? "The visual read didn't come through — help it along:"
              : "Not sure about this one — your call:"}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">
            {job.draft.help_question ?? "What is this about, in one line?"}
          </p>
        </div>
      )}

      {job.draft.confidence != null && (
        <p className="font-mono text-xs text-muted-foreground">
          Read confidence: {Math.round(job.draft.confidence * 100)}%
          {job.draft.confidence < 0.55 && " — below the gate, so it asked instead of guessing."}
        </p>
      )}

      <div className="card-paper flex flex-col gap-4 p-4">
        <label className="block">
          <span className="mb-1 block font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Topic
          </span>
          <input
            value={topic}
            onChange={(e) => {
              setTopic(e.target.value);
              setDirty(true);
            }}
            disabled={locked}
            placeholder="What is this about, in one sentence?"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            App idea
          </span>
          <textarea
            value={appConcept}
            onChange={(e) => {
              setAppConcept(e.target.value);
              setDirty(true);
            }}
            disabled={locked}
            placeholder="The app someone might build from this (optional)"
            rows={3}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Who it is for
          </span>
          <input
            value={audience}
            onChange={(e) => {
              setAudience(e.target.value);
              setDirty(true);
            }}
            disabled={locked}
            placeholder="Audience (optional)"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Play Store keywords (comma-separated, max 5)
          </span>
          <input
            value={keywordsText}
            onChange={(e) => {
              setKeywordsText(e.target.value);
              setDirty(true);
            }}
            disabled={locked}
            placeholder="e.g. water reminder, hydration tracker"
            className={inputCls}
          />
        </label>

        {job.draft.visible_text.length > 0 && (
          <div>
            <p className="mb-1 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Words seen in the media
            </p>
            <p className="text-sm leading-relaxed text-foreground">
              {job.draft.visible_text.join(" · ")}
            </p>
          </div>
        )}
        {job.draft.motion_summary && (
          <div>
            <p className="mb-1 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              What moves in the video
            </p>
            <p className="text-sm leading-relaxed text-foreground">{job.draft.motion_summary}</p>
          </div>
        )}
      </div>

      {actionError && (
        <p className="rounded border border-score-low/30 bg-score-low/10 px-3 py-2 text-sm leading-relaxed text-score-low">
          {actionError}
        </p>
      )}
      {job.error && job.status === "failed" && (
        <p className="rounded border border-score-low/30 bg-score-low/10 px-3 py-2 text-sm leading-relaxed text-score-low">
          Research failed: {job.error}
        </p>
      )}

      {researching ? (
        <p className="rounded border border-border bg-muted px-4 py-3 text-center text-sm text-muted-foreground">
          Researching the Play Store — this takes a minute or two. This page
          updates on its own.
        </p>
      ) : (
        canResearch && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={runResearch}
              disabled={saving || !topic.trim() || !keywordsText.trim()}
              className="rounded bg-primary px-4 py-3 font-mono text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Saving…" : "Confirm and research"}
            </button>
            {dirty && (
              <button
                type="button"
                onClick={saveEdits}
                disabled={saving}
                className="rounded border border-border px-4 py-2.5 font-mono text-sm text-foreground disabled:opacity-50"
              >
                Save edits only
              </button>
            )}
            {(!topic.trim() || !keywordsText.trim()) && (
              <p className="text-center text-xs text-muted-foreground">
                Add a topic and at least one keyword to unlock research.
              </p>
            )}
          </div>
        )
      )}

      {job.status === "done" && job.opportunityId && (
        <Link
          href={`/hunter/opportunities/${job.opportunityId}`}
          className="block rounded bg-primary px-4 py-3 text-center font-mono text-sm font-bold text-primary-foreground"
        >
          See the researched opportunity →
        </Link>
      )}

      <button
        type="button"
        onClick={() => setShowDelete(true)}
        className="text-sm text-muted-foreground underline"
      >
        Delete this job
      </button>
      {showDelete && (
        <ConfirmDialog
          title="Delete this job?"
          message="The draft and any stored media go with it. A finished opportunity, if one exists, stays."
          confirmLabel="Delete job"
          onConfirm={deleteJob}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </main>
  );
}
