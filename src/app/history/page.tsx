"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  averageScore,
  parseJsonField,
  type IdeaScores,
} from "@/lib/constants";
// --- Worker A (foundation): pipeline progress on history cards ---
// This block is the foundation's addition; the rename/duplicate/archive/
// delete/notes worker should build below it, not inside it.
import PipelineSteps from "@/components/PipelineSteps";
import {
  formatTokens,
  getPipelineProgress,
  type PipelineProgress,
} from "@/lib/pipeline";
// --- end foundation addition ---

type HistoryIdea = {
  id: string;
  title: string;
  pitch: string;
  scores: string | null;
  favorite: boolean;
  status: string;
  createdAt: string;
  // --- foundation: used by getPipelineProgress ---
  documents: { kind: string }[];
  // --- end foundation addition ---
};

type HistoryProject = {
  id: string;
  name: string;
  category: string;
  preferences: string | null;
  createdAt: string;
  ideas: HistoryIdea[];
  stitchPrompt: { id: string } | null;
  // --- foundation: used by getPipelineProgress + token display ---
  uploads: { id: string }[];
  aiTokens: number;
  // --- end foundation addition ---
  // --- Worker F: card management fields ---
  notes: string | null;
  archivedAt: string | null;
  // --- end Worker F addition ---
};

function scoreClass(avg: number): string {
  if (avg >= 7) return "text-score-high";
  if (avg >= 4) return "text-score-medium";
  return "text-score-low";
}

