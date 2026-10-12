"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { EXPORT_TOOLS, type ExportToolId } from "@/lib/exporters";
import { DOC_KINDS } from "@/lib/constants";

const TOOL_ICONS: Record<ExportToolId, string> = {
  vscode: "code",
  cursor: "text_cursor",
  claude: "auto_awesome",
  copilot: "assistant",
  windsurf: "sailing",
  bolt: "bolt",
  lovable: "favorite",
  v0: "terminal",
};

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
      <main className="mx-auto max-w-[1200px] px-4 py-16 text-center text-muted-foreground md:px-8">
        Loading…
      </main>
    );
  }

  if (!idea) {
    return (
      <main className="mx-auto max-w-[1200px] px-4 py-16 text-center md:px-8">
        <p className="mb-4 text-muted-foreground">Idea not found.</p>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <span className="material-symbols text-[18px]">arrow_back</span>
          Back home
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-12 md:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 text-sm">
          <Link
            href={`/docs/${idea.id}`}
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <span className="material-symbols text-[18px]">arrow_back</span>
            Back to Docs
          </Link>
        </div>

        <header className="mb-8 text-center">
          <p className="label-caps mb-3 text-primary">Export</p>
          <h1 className="mb-3 font-serif text-4xl tracking-tight text-foreground">
            Your build pack is ready
          </h1>
          <p className="text-muted-foreground">
            Pack for <span className="text-foreground">{idea.title}</span> —{" "}
            <span className="font-mono text-sm">
              {docCount}/{DOC_KINDS.length} docs
            </span>{" "}
            included
          </p>
        </header>

        {docCount === 0 && (
          <div className="card-paper mb-6 flex items-start gap-3 p-4">
            <span className="material-symbols text-[20px] text-score-medium">
              warning
            </span>
            <p className="text-sm text-muted-foreground">
              No documents generated yet.{" "}
              <Link
                href={`/docs/${idea.id}`}
                className="font-medium text-primary hover:underline"
              >
                Generate the docs first
              </Link>{" "}
              — the export pack is built from them.
            </p>
          </div>
        )}

        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="card-paper p-4 text-center">
            <span className="material-symbols mb-2 inline-block text-[24px] text-primary">
              description
            </span>
            <p className="label-caps text-muted-foreground">Documents</p>
            <p className="mt-1 font-mono text-lg text-foreground">
              {docCount}/{DOC_KINDS.length}
            </p>
          </div>
          <div className="card-paper p-4 text-center">
            <span className="material-symbols mb-2 inline-block text-[24px] text-primary">
              smart_toy
            </span>
            <p className="label-caps text-muted-foreground">Target tool</p>
            <p className="mt-1 text-lg font-medium text-foreground">
              {tool.name}
            </p>
          </div>
          <div className="card-paper p-4 text-center">
            <span className="material-symbols mb-2 inline-block text-[24px] text-primary">
              folder_zip
            </span>
            <p className="label-caps text-muted-foreground">Format</p>
            <p className="mt-1 font-mono text-lg text-foreground">.zip</p>
          </div>
        </div>

        <section className="mb-6">
          <h2 className="label-caps mb-3 text-muted-foreground">
            1. Pick your AI coding tool
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {EXPORT_TOOLS.map((t) => {
              const active = selected === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelected(t.id);
                    setDone(false);
                    setError(null);
                  }}
                  className={`card-paper p-4 text-left transition-colors ${
                    active
                      ? "border-primary bg-primary/10"
                      : "hover:border-input"
                  }`}
                >
                  <span
                    className={`material-symbols mb-2 inline-block text-[24px] ${
                      active ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {TOOL_ICONS[t.id]}
                  </span>
                  <div className="text-sm font-semibold text-foreground">
                    {t.name}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t.tagline}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="card-elevated p-6">
          <h2 className="label-caps mb-1 text-muted-foreground">
            2. Download the pack
          </h2>
          <p className="mb-5 text-sm text-muted-foreground">
            <span className="text-foreground">{tool.name}</span>: {tool.usage}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={download}
              disabled={downloading || docCount === 0}
              className="btn-primary"
            >
              <span className="material-symbols text-[20px]">download</span>
              {downloading ? "Building zip…" : `Download ${tool.name} pack`}
            </button>
            <button
              onClick={saveToFolder}
              disabled={downloading || docCount === 0}
              className="btn-secondary"
            >
              <span className="material-symbols text-[20px]">folder</span>
              {downloading ? "Writing files…" : "Save to folder"}
            </button>
            {done && (
              <span className="inline-flex items-center gap-1.5 text-sm text-score-high">
                <span className="material-symbols text-[20px]">
                  check_circle
                </span>
                {writtenCount > 0
                  ? `${writtenCount} files written to your folder.`
                  : "Downloaded! Unzip into your project root."}
              </span>
            )}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            “Save to folder” works in Chrome/Edge — pick a folder and the files
            are written there directly, no unzipping needed.
          </p>
          {error && (
            <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </section>

        {/* Strict pipeline: Export → Docs only (no jump to Design) */}
        <div className="mt-10 border-t border-border pt-6">
          <Link
            href={`/docs/${ideaId}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <span className="material-symbols text-[18px]">arrow_back</span>
            Back to Docs
          </Link>
        </div>
      </div>
    </main>
  );
}
