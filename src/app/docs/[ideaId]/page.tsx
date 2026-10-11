"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import UploadPanel, { type UploadItem } from "@/components/UploadPanel";
import { DOC_KINDS } from "@/lib/constants";

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
  const [activeKind, setActiveKind] = useState<string>(DOC_KINDS[0].kind);
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
        for (const d of docsData.docs ?? []) map[d.kind] = d.content;
        setDocs(map);
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

  async function regenerateOne() {
    if (!idea || regenerating) return;
    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/docs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId, kind: activeKind }),
      });
      const text = await res.text();
      let data: { doc?: { content?: string }; error?: string };
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("The server didn't respond in time. Try again.");
      }
      if (!res.ok) throw new Error(data.error || "Regeneration failed.");
      setDocs((prev) => ({ ...prev, [activeKind]: data.doc?.content ?? prev[activeKind] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regeneration failed.");
    } finally {
      setRegenerating(false);
    }
  }

  const generatedCount = DOC_KINDS.filter((d) => docs[d.kind]).length;
  const activeContent = docs[activeKind];
  const activeMeta = DOC_KINDS.find((d) => d.kind === activeKind);

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16 text-center text-muted-foreground">
        Loading…
      </main>
    );
  }

  if (!idea) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16 text-center">
        <p className="mb-4 text-muted-foreground">Idea not found.</p>
        <Link href="/" className="text-primary hover:underline">
          ← Back home
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-6 flex items-center justify-between text-sm">
        <Link href={`/stitch/${idea.projectId}`} className="text-muted-foreground hover:text-foreground">
          ← Back to Stitch prompt
        </Link>
        <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          {idea.project.category}
        </span>
      </div>

      <header className="mb-8">
        <h1 className="mb-1 text-2xl font-bold">📄 Documentation Generator</h1>
        <p className="text-muted-foreground">
          For approved idea: <span className="text-foreground/90">{idea.title}</span>
        </p>
      </header>

      <div className="mb-6">
        <UploadPanel
          projectId={idea.projectId}
          uploads={uploads}
          onUploaded={loadAll}
        />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          4. Review Documents
        </h2>
        <div className="mb-4">
          <select
            value={activeKind}
            onChange={(e) => setActiveKind(e.target.value)}
            className="w-full max-w-md rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            {DOC_KINDS.map((d) => (
              <option key={d.kind} value={d.kind}>
                {docs[d.kind] ? "✓ " : ""}
                {d.label} — {d.title}
              </option>
            ))}
          </select>
        </div>

        {activeContent ? (
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <span className="text-sm font-semibold text-foreground/90">
                  {activeMeta?.label}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {activeMeta?.title}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={regenerateOne}
                  disabled={regenerating}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  {regenerating ? "Regenerating…" : "Regenerate 🔄"}
                </button>
                <button
                  onClick={copyDoc}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    copied
                      ? "bg-secondary text-secondary-foreground"
                      : "bg-muted text-foreground hover:bg-secondary"
                  }`}
                >
                  {copied ? "Copied! ✅" : "Copy 📋"}
                </button>
              </div>
            </div>
            <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-foreground/80">
              {activeContent}
            </pre>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground/70">
            {activeMeta?.label} not generated yet — hit “Generate all docs ⚡” below.
          </p>
        )}
      </section>

      <div className="mt-8 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Generate All Documentation
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {generatedCount}/{DOC_KINDS.length} documents generated
            </p>
          </div>
          <div className="flex items-center gap-3">
            {generatedCount === DOC_KINDS.length && (
              <Link
                href={`/export/${idea.id}`}
                className="rounded-lg bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-secondary/90"
              >
                Export for AI tool 🤖
              </Link>
            )}
            <button
              onClick={generateAll}
              disabled={genState?.running || generatedCount === DOC_KINDS.length}
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
            {generatedCount === DOC_KINDS.length
              ? "All docs generated ✅"
              : genState?.running
                ? `Generating ${genState.label} (${genState.current + 1}/${genState.total})…`
                : `Generate all docs ⚡ (${DOC_KINDS.length - generatedCount} remaining)`}
          </button>
          </div>
        </div>
        {genState?.running && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(genState.current / genState.total) * 100}%` }}
            />
          </div>
        )}
        {error && (
          <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      {/* Strict pipeline: ← Design | Docs → Export */}
      <div className="mt-10 flex items-center justify-between border-t border-border pt-6">
        {idea && (
          <Link
            href={`/stitch/${idea.projectId}?idea=${ideaId}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to Design
          </Link>
        )}
        <Link
          href={`/export/${ideaId}`}
          className="rounded-md bg-primary px-6 py-2.5 font-medium text-primary-foreground"
        >
          Continue to Export →
        </Link>
      </div>
    </main>
  );
}

