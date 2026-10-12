"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import UploadPanel, { type UploadItem } from "@/components/UploadPanel";
import { DOC_KINDS } from "@/lib/constants";
import { timeAgo } from "@/lib/hunter/ui";

type Idea = {
  id: string;
  projectId: string;
  title: string;
  status: string;
  project: { id: string; category: string };
};

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

  const loadAll = useCallback(async () => {
    try {
      const [ideaRes, docsRes] = await Promise.all([
        fetch(`/api/ideas/${ideaId}`),
        fetch(`/api/docs?ideaId=${ideaId}`),
      ]);
      const ideaData = await ideaRes.json();
      if (ideaRes.ok) {
        setIdea(ideaData.idea);
        const upRes = await fetch(
          `/api/uploads?projectId=${ideaData.idea.projectId}`
        );
        const upData = await upRes.json();
        setUploads(upData.uploads ?? []);
      }
      const docsData = await docsRes.json();
      if (docsRes.ok) {
        const map: Record<string, string> = {};
        const meta: Record<string, string> = {};
        for (const d of docsData.docs ?? []) {
          map[d.kind] = d.content;
          if (d.updatedAt) meta[d.kind] = d.updatedAt;
        }
        setDocs(map);
        setDocsMeta(meta);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [ideaId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function generateAll() {
    if (!idea) return;
    const missing = DOC_KINDS.filter((d) => !docs[d.kind]);
    if (missing.length === 0) return;
    setGenState({ running: true, current: 0, total: missing.length, label: "" });
    setError(null);
    try {
      for (let i = 0; i < missing.length; i++) {
        const d = missing[i];
        setGenState({
          running: true,
          current: i,
          total: missing.length,
          label: d.label,
        });
        // Retry once on timeout — AI calls sometimes just need a second attempt.
        let lastErr: Error | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch("/api/docs/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ideaId, kind: d.kind }),
            });
            const text = await res.text();
            let data: { doc?: { content?: string }; error?: string };
            try {
              data = JSON.parse(text);
            } catch {
              throw new Error(
                `Failed: ${d.label} — the server didn't respond in time.`
              );
            }
            if (!res.ok) throw new Error(data.error || `Failed: ${d.label}`);
            setDocs((prev) => ({ ...prev, [d.kind]: data.doc?.content ?? prev[d.kind] }));
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err instanceof Error ? err : new Error("Generation failed.");
            if (attempt === 0) {
              setGenState((prev) =>
                prev ? { ...prev, label: `${d.label} (retrying…)` } : prev
              );
            }
          }
        }
        if (lastErr) throw lastErr;
      }
      setGenState(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
      setGenState((prev) => (prev ? { ...prev, running: false } : null));
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
      const res = await fetch("/api/docs/generate?stream=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId, kind: activeKind }),
      });
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
      <section className="flex flex-col gap-3 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
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
          <h1 className="font-serif text-4xl font-medium tracking-tight text-foreground">
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
        <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span className="material-symbols mt-0.5 text-[18px]">error</span>
          <span>{error}</span>
        </div>
      )}

      {/* Stitch exports used by doc generation */}
      <div className="mt-6">
        <UploadPanel
          projectId={idea.projectId}
          uploads={uploads}
          onUploaded={loadAll}
        />
      </div>

      {/* Two-pane workspace */}
      <div className="mt-6 flex flex-col items-start gap-6 min-[900px]:flex-row">
        {/* LEFT: document index */}
        <aside className="card-elevated flex w-full shrink-0 flex-col self-stretch overflow-hidden min-[900px]:sticky min-[900px]:top-6 min-[900px]:w-[320px]">
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex items-center justify-between">
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
                  onClick={() => setActiveKind(d.kind)}
                  className={`flex w-full cursor-pointer items-center justify-between gap-2 p-3 text-left transition-colors ${
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
              className="btn-primary w-full py-2.5!"
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
          </div>
        </aside>

        {/* RIGHT: document reader */}
        <section className="card-elevated w-full flex-1 overflow-hidden p-6 min-[900px]:p-8">
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
                      ` · ${activeContent.split(/\s+/).filter(Boolean).length} words`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={regenerateOne}
                    disabled={regenerating}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <span className="material-symbols text-[16px]">refresh</span>
                    <span>{regenerating ? "Regenerating…" : "Regenerate"}</span>
                  </button>
                  <button
                    onClick={copyDoc}
                    disabled={!activeContent}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <span className="material-symbols text-[16px]">
                      {copied ? "check" : "content_copy"}
                    </span>
                    <span>{copied ? "Copied" : "Copy Markdown"}</span>
                  </button>
                  <button
                    onClick={downloadDoc}
                    disabled={!activeContent}
                    className="inline-flex items-center gap-1.5 rounded-md border border-input bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    <span className="material-symbols text-[16px]">download</span>
                    <span>Download .md</span>
                  </button>
                </div>
              </div>
              <pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background/60 p-5 font-mono text-[0.8125rem] leading-relaxed text-foreground/85">
                {activeContent}
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
      <footer className="mt-6 flex items-center justify-between border-t border-border pt-4">
        <Link
          href={`/stitch/${idea.projectId}?idea=${ideaId}`}
          className="btn-ghost px-4! py-2.5!"
        >
          <span className="material-symbols text-[18px]">arrow_back</span>
          <span>Back to Design</span>
        </Link>
        <Link href={`/export/${ideaId}`} className="btn-primary px-6! py-2.5!">
          <span>Continue to Export</span>
          <span className="material-symbols text-[18px]">arrow_forward</span>
        </Link>
      </footer>
    </main>
  );
}
