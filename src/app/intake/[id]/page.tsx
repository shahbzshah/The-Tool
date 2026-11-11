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

  const inputCls = "input-paper";
  const textareaCls =
    "input-paper !h-auto min-h-[110px] resize-none py-3 leading-relaxed";

  if (loadError) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8 md:py-12">
        <div className="card-paper space-y-4 p-6 md:p-8">
          <p className="label-caps text-primary">Intake</p>
          <p className="font-serif text-xl text-foreground">{loadError}</p>
          <Link href="/" className="btn-secondary inline-flex">
            <span className="material-symbols text-[18px]">arrow_back</span>
            Back home
          </Link>
        </div>
      </main>
    );
  }
  if (!job) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8 md:py-12">
        <div className="card-paper flex items-center gap-3 p-6 md:p-8">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </main>
    );
  }

  const locked = job.status === "researching" || job.status === "done";
  const canResearch = job.status === "awaiting_confirm" || job.status === "failed";
  const statusPill =
    job.status === "done"
      ? "border border-score-high/30 bg-score-high/10 text-score-high"
      : job.status === "researching"
        ? "border border-primary/30 bg-primary/10 text-primary"
        : job.status === "failed"
          ? "border border-destructive/30 bg-destructive/10 text-destructive"
          : "border border-score-medium/30 bg-score-medium/10 text-score-medium";

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-6 md:py-10">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="material-symbols text-[18px]">arrow_back</span>
          Home
        </Link>
        <span className="pill border border-border bg-muted text-muted-foreground">
          {SOURCE_LABEL[job.source] ?? job.source}
        </span>
      </div>

      <header className="border-b border-border pb-5">
        <p className="label-caps text-primary">Intake // Confirmation gate</p>
        <h1 className="mt-1 font-serif text-3xl font-medium tracking-tight text-foreground">
          Confirm the topic
        </h1>
        <p className="mt-1 max-w-xl text-[0.9375rem] leading-relaxed text-muted-foreground">
          Check what the engine understood, fix anything wrong, then confirm.
          Research only runs on what you approve here.
        </p>
      </header>

      {job.thumbnail && (
        <img
          src={job.thumbnail}
          alt="Uploaded media or imported thumbnail"
          className="max-h-72 w-full rounded-md border border-border bg-muted object-contain"
        />
      )}
      {job.linkUrl && (
        <p className="flex items-center gap-2 truncate font-mono text-xs text-muted-foreground">
          <span className="material-symbols shrink-0 text-[16px] text-primary">link</span>
          <a href={job.linkUrl} target="_blank" rel="noreferrer" className="truncate text-primary underline underline-offset-2">
            {job.linkUrl}
          </a>
        </p>
      )}

      {job.draft.needs_user_help && job.status === "awaiting_confirm" && (
        <div className="rounded-md border border-score-medium/40 bg-score-medium/10 px-4 py-4">
          <p className="label-caps flex items-center gap-1.5 text-score-medium">
            <span className="material-symbols text-[16px]">warning</span>
            Needs your call
          </p>
          <p className="mt-2 font-serif text-lg leading-snug text-foreground">
            {job.draft.help_question ?? "What is this about, in one line?"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {job.draft.visual_failed
              ? "The visual read didn't come through — help it along."
              : "Not sure about this one — your call."}
          </p>
        </div>
      )}

      {job.draft.confidence != null && (
        <div className="card-paper flex items-center justify-between gap-4 px-4 py-3">
          <p className="label-caps text-muted-foreground">Read confidence</p>
          <p className="flex items-baseline gap-2">
            <span
              className={`font-mono text-xl font-semibold ${
                job.draft.confidence < 0.55 ? "text-score-medium" : "text-score-high"
              }`}
            >
              {Math.round(job.draft.confidence * 100)}%
            </span>
            {job.draft.confidence < 0.55 && (
              <span className="text-xs text-score-medium">
                Below the gate — it asked instead of guessing.
              </span>
            )}
          </p>
        </div>
      )}

      <div className="card-paper flex flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
          <p className="label-caps text-muted-foreground">Draft fields</p>
          <span className={`pill ${statusPill}`}>
            {job.status.replace(/_/g, " ").toUpperCase()}
          </span>
        </div>
        <label className="block">
          <span className="label-caps mb-1.5 block text-muted-foreground">
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
          <span className="label-caps mb-1.5 block text-muted-foreground">
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
            className={textareaCls}
          />
        </label>
        <label className="block">
          <span className="label-caps mb-1.5 block text-muted-foreground">
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
          <span className="label-caps mb-1.5 block text-muted-foreground">
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
          <div className="border-t border-border pt-4">
            <p className="label-caps mb-1.5 text-muted-foreground">
              Words seen in the media
            </p>
            <p className="font-mono text-[13px] leading-relaxed text-foreground">
              {job.draft.visible_text.join(" · ")}
            </p>
          </div>
        )}
        {job.draft.motion_summary && (
          <div className="border-t border-border pt-4">
            <p className="label-caps mb-1.5 text-muted-foreground">
              What moves in the video
            </p>
            <p className="text-sm leading-relaxed text-foreground">{job.draft.motion_summary}</p>
          </div>
        )}
      </div>

      {actionError && (
        <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm leading-relaxed text-destructive">
          <span className="material-symbols mt-0.5 shrink-0 text-[18px]">error</span>
          {actionError}
        </p>
      )}
      {job.error && job.status === "failed" && (
        <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm leading-relaxed text-destructive">
          <span className="material-symbols mt-0.5 shrink-0 text-[18px]">error</span>
          Research failed: {job.error}
        </p>
      )}

      {researching ? (
        <div className="card-paper flex items-center gap-3 px-4 py-3">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" />
          <p className="text-sm text-muted-foreground">
            Researching the Play Store — this takes a minute or two. This page
            updates on its own.
          </p>
        </div>
      ) : (
        canResearch && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={runResearch}
              disabled={saving || !topic.trim() || !keywordsText.trim()}
              className="btn-primary min-h-[48px] w-full"
            >
              {saving ? "Saving…" : "Confirm and research"}
            </button>
            {dirty && (
              <button
                type="button"
                onClick={saveEdits}
                disabled={saving}
                className="btn-secondary min-h-[44px] w-full"
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
          className="btn-primary min-h-[48px] w-full"
        >
          See the researched opportunity
          <span className="material-symbols text-[18px]">arrow_forward</span>
        </Link>
      )}

      <button
        type="button"
        onClick={() => setShowDelete(true)}
        className="text-sm text-destructive/80 underline underline-offset-2 transition-colors hover:text-destructive"
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
