"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import UploadPanel, { type UploadItem } from "@/components/UploadPanel";
import { DOC_KINDS, type DocKindDef } from "@/lib/constants";
import { timeAgo } from "@/lib/hunter/ui";
import {
  apiFetch,
  consumeSavedState,
  locationKey,
} from "@/lib/api";
import { useEscapeClose } from "@/lib/shortcuts";

type Idea = {
  id: string;
  projectId: string;
  title: string;
  status: string;
  updatedAt?: string;
  project: { id: string; category: string };
};

// ---------------------------------------------------------------------------
// DocHistoryMenu — foundation addition (version history UI).
// Isolated component: the later search/word-count/print/stale-badge/retry
// worker should add its controls next to this, not inside it.
// ---------------------------------------------------------------------------

type DocVersion = {
  id: string;
  version: number;
  createdAt: string;
};

function DocHistoryMenu({
  docId,
  kindLabel,
  onRestored,
}: {
  docId: string;
  kindLabel: string;
  onRestored: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<DocVersion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  // Version contents are fetched on demand — the versions list intentionally
  // omits them. Cached by version id so re-opening a preview is instant.
  const [previewContents, setPreviewContents] = useState<Record<string, string>>(
    {}
  );
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);

  // Esc closes the history dropdown.
  useEscapeClose(() => {
    setOpen(false);
    setPreviewId(null);
  });

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && versions === null && !loading) {
      setLoading(true);
      setMenuError(null);
      try {
        const res = await apiFetch(`/api/docs/${docId}/versions`);
        if (res.status === 401) return; // redirect already fired
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load history.");
        setVersions(data.versions ?? []);
      } catch (err) {
        setMenuError(err instanceof Error ? err.message : "Failed to load history.");
      } finally {
        setLoading(false);
      }
    }
  }

  async function openPreview(versionId: string) {
    if (previewId === versionId) {
      setPreviewId(null);
      return;
    }
    setPreviewId(versionId);
    if (previewContents[versionId] != null || previewLoadingId === versionId) {
      return;
    }
    setPreviewLoadingId(versionId);
    setMenuError(null);
    try {
      const res = await apiFetch(`/api/docs/${docId}/versions/${versionId}`);
      if (res.status === 401) return; // redirect already fired
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load preview.");
      setPreviewContents((prev) => ({
        ...prev,
        [versionId]: data.version?.content ?? "",
      }));
    } catch (err) {
      setMenuError(
        err instanceof Error ? err.message : "Failed to load preview."
      );
    } finally {
      setPreviewLoadingId(null);
    }
  }

  async function restore(versionId: string) {
    if (restoring) return;
    setRestoring(versionId);
    setMenuError(null);
    try {
      const res = await apiFetch(`/api/docs/${docId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      if (res.status === 401) return; // redirect already fired
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Restore failed.");
      setVersions(null); // refetch next open — restore snapshot a new version
      setPreviewId(null);
      setOpen(false);
      onRestored();
    } catch (err) {
      setMenuError(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={toggle}
        title="Version history"
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:min-h-0"
      >
        <span className="material-symbols text-[16px]">history</span>
        <span>History</span>
        {versions !== null && versions.length > 0 && (
          <span className="rounded-full bg-secondary px-1.5 font-mono text-[10px]">
            {versions.length}
          </span>
        )}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setOpen(false);
              setPreviewId(null);
            }}
          />
          <div className="card-elevated absolute right-0 z-50 mt-2 w-80 max-w-[90vw] overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <p className="label-caps text-muted-foreground">Version history</p>
              <p className="mt-0.5 truncate text-sm font-medium" title={kindLabel}>
                {kindLabel}
              </p>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {loading && (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Loading…
                </p>
              )}
              {menuError && (
                <p className="px-4 py-3 text-sm text-destructive">{menuError}</p>
              )}
              {!loading && versions !== null && versions.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No earlier versions — they appear here each time this doc is
                  regenerated.
                </p>
              )}
              {(versions ?? []).map((v) => (
                <div key={v.id} className="border-b border-border/50 px-4 py-2.5 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => openPreview(v.id)}
                      className="text-left"
                    >
                      <span className="font-mono text-xs font-semibold text-foreground">
                        v{v.version}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {new Date(v.createdAt).toLocaleString()}
                      </span>
                    </button>
                    <button
                      onClick={() => restore(v.id)}
                      disabled={restoring !== null}
                      className="rounded border border-border px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                      {restoring === v.id ? "Restoring…" : "Restore"}
                    </button>
                  </div>
                  {previewId === v.id &&
                    (previewLoadingId === v.id ? (
                      <p className="mt-2 py-3 text-center font-mono text-[11px] text-muted-foreground">
                        Loading preview…
                      </p>
                    ) : (
                      previewContents[v.id] != null && (
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-foreground/80">
                          {previewContents[v.id]}
                        </pre>
                      )
                    ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// --- end foundation version-history addition ---

export default function DocsPage() {
  const params = useParams<{ ideaId: string }>();
  const ideaId = params.ideaId;

  const [idea, setIdea] = useState<Idea | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [docs, setDocs] = useState<Record<string, string>>({});
  const [docsMeta, setDocsMeta] = useState<Record<string, string>>({});
  const [activeKind, setActiveKind] = useState<string>(DOC_KINDS[0].kind);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [genState, setGenState] = useState<{
    running: boolean;
    current: number;
    total: number;
    label: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docIds, setDocIds] = useState<Record<string, string>>({});
  // Find-within-doc state (isolated feature: client-side search in the open doc).
  const [findQuery, setFindQuery] = useState("");
  const [findIndex, setFindIndex] = useState(0);
  const [jumpTick, setJumpTick] = useState(0);
  const activeMatchRef = useRef<HTMLElement | null>(null);
  // Generate-all resilience: per-doc failures never abort the batch.
  const [failedDocs, setFailedDocs] = useState<
    { kind: string; label: string; error: string }[]
  >([]);
  const [retryingKind, setRetryingKind] = useState<string | null>(null);
  // Snapshot refs so apiFetch snapshots read current values without
  // re-creating the loadAll callback.
  const stateRef = useRef({ activeKind, filter });
  stateRef.current = { activeKind, filter };
  // Mobile: the document index collapses into a toggleable drawer.
  const [indexOpen, setIndexOpen] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      // apiFetch redirects to /login?next=… on 401; stop work after the guard.
      const snap = () => ({ ...stateRef.current });
      const [ideaRes, docsRes] = await Promise.all([
        apiFetch(`/api/ideas/${ideaId}`, undefined, { snapshot: snap() }),
        apiFetch(`/api/docs?ideaId=${ideaId}`, undefined, { snapshot: snap() }),
      ]);
      if (ideaRes.status === 401 || docsRes.status === 401) return;
      const ideaData = await ideaRes.json();
      if (ideaRes.ok) {
        setIdea(ideaData.idea);
        const upRes = await apiFetch(
          `/api/uploads?projectId=${ideaData.idea.projectId}`
        );
        const upData = await upRes.json();
        setUploads(upData.uploads ?? []);
      }
      const docsData = await docsRes.json();
      if (docsRes.ok) {
        const map: Record<string, string> = {};
        const meta: Record<string, string> = {};
        const ids: Record<string, string> = {};
        for (const d of docsData.docs ?? []) {
          map[d.kind] = d.content;
          if (d.updatedAt) meta[d.kind] = d.updatedAt;
          if (d.id) ids[d.kind] = d.id;
        }
        setDocs(map);
        setDocsMeta(meta);
        setDocIds(ids);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [ideaId]);

  useEffect(() => {
    // Restore doc-page state after a login redirect (session expired mid-work).
    const saved = consumeSavedState(locationKey()) as {
      activeKind?: string;
      filter?: string;
    } | null;
    if (saved?.activeKind && DOC_KINDS.some((d) => d.kind === saved.activeKind)) {
      setActiveKind(saved.activeKind);
    }
    if (typeof saved?.filter === "string") setFilter(saved.filter);
    loadAll();
  }, [loadAll]);

  // Single-doc generation with one automatic retry on timeout.
  // Throws on failure (or on 401 with message "__abort__" after redirect fired).
  async function generateSingle(d: DocKindDef): Promise<void> {
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await apiFetch(
          "/api/docs/generate",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ideaId, kind: d.kind }),
          },
          { snapshot: { ...stateRef.current } }
        );
        if (res.status === 401) throw new Error("__abort__"); // redirect already fired
        const text = await res.text();
        let data: {
          doc?: { content?: string; id?: string; updatedAt?: string };
          error?: string;
        };
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(
            `Failed: ${d.label} — the server didn't respond in time.`
          );
        }
        if (!res.ok) throw new Error(data.error || `Failed: ${d.label}`);
        setDocs((prev) => ({
          ...prev,
          [d.kind]: data.doc?.content ?? prev[d.kind],
        }));
        if (data.doc?.updatedAt)
          setDocsMeta((prev) => ({ ...prev, [d.kind]: data.doc!.updatedAt! }));
        if (data.doc?.id)
          setDocIds((prev) => ({ ...prev, [d.kind]: data.doc!.id! }));
        return;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error("Generation failed.");
        if (lastErr.message === "__abort__") throw lastErr;
        if (attempt === 0) {
          setGenState((prev) =>
            prev ? { ...prev, label: `${d.label} (retrying…)` } : prev
          );
        }
      }
    }
    throw lastErr!;
  }

  async function generateAll() {
    if (!idea) return;
    const missing = DOC_KINDS.filter((d) => !docs[d.kind]);
    if (missing.length === 0) return;
    setGenState({ running: true, current: 0, total: missing.length, label: "" });
    setError(null);
    setFailedDocs([]);
    // A single doc failure must NOT abort the batch — collect and continue.
    const failed: { kind: string; label: string; error: string }[] = [];
    for (let i = 0; i < missing.length; i++) {
      const d = missing[i];
      setGenState({
        running: true,
        current: i,
        total: missing.length,
        label: d.label,
      });
      try {
        await generateSingle(d);
      } catch (err) {
        if (err instanceof Error && err.message === "__abort__") return; // 401 redirect fired
        failed.push({
          kind: d.kind,
          label: d.label,
          error: err instanceof Error ? err.message : "Generation failed.",
        });
      }
    }
    setGenState(null);
    setFailedDocs(failed);
  }

  // Individual retry for a doc that failed during "generate all".
  async function retryDoc(kind: string) {
    const d = DOC_KINDS.find((x) => x.kind === kind);
    if (!d || retryingKind) return;
    setRetryingKind(kind);
    setError(null);
    try {
      await generateSingle(d);
      setFailedDocs((prev) => prev.filter((f) => f.kind !== kind));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed.";
      setFailedDocs((prev) =>
        prev.map((f) => (f.kind === kind ? { ...f, error: msg } : f))
      );
    } finally {
      setRetryingKind(null);
    }
  }

  async function copyDoc() {
    const content = docs[activeKind];
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  function downloadDoc() {
    const content = docs[activeKind];
    if (!content) return;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeMeta?.label ?? `${activeKind}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function regenerateOne() {
    if (!idea || regenerating) return;
    setRegenerating(true);
    setError(null);
    // Clear the view so the user watches the doc being written live.
    setDocs((prev) => ({ ...prev, [activeKind]: "" }));
    try {
      const res = await apiFetch(
        "/api/docs/generate?stream=1",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ideaId, kind: activeKind }),
        },
        { snapshot: { ...stateRef.current } }
      );
      if (res.status === 401) {
        setRegenerating(false);
        return; // redirect already fired
      }
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        let msg = "Regeneration failed.";
        try {
          msg = JSON.parse(text).error || msg;
        } catch {
          // non-JSON error body
        }
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let settled = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          let evt: { token?: string; done?: boolean; error?: string };
          try {
            evt = JSON.parse(t.slice(5).trim());
          } catch {
            continue;
          }
          if (evt.error) throw new Error(evt.error);
          if (evt.token) {
            const tok = evt.token;
            setDocs((prev) => ({
              ...prev,
              [activeKind]: (prev[activeKind] ?? "") + tok,
            }));
          }
          if (evt.done) settled = true;
        }
      }
      if (!settled) throw new Error("The stream ended unexpectedly. Try again.");
      // Stamp the new generation time so stale detection resets.
      setDocsMeta((prev) => ({
        ...prev,
        [activeKind]: new Date().toISOString(),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regeneration failed.");
      // Restore the previous version on failure.
      loadAll();
    } finally {
      setRegenerating(false);
    }
  }

  const generatedCount = DOC_KINDS.filter((d) => docs[d.kind]).length;
  const activeContent = docs[activeKind];
  const activeMeta = DOC_KINDS.find((d) => d.kind === activeKind);
  const activeUpdatedAt = docsMeta[activeKind];
  const allDone = generatedCount === DOC_KINDS.length;

  const q = filter.trim().toLowerCase();
  const visibleKinds = q
    ? DOC_KINDS.filter((d) =>
        `${d.title} ${d.label} ${d.kind}`.toLowerCase().includes(q)
      )
    : DOC_KINDS;

  const docStatus = (kind: string): "ready" | "generating" | "queued" => {
    if (regenerating && activeKind === kind) return "generating";
    if (genState?.running && genState.label) {
      const label = DOC_KINDS.find((d) => d.kind === kind)?.label ?? "§";
      if (genState.label.startsWith(label)) return "generating";
    }
    return docs[kind] ? "ready" : "queued";
  };

  const progressPct = genState?.running
    ? Math.round(((genState.current + 1) / genState.total) * 100)
    : Math.round((generatedCount / DOC_KINDS.length) * 100);

  const targetLabel =
    idea?.project.category === "from-play-store-scan"
      ? "Android + iOS native"
      : "Web application";

  // --- In-doc search -------------------------------------------------------
  const findMatches = useMemo(() => {
    if (!findQuery || !activeContent) return [] as number[];
    const hay = activeContent.toLowerCase();
    const needle = findQuery.toLowerCase();
    const out: number[] = [];
    let pos = 0;
    while (pos <= hay.length) {
      const i = hay.indexOf(needle, pos);
      if (i === -1) break;
      out.push(i);
      pos = i + Math.max(1, needle.length);
    }
    return out;
  }, [activeContent, findQuery]);

  const safeFindIndex = findMatches.length
    ? ((findIndex % findMatches.length) + findMatches.length) %
      findMatches.length
    : 0;

  useEffect(() => {
    setFindIndex(0);
  }, [findQuery, activeKind]);

  useEffect(() => {
    activeMatchRef.current?.scrollIntoView({ block: "center" });
  }, [jumpTick]);

  function jumpFind(dir: 1 | -1) {
    if (findMatches.length === 0) return;
    setFindIndex((i) => i + dir);
    setJumpTick((t) => t + 1);
  }

  function renderHighlightedContent(): ReactNode {
    if (!activeContent || findMatches.length === 0) return activeContent;
    const qlen = findQuery.length;
    const nodes: ReactNode[] = [];
    let last = 0;
    findMatches.forEach((start, i) => {
      if (start > last) nodes.push(activeContent.slice(last, start));
      nodes.push(
        <mark
          key={i}
          ref={
            i === safeFindIndex
              ? (el) => {
                  activeMatchRef.current = el;
                }
              : undefined
          }
          className={
            i === safeFindIndex
              ? "rounded-sm bg-primary px-px text-primary-foreground"
              : "rounded-sm bg-score-medium/60 px-px text-inherit"
          }
        >
          {activeContent.slice(start, start + qlen)}
        </mark>
      );
      last = start + qlen;
    });
    if (last < activeContent.length) nodes.push(activeContent.slice(last));
    return nodes;
  }
  // --- end in-doc search ---------------------------------------------------

  // --- Word count + reading time -------------------------------------------
  const wordCount = activeContent
    ? activeContent.split(/\s+/).filter(Boolean).length
    : 0;
  const readMinutes = Math.max(1, Math.round(wordCount / 200));
  // --- end word count ------------------------------------------------------

  // --- Stale detection -----------------------------------------------------
  const docIsStale = useCallback(
    (kind: string): boolean => {
      const docAt = docsMeta[kind];
      if (!docAt || !idea?.updatedAt) return false;
      // 1s tolerance for clock skew between generate and idea timestamps.
      return new Date(idea.updatedAt).getTime() > new Date(docAt).getTime() + 1000;
    },
    [docsMeta, idea?.updatedAt]
  );
  const activeStale = docIsStale(activeKind);
  // --- end stale detection -------------------------------------------------

  if (loading) {
    return (
      <main className="mx-auto max-w-[1200px] px-6 py-16 text-center">
        <p className="font-serif text-xl text-muted-foreground">Loading documents…</p>
      </main>
    );
  }

  if (!idea) {
    return (
      <main className="mx-auto max-w-[1200px] px-6 py-16 text-center">
        <p className="mb-4 text-muted-foreground">Idea not found.</p>
        <Link href="/" className="text-primary hover:underline">
          ← Back home
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-6">
      {/* Page header */}
      <section className="print-hide flex flex-col gap-3 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-primary">
              Stage 04 // Hand-off Engine
            </span>
            <span className="text-border">•</span>
            <span className="flex items-center gap-1.5 font-mono text-xs text-score-high">
              <span className="h-1.5 w-1.5 rounded-full bg-score-high" />
              Pipeline Operational
            </span>
          </div>
          <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground md:text-4xl">
            Technical Documentation Generator
          </h1>
          <p className="mt-1 text-[0.9375rem] text-muted-foreground">
            {DOC_KINDS.length} production-grade specs for engineering handoff.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 self-start rounded border border-border bg-secondary/40 px-3 py-1.5 font-mono text-xs text-muted-foreground md:self-auto">
          <span className="material-symbols text-[16px]">folder_zip</span>
          Target: {targetLabel}
        </span>
      </section>

      {error && (
        <div className="print-hide mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span className="material-symbols mt-0.5 text-[18px]">error</span>
          <span>{error}</span>
        </div>
      )}

      {/* Stitch exports used by doc generation */}
      <div className="print-hide mt-6">
        <UploadPanel
          projectId={idea.projectId}
          uploads={uploads}
          onUploaded={loadAll}
        />
      </div>

      {/* Two-pane workspace */}
      <div className="mt-6 flex flex-col items-start gap-6 min-[900px]:flex-row">
        {/* LEFT: document index — collapsible drawer on mobile */}
        <aside className="print-hide card-elevated flex w-full shrink-0 flex-col self-stretch overflow-hidden min-[900px]:sticky min-[900px]:top-6 min-[900px]:w-[320px]">
          <button
            onClick={() => setIndexOpen((v) => !v)}
            aria-expanded={indexOpen}
            aria-label="Toggle document index"
            className="flex min-h-[48px] w-full items-center justify-between gap-2 border-b border-border p-4 min-[900px]:hidden"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="material-symbols text-[18px] text-muted-foreground">
                menu_book
              </span>
              <span className="truncate text-sm font-semibold text-foreground">
                Project Documents
              </span>
              <span className="shrink-0 rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-bold text-primary">
                {generatedCount}/{DOC_KINDS.length}
              </span>
            </span>
            <span className="material-symbols shrink-0 text-[20px] text-muted-foreground">
              {indexOpen ? "expand_less" : "expand_more"}
            </span>
          </button>
          <div
            className={
              indexOpen ? "contents" : "hidden min-[900px]:contents"
            }
          >
          <div className="space-y-3 border-b border-border p-4">
            <div className="hidden items-center justify-between min-[900px]:flex">
              <div className="flex min-w-0 items-center gap-2">
                <span className="material-symbols text-[18px] text-muted-foreground">
                  menu_book
                </span>
                <h2 className="truncate text-sm font-semibold text-foreground">
                  Project Documents
                </h2>
              </div>
              <span className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-bold text-primary">
                {DOC_KINDS.length}
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground" title={idea.title}>
              {idea.title}
            </p>
            <div className="relative">
              <span className="material-symbols absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-muted-foreground">
                search
              </span>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter specifications..."
                className="input-paper h-9! py-0! pl-9 text-[0.8125rem]"
              />
            </div>
          </div>

          <div className="max-h-[520px] flex-1 divide-y divide-border/60 overflow-y-auto">
            {visibleKinds.map((d) => {
              const status = docStatus(d.kind);
              const isActive = d.kind === activeKind;
              return (
                <button
                  key={d.kind}
                  type="button"
                  onClick={() => {
                    setActiveKind(d.kind);
                    setIndexOpen(false);
                  }}
                  className={`flex min-h-[48px] w-full cursor-pointer items-center justify-between gap-2 p-3 text-left transition-colors ${
                    isActive
                      ? "border-l-4 border-primary bg-secondary/30"
                      : "border-l-4 border-transparent hover:bg-muted/50"
                  } ${status === "queued" ? "opacity-70 hover:opacity-100" : ""}`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        status === "ready"
                          ? "bg-score-high"
                          : status === "generating"
                            ? "animate-pulse bg-score-medium"
                            : "bg-muted-foreground/40"
                      }`}
                    />
                    <span
                      className={`truncate text-[0.875rem] ${
                        isActive
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {d.title}
                    </span>
                    {docIsStale(d.kind) && docs[d.kind] && (
                      <span
                        className="material-symbols shrink-0 text-[14px] text-score-medium"
                        title="May be outdated — idea changed since generation"
                      >
                        warning
                      </span>
                    )}
                  </span>
                  {status === "generating" ? (
                    <span className="material-symbols shrink-0 animate-spin text-[15px] text-score-medium">
                      sync
                    </span>
                  ) : isActive ? (
                    <span className="material-symbols shrink-0 text-[16px] text-primary">
                      chevron_right
                    </span>
                  ) : (
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground/60">
                      {status === "queued" ? "queued" : d.label}
                    </span>
                  )}
                </button>
              );
            })}
            {visibleKinds.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No documents match “{filter}”.
              </p>
            )}
          </div>

          <div className="space-y-3 border-t border-border bg-card/90 p-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="text-muted-foreground">
                  {genState?.running
                    ? `Generating ${genState.current + 1} of ${genState.total} docs`
                    : `${generatedCount} of ${DOC_KINDS.length} docs ready`}
                </span>
                <span className="font-bold text-primary">{progressPct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {genState?.running && genState.label && (
                <p className="truncate text-xs text-muted-foreground">
                  {genState.label}
                </p>
              )}
            </div>
            <button
              onClick={generateAll}
              disabled={genState?.running || allDone}
              className="btn-primary w-full min-h-[48px] py-2.5!"
            >
              <span className="material-symbols text-[18px]">
                {allDone ? "check_circle" : "sync"}
              </span>
              <span>
                {allDone
                  ? "All Documents Ready"
                  : genState?.running
                    ? "Generating…"
                    : `Generate All Documents${
                        generatedCount > 0
                          ? ` (${DOC_KINDS.length - generatedCount} left)`
                          : ""
                      }`}
              </span>
            </button>
            {failedDocs.length > 0 && (
              <div className="rounded-md border border-score-medium/40 bg-score-medium/10 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-score-medium">
                  <span className="material-symbols text-[15px]">warning</span>
                  {failedDocs.length} doc{failedDocs.length > 1 ? "s" : ""}{" "}
                  failed — the rest completed
                </p>
                <ul className="space-y-1.5">
                  {failedDocs.map((f) => (
                    <li
                      key={f.kind}
                      className="flex items-center justify-between gap-2"
                    >
                      <span
                        className="min-w-0 flex-1 truncate text-xs text-foreground"
                        title={f.error}
                      >
                        {f.label}
                      </span>
                      <button
                        onClick={() => retryDoc(f.kind)}
                        disabled={retryingKind !== null}
                        className="shrink-0 rounded border border-score-medium/40 px-2 py-1 font-mono text-[11px] font-semibold text-score-medium transition-colors hover:bg-score-medium/20 disabled:opacity-50"
                      >
                        {retryingKind === f.kind ? "Retrying…" : "Retry"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          </div>
        </aside>

        {/* RIGHT: document reader */}
        <section className="card-elevated w-full flex-1 overflow-hidden p-4 md:p-6 min-[900px]:p-8">
          {activeContent || regenerating ? (
            <>
              <div className="mb-6 flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="rounded bg-score-high/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-score-high">
                      SPEC COMPLIANT
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      DOC_ID: {activeKind}
                    </span>
                    {regenerating && (
                      <span className="flex items-center gap-1.5 font-mono text-[11px] text-score-medium">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-score-medium" />
                        Writing…
                      </span>
                    )}
                    {activeStale && !regenerating && (
                      <span className="inline-flex items-center gap-1.5 rounded border border-score-medium/40 bg-score-medium/10 px-2 py-0.5 text-[11px] font-medium text-score-medium">
                        <span className="material-symbols text-[14px]">warning</span>
                        <span>May be outdated — idea changed since generation</span>
                        <button
                          onClick={regenerateOne}
                          className="underline underline-offset-2 hover:no-underline"
                        >
                          Re-generate
                        </button>
                      </span>
                    )}
                  </div>
                  <h2 className="font-serif text-[1.75rem] font-medium leading-tight tracking-tight text-foreground">
                    {activeMeta?.title}
                  </h2>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {activeUpdatedAt
                      ? `Last updated ${timeAgo(activeUpdatedAt)}`
                      : regenerating
                        ? "Generating now…"
                        : "Not saved yet"}
                    {activeContent &&
                      ` · ${wordCount} words · ~${readMinutes} min read`}
                  </p>
                </div>
                <div className="print-hide flex flex-wrap items-center gap-2">
                  {activeContent && (
                    <div className="flex min-h-[44px] items-center gap-1 rounded-md border border-border px-2 py-1 md:min-h-0">
                      <span className="material-symbols text-[16px] text-muted-foreground">
                        find_in_page
                      </span>
                      <input
                        value={findQuery}
                        onChange={(e) => setFindQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            jumpFind(e.shiftKey ? -1 : 1);
                          }
                        }}
                        placeholder="Find in doc…"
                        className="w-28 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/60"
                      />
                      {findQuery && (
                        <>
                          <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                            {findMatches.length === 0
                              ? "0 of 0"
                              : `${safeFindIndex + 1} of ${findMatches.length}`}
                          </span>
                          <button
                            onClick={() => jumpFind(-1)}
                            title="Previous match"
                            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <span className="material-symbols text-[16px]">
                              arrow_upward
                            </span>
                          </button>
                          <button
                            onClick={() => jumpFind(1)}
                            title="Next match"
                            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <span className="material-symbols text-[16px]">
                              arrow_downward
                            </span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  <button
                    onClick={regenerateOne}
                    disabled={regenerating}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:min-h-0 disabled:opacity-50"
                  >
                    <span className="material-symbols text-[16px]">refresh</span>
                    <span>{regenerating ? "Regenerating…" : "Regenerate"}</span>
                  </button>
                  {/* foundation: version history */}
                  {docIds[activeKind] && (
                    <DocHistoryMenu
                      docId={docIds[activeKind]}
                      kindLabel={activeMeta?.label ?? activeKind}
                      onRestored={loadAll}
                    />
                  )}
                  <button
                    onClick={copyDoc}
                    disabled={!activeContent}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:min-h-0 disabled:opacity-50"
                  >
                    <span className="material-symbols text-[16px]">
                      {copied ? "check" : "content_copy"}
                    </span>
                    <span>{copied ? "Copied" : "Copy Markdown"}</span>
                  </button>
                  <button
                    onClick={downloadDoc}
                    disabled={!activeContent}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-input bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-muted disabled:opacity-50 md:min-h-0"
                  >
                    <span className="material-symbols text-[16px]">download</span>
                    <span>Download .md</span>
                  </button>
                  <button
                    onClick={() => window.print()}
                    disabled={!activeContent}
                    title="Print this document"
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:min-h-0 disabled:opacity-50"
                  >
                    <span className="material-symbols text-[16px]">print</span>
                    <span>Print</span>
                  </button>
                </div>
              </div>
              <pre className="print-doc max-h-[36rem] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background/60 p-5 font-mono text-[0.8125rem] leading-relaxed text-foreground/85">
                {renderHighlightedContent()}
              </pre>
            </>
          ) : (
            <div className="rounded-md border border-dashed border-border p-10 text-center">
              <span className="material-symbols text-[28px] text-muted-foreground/60">
                description
              </span>
              <p className="mt-2 font-serif text-lg text-foreground">
                {activeMeta?.label} not generated yet
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Select it in the index and hit “Generate All Documents”, or
                generate it on its own with Regenerate.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Footer navigation */}
      <footer className="print-hide mt-6 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={`/stitch/${idea.projectId}?idea=${ideaId}`}
          className="btn-ghost min-h-[44px] w-full justify-center px-4! py-2.5! sm:w-auto"
        >
          <span className="material-symbols text-[18px]">arrow_back</span>
          <span>Back to Design</span>
        </Link>
        <Link href={`/export/${ideaId}`} className="btn-primary min-h-[44px] w-full justify-center px-6! py-2.5! sm:w-auto">
          <span>Continue to Export</span>
          <span className="material-symbols text-[18px]">arrow_forward</span>
        </Link>
      </footer>
    </main>
  );
}
