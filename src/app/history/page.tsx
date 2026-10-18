"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  averageScore,
  parseJsonField,
  type IdeaScores,
} from "@/lib/constants";
import { apiFetch } from "@/lib/api";
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
  displayIdeas,
  onReload,
  onRemoved,
}: {
  project: HistoryProject;
  // Ideas to render in the list; defaults to all. Used by the search filter
  // so pipeline progress still counts every idea in the project.
  displayIdeas?: HistoryIdea[];
  onReload: () => void;
  onRemoved: (id: string) => void;
}) {
  // --- foundation: per-card pipeline progress + token total ---
  const progress: PipelineProgress = getPipelineProgress(project);
  // --- end foundation addition ---

  const archived = project.archivedAt !== null;
  const ideas = displayIdeas ?? project.ideas;

  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(project.name);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState(project.notes ?? "");
  const [notesSaved, setNotesSaved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);

  async function patchProject(body: Record<string, unknown>) {
    const res = await apiFetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401) return; // redirect already fired
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
    setCardError(null);
    try {
      await patchProject({ name });
      onReload();
    } catch {
      setCardError("Could not rename the project. Try again.");
    } finally {
      setBusy(null);
      setRenaming(false);
    }
  }

  async function saveNotes() {
    setBusy("notes");
    setCardError(null);
    try {
      await patchProject({ notes: notesDraft });
      setNotesSaved(true);
      onReload();
      window.setTimeout(() => setNotesSaved(false), 2500);
    } catch {
      setCardError("Could not save the notes. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function duplicate() {
    setBusy("duplicate");
    setCardError(null);
    try {
      const res = await apiFetch(`/api/projects/${project.id}/duplicate`, {
        method: "POST",
      });
      if (res.status === 401) return; // redirect already fired
      if (!res.ok) throw new Error("Duplicate failed");
      onReload();
    } catch {
      setCardError("Could not duplicate the project. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleArchive() {
    setBusy("archive");
    setCardError(null);
    try {
      await patchProject({ archived: !archived });
      onReload();
    } catch {
      setCardError("Could not update the archive status. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function confirmDelete() {
    if (deleteText !== project.name) return;
    setBusy("delete");
    setCardError(null);
    try {
      const res = await apiFetch(`/api/projects/${project.id}`, {
        method: "DELETE",
      });
      if (res.status === 401) return; // redirect already fired
      if (!res.ok) throw new Error("Delete failed");
      onRemoved(project.id);
    } catch {
      setCardError("Could not delete the project. Try again.");
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

      {cardError && (
        <p
          role="alert"
          className="mb-4 flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="material-symbols text-[16px]">error</span>
            {cardError}
          </span>
          <button
            onClick={() => setCardError(null)}
            aria-label="Dismiss error"
            className="shrink-0 text-destructive/70 transition-colors hover:text-destructive"
          >
            <span className="material-symbols text-[16px]">close</span>
          </button>
        </p>
      )}

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
        {ideas.map((idea) => {
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
                    href={`/stitch/${project.id}?idea=${idea.id}`}
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
  // Text search + pagination.
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  const loadPage = useCallback(
    async (p: number, append: boolean) => {
      const params = new URLSearchParams();
      // --- Worker F: archived filter query param ---
      if (showArchived) params.set("archived", "1");
      // --- end Worker F addition ---
      if (debouncedQuery) params.set("q", debouncedQuery);
      params.set("page", String(p));
      params.set("limit", "30");
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const res = await apiFetch(`/api/projects?${params}`);
        if (res.status === 401) return; // redirect already fired
        const data = await res.json();
        const fetched: HistoryProject[] = data.projects ?? [];
        setProjects((prev) =>
          append
            ? [
                ...prev,
                ...fetched.filter((p) => !prev.some((x) => x.id === p.id)),
              ]
            : fetched
        );
        setHasMore(data.hasMore ?? false);
        setPage(p);
      } catch {
        setError("Failed to load projects.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [showArchived, debouncedQuery]
  );

  const reload = useCallback(() => {
    void loadPage(1, false);
  }, [loadPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    void loadPage(page + 1, true);
  }, [hasMore, loadingMore, loading, loadPage, page]);

  // New search term or archived toggle resets to the first page.
  useEffect(() => {
    reload();
  }, [reload]);

  // Client-side idea narrowing for a search: when the query only matched an
  // idea's title/pitch, show just the matching ideas (name/category matches
  // keep all ideas). Pipeline progress still counts every idea.
  const queryLower = debouncedQuery.toLowerCase();
  const byQuery = debouncedQuery
    ? projects
        .map((p) => ({
          ...p,
          ideas: p.ideas.filter(
            (i) =>
              i.title.toLowerCase().includes(queryLower) ||
              i.pitch.toLowerCase().includes(queryLower)
          ),
        }))
        .filter(
          (p) =>
            p.name.toLowerCase().includes(queryLower) ||
            p.category.toLowerCase().includes(queryLower) ||
            p.ideas.length > 0
        )
    : projects;

  const visible = favoritesOnly
    ? byQuery
        .map((p) => ({ ...p, ideas: p.ideas.filter((i) => i.favorite) }))
        .filter((p) => p.ideas.length > 0)
    : byQuery;

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
            : `${projects.length} generation run${projects.length === 1 ? "" : "s"} · ${totalIdeas} idea${totalIdeas === 1 ? "" : "s"}${hasMore ? "+" : ""}`}
        </p>
      </header>

      {error && (
        <p className="mx-auto mb-6 max-w-xl rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Text search across project name/category and idea title/pitch. */}
      {!loading && (
        <div className="mx-auto mb-6 max-w-xl">
          <div className="relative">
            <span className="material-symbols pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-muted-foreground">
              search
            </span>
            <input
              className="input-paper w-full !pl-10"
              placeholder="Search projects and ideas…"
              aria-label="Search projects and ideas"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="material-symbols text-[20px]">close</span>
              </button>
            )}
          </div>
        </div>
      )}

      {!loading && (projects.length > 0 || debouncedQuery) && (
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
            {debouncedQuery
              ? `No results for “${debouncedQuery}”. Try a different search.`
              : "Nothing here yet — generate your first ideas on the home page."}
          </p>
        </div>
      )}
      <div className="mx-auto max-w-4xl space-y-8">
        {/* --- Worker F: cards now render via ProjectCard --- */}
        {visible.map((project) => (
          <ProjectCard
            key={project.id}
            project={projects.find((p) => p.id === project.id) ?? project}
            displayIdeas={project.ideas}
            onReload={reload}
            onRemoved={(id) =>
              setProjects((prev) => prev.filter((p) => p.id !== id))
            }
          />
        ))}
        {/* --- end Worker F addition --- */}
      </div>

      {hasMore && !loading && (
        <div className="mx-auto mt-10 max-w-4xl text-center">
          <button
            className="btn-ghost !px-5 !py-2 !text-sm"
            disabled={loadingMore}
            onClick={loadMore}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </main>
  );
}