// --- Worker F: project card with inline rename, duplicate, archive,
// type-to-confirm delete, and an expandable notes area ---
function ProjectCard({
  project,
  onReload,
  onRemoved,
}: {
  project: HistoryProject;
  onReload: () => void;
  onRemoved: (id: string) => void;
}) {
  // --- foundation: per-card pipeline progress + token total ---
  const progress: PipelineProgress = getPipelineProgress(project);
  // --- end foundation addition ---

  const archived = project.archivedAt !== null;

  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(project.name);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState(project.notes ?? "");
  const [notesSaved, setNotesSaved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function patchProject(body: Record<string, unknown>) {
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Update failed");
  }

  async function saveName() {
    const name = nameDraft.trim();
    if (!name || name === project.name) {
      setRenaming(false);
      setNameDraft(project.name);
      return;
    }
    setBusy("rename");
    try {
      await patchProject({ name });
      onReload();
    } finally {
      setBusy(null);
      setRenaming(false);
    }
  }

  async function saveNotes() {
    setBusy("notes");
    try {
      await patchProject({ notes: notesDraft });
      setNotesSaved(true);
      onReload();
      window.setTimeout(() => setNotesSaved(false), 2500);
    } finally {
      setBusy(null);
    }
  }

  async function duplicate() {
    setBusy("duplicate");
    try {
      const res = await fetch(`/api/projects/${project.id}/duplicate`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Duplicate failed");
      onReload();
    } finally {
      setBusy(null);
    }
  }

  async function toggleArchive() {
    setBusy("archive");
    try {
      await patchProject({ archived: !archived });
      onReload();
    } finally {
      setBusy(null);
    }
  }

  async function confirmDelete() {
    if (deleteText !== project.name) return;
    setBusy("delete");
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      onRemoved(project.id);
    } finally {
      setBusy(null);
    }
  }

  const actionBtn =
    "btn-ghost !px-2.5 !py-1 !text-xs inline-flex items-center gap-1.5";

  return (
    <section className="card-paper p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="label-caps rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
              {project.stitchPrompt ? "Design" : "Refine"}
            </span>
            {archived && (
              <span className="label-caps rounded-full border border-border px-2.5 py-1 text-muted-foreground">
                Archived
              </span>
            )}
            {/* --- foundation: pipeline strip + AI tokens --- */}
            <span
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 font-mono text-[11px] text-muted-foreground"
              title="AI tokens used across refine and doc generation"
            >
              <span className="material-symbols text-[13px]">neurology</span>
              {formatTokens(project.aiTokens)}
            </span>
            {/* --- end foundation addition --- */}
          </div>
          {renaming ? (
            <input
              autoFocus
              className="input-paper !py-1.5 font-serif text-xl"
              value={nameDraft}
              disabled={busy === "rename"}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveName();
                if (e.key === "Escape") {
                  setRenaming(false);
                  setNameDraft(project.name);
                }
              }}
              onBlur={() => void saveName()}
            />
          ) : (
            <h2
              className="cursor-text font-serif text-xl text-foreground"
              title="Click to rename"
              onClick={() => {
                setNameDraft(project.name);
                setRenaming(true);
              }}
            >
              {project.name}
            </h2>
          )}
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {project.category} ·{" "}
            {new Date(project.createdAt).toLocaleDateString()}
          </p>
          {/* --- foundation: 5-step pipeline progress --- */}
          <div className="mt-2">
            <PipelineSteps steps={progress.steps} size="compact" />
          </div>
          {/* --- end foundation addition --- */}
        </div>
        <a
          href={`/api/projects/${project.id}/export`}
          className="btn-ghost !px-3 !py-1.5 !text-xs"
        >
          <span className="material-symbols text-[16px]">download</span>
          Download bundle
        </a>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          className={actionBtn}
          disabled={busy !== null}
          onClick={() => void duplicate()}
          title="Deep-copy this project (ideas, documents, uploads)"
        >
          <span className="material-symbols text-[15px]">content_copy</span>
          {busy === "duplicate" ? "Duplicating…" : "Duplicate"}
        </button>
        <button
          className={actionBtn}
          disabled={busy !== null}
          onClick={() => void toggleArchive()}
          title={archived ? "Restore to history" : "Hide from history"}
        >
          <span className="material-symbols text-[15px]">
            {archived ? "unarchive" : "archive"}
          </span>
          {busy === "archive"
            ? "…"
            : archived
              ? "Unarchive"
              : "Archive"}
        </button>
        <button
          className={actionBtn}
          disabled={busy !== null}
          onClick={() => setNotesOpen((v) => !v)}
          title="Project notes"
        >
          <span className="material-symbols text-[15px]">
            {project.notes ? "sticky_note_2" : "note_add"}
          </span>
          {project.notes ? "Notes" : "Add notes"}
        </button>
        <button
          className={actionBtn}
          disabled={busy !== null}
          onClick={() => {
            setDeleteText("");
            setConfirmingDelete((v) => !v);
          }}
          title="Delete this project"
        >
          <span className="material-symbols text-[15px]">delete</span>
          Delete
        </button>
      </div>

      {confirmingDelete && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-4">
          <p className="text-sm font-medium text-foreground">
            Delete &ldquo;{project.name}&rdquo; and everything in it?
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            This removes the project, its ideas, documents and uploads.
            Type the project name to confirm.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              className="input-paper !py-1.5 !text-sm"
              placeholder={project.name}
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void confirmDelete();
              }}
            />
            <button
              className="btn-ghost !px-3 !py-1.5 !text-xs"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </button>
            <button
              className="rounded-md border border-destructive/50 bg-destructive/15 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/25 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={deleteText !== project.name || busy === "delete"}
              onClick={() => void confirmDelete()}
            >
              {busy === "delete" ? "Deleting…" : "Delete project"}
            </button>
          </div>
        </div>
      )}

      {notesOpen && (
        <div className="mb-4 rounded-md border border-border/60 p-4">
          <label className="label-caps mb-2 block text-muted-foreground">
            Notes
          </label>
          <textarea
            className="input-paper min-h-24 w-full !text-sm"
            placeholder="Anything worth remembering about this project…"
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              className="btn-primary !px-3 !py-1.5 !text-xs"
              disabled={busy === "notes"}
              onClick={() => void saveNotes()}
            >
              {busy === "notes" ? "Saving…" : "Save notes"}
            </button>
            {notesSaved && (
              <span className="font-mono text-xs text-muted-foreground">
                Saved.
              </span>
            )}
          </div>
        </div>
      )}

      <ul className="divide-y divide-border/40">
        {project.ideas.map((idea) => {
          const scores = parseJsonField<IdeaScores>(idea.scores);
          const avg = averageScore(scores);
          const approved = idea.status === "approved";
          return (
            <li
              key={idea.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <div className="min-w-0 flex-1">
                <span className="mr-2 inline-flex align-middle">
                  <span
                    className={`material-symbols text-[18px] ${
                      idea.favorite ? "text-primary" : "text-muted-foreground"
                    }`}
                    title={idea.favorite ? "Favorite" : ""}
                  >
                    {idea.favorite ? "star" : "star_outline"}
                  </span>
                </span>
                <span className="font-medium text-foreground">
                  {idea.title}
                </span>
                {avg > 0 && (
                  <span className={`ml-2 font-mono text-xs ${scoreClass(avg)}`}>
                    {avg}/10
                  </span>
                )}
                <p className="mt-0.5 line-clamp-2 pl-7 text-sm text-muted-foreground">
                  {idea.pitch}
                </p>
              </div>
              {approved && (
                <div className="flex shrink-0 gap-2">
                  <Link
                    href={`/stitch/${project.id}`}
                    className="btn-ghost !px-2.5 !py-1 !font-mono !text-xs"
                  >
                    Design
                  </Link>
                  <Link
                    href={`/docs/${idea.id}`}
                    className="btn-ghost !px-2.5 !py-1 !font-mono !text-xs"
                  >
                    Docs
                  </Link>
                  <Link
                    href={`/export/${idea.id}`}
                    className="btn-ghost !px-2.5 !py-1 !font-mono !text-xs"
                  >
                    Export
                  </Link>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
// --- end Worker F addition ---

export default function HistoryPage() {
  const [projects, setProjects] = useState<HistoryProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  // --- Worker F: show/hide archived projects ---
  const [showArchived, setShowArchived] = useState(false);
  // --- end Worker F addition ---
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // --- Worker F: archived filter query param ---
    const url = showArchived ? "/api/projects?archived=1" : "/api/projects";
    // --- end Worker F addition ---
    try {
      const res = await fetch(url);
      const data = await res.json();
      setProjects(data.projects ?? []);
    } catch {
      setError("Failed to load projects.");
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = favoritesOnly
    ? projects
        .map((p) => ({ ...p, ideas: p.ideas.filter((i) => i.favorite) }))
        .filter((p) => p.ideas.length > 0)
    : projects;

  const totalIdeas = projects.reduce((sum, p) => sum + p.ideas.length, 0);

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-32 pt-10 md:px-8">
      <header className="mb-10 text-center">
        <h1 className="mb-3 font-serif text-4xl tracking-tight text-foreground">
          Project History
        </h1>
        <p className="font-mono text-sm text-muted-foreground">
          {loading
            ? "Loading…"
            : `${projects.length} generation run${projects.length === 1 ? "" : "s"} · ${totalIdeas} ideas`}
        </p>
      </header>

      {error && (
        <p className="mx-auto mb-6 max-w-xl rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
          {error}
        </p>
      )}

      {!loading && projects.length > 0 && (
        <div className="mb-6 flex items-center justify-center gap-2 text-center">
          <button
            onClick={() => setFavoritesOnly((v) => !v)}
            className={favoritesOnly ? "btn-primary !px-4 !py-2 !text-xs" : "btn-ghost !px-4 !py-2 !text-xs"}
          >
            <span className="material-symbols text-[16px]">
              {favoritesOnly ? "star" : "star_outline"}
            </span>
            Favorites only
          </button>
          {/* --- Worker F: archived toggle --- */}
          <button
            onClick={() => setShowArchived((v) => !v)}
            className={showArchived ? "btn-primary !px-4 !py-2 !text-xs" : "btn-ghost !px-4 !py-2 !text-xs"}
          >
            <span className="material-symbols text-[16px]">
              {showArchived ? "unarchive" : "archive"}
            </span>
            {showArchived ? "Hide archived" : "Show archived"}
          </button>
          {/* --- end Worker F addition --- */}
        </div>
      )}

      {loading && (
        <div className="mx-auto max-w-4xl space-y-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="card-paper p-6">
              <div className="mb-4 h-6 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {!loading && projects.length === 0 && (
        <div className="mx-auto max-w-2xl rounded-md border border-dashed border-border p-10 text-center">
          <span className="material-symbols mb-3 inline-block text-[32px] text-muted-foreground">
            history
          </span>
          <p className="text-sm text-muted-foreground">
            Nothing here yet — generate your first ideas on the home page.
          </p>
        </div>
      )}
      <div className="mx-auto max-w-4xl space-y-8">
        {/* --- Worker F: cards now render via ProjectCard --- */}
        {visible.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onReload={load}
            onRemoved={(id) =>
              setProjects((prev) => prev.filter((p) => p.id !== id))
            }
          />
        ))}
        {/* --- end Worker F addition --- */}
      </div>
    </main>
  );
}
