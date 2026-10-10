"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { EXPORT_TOOLS, type ExportToolId } from "@/lib/exporters";

export default function ExportPage() {
  const params = useParams<{ ideaId: string }>();
  const ideaId = params.ideaId;

  const [idea, setIdea] = useState<{
    id: string;
    projectId: string;
    title: string;
    status: string;
  } | null>(null);
  const [docCount, setDocCount] = useState(0);
  const [selected, setSelected] = useState<ExportToolId>("cursor");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [writtenCount, setWrittenCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const ideaRes = await fetch(`/api/ideas/${ideaId}`);
      const ideaData = await ideaRes.json();
      if (ideaRes.ok) setIdea(ideaData.idea);
      const docsRes = await fetch(`/api/docs?ideaId=${ideaId}`);
      const docsData = await docsRes.json();
      if (docsRes.ok) setDocCount((docsData.docs ?? []).length);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [ideaId]);

  useEffect(() => {
    load();
  }, [load]);

  async function download() {
    if (!idea) return;
    setDownloading(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch("/api/export/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId, tool: selected }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Export failed.");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "export-pack.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setDownloading(false);
    }
  }

  const tool = EXPORT_TOOLS.find((t) => t.id === selected)!;

  async function saveToFolder() {
    const picker = (window as unknown as {
      showDirectoryPicker?: (opts?: unknown) => Promise<FileSystemDirectoryHandle>;
    }).showDirectoryPicker;
    if (!picker) {
      setError(
        "Your browser doesn't support saving to a folder. Use Chrome/Edge, or download the ZIP instead."
      );
      return;
    }
    if (!idea) return;
    setDownloading(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch("/api/export/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId, tool: selected }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Export failed.");
      }
      const blob = await res.blob();
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(blob);

      const dir = await picker({ mode: "readwrite" });
      let written = 0;
      for (const path of Object.keys(zip.files)) {
        const entry = zip.files[path];
        if (entry.dir) continue;
        const parts = path.split("/");
        const filename = parts.pop()!;
        let target: FileSystemDirectoryHandle = dir;
        for (const part of parts) {
          target = await target.getDirectoryHandle(part, { create: true });
        }
        const fileHandle = await target.getFileHandle(filename, {
          create: true,
        });
        const writable = await fileHandle.createWritable();
        await writable.write(await entry.async("string"));
        await writable.close();
        written++;
      }
      setDone(true);
      setWrittenCount(written);
    } catch (err) {
      if (
        err instanceof DOMException &&
        (err.name === "AbortError" || err.name === "NotAllowedError")
      ) {
        // user cancelled the folder picker or denied permission
      } else {
        setError(err instanceof Error ? err.message : "Export failed.");
      }
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16 text-center text-muted-foreground">
        Loading…
      </main>
    );
  }

  if (!idea) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16 text-center">
        <p className="mb-4 text-muted-foreground">Idea not found.</p>
        <Link href="/" className="text-primary hover:underline">
          ← Back home
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-6 text-sm">
        <Link href={`/docs/${idea.id}`} className="text-muted-foreground hover:text-foreground">
          ← Back to docs
        </Link>
      </div>

      <header className="mb-8">
        <h1 className="mb-1 text-2xl font-bold">🤖 Export for AI Coding Tools</h1>
        <p className="text-muted-foreground">
          Pack for <span className="text-foreground/90">{idea.title}</span> —{" "}
          {docCount}/11 docs included
        </p>
      </header>

      {docCount === 0 && (
        <div className="mb-6 rounded-xl border border-secondary bg-secondary/40 p-4 text-sm text-secondary-foreground">
          ⚠️ No documents generated yet.{" "}
          <Link href={`/docs/${idea.id}`} className="underline">
            Generate the docs first
          </Link>{" "}
          — the export pack is built from them.
        </div>
      )}

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          1. Pick your AI coding tool
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {EXPORT_TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setSelected(t.id);
                setDone(false);
                setError(null);
              }}
              className={`rounded-xl border p-4 text-left transition-colors ${
                selected === t.id
                  ? "border-accent bg-primary/10"
                  : "border-border bg-card hover:border-ring"
              }`}
            >
              <div className="text-lg">{t.emoji}</div>
              <div className="mt-1 text-sm font-semibold text-foreground">
                {t.name}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{t.tagline}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          2. Download the pack
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          <span className="text-foreground/90">{tool.name}</span>: {tool.usage}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={download}
            disabled={downloading || docCount === 0}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {downloading ? "Building zip…" : `Download ${tool.name} pack 📦`}
          </button>
          <button
            onClick={saveToFolder}
            disabled={downloading || docCount === 0}
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-ring disabled:opacity-50"
          >
            {downloading ? "Writing files…" : "Save to folder 📁"}
          </button>
          {done && (
            <span className="text-sm text-primary">
              {writtenCount > 0
                ? `Done! ✅ ${writtenCount} files written to your folder.`
                : "Downloaded! ✅ Unzip into your project root."}
            </span>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground/70">
          “Save to folder” works in Chrome/Edge — pick a folder and the files are
          written there directly, no unzipping needed.
        </p>
        {error && (
          <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </section>

      {/* Strict pipeline: Export → Docs only (no jump to Design) */}
      <div className="mt-10 border-t border-border pt-6">
        <Link
          href={`/docs/${ideaId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to Docs
        </Link>
      </div>
    </main>
  );
}

