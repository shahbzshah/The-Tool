"use client";

import { useRef, useState } from "react";

export type UploadItem = {
  id: string;
  projectId: string;
  type: string;
  filename: string;
  createdAt: string;
};

const TYPE_BADGE: Record<string, string> = {
  design_md: "DESIGN.md",
  html: "HTML",
  screenshot: "Screenshot",
};

export default function UploadPanel({
  projectId,
  uploads,
  onUploaded,
}: {
  projectId: string;
  uploads: UploadItem[];
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadFiles(files: FileList | File[]) {
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("projectId", projectId);
        form.append("file", file);
        const res = await fetch("/api/uploads", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Upload failed: ${file.name}`);
      }
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        2. Upload Stitch Exports
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Export from Google Stitch and drop the files here — DESIGN.md, HTML, and
        screenshots all help the AI write better docs.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragOver
            ? "border-accent bg-primary/10"
            : "border-border hover:border-ring"
        }`}
      >
        <p className="text-sm text-foreground/80">
          {busy
            ? "Uploading…"
            : "Drag & drop files here, or click to browse"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">.md · .html · .png · .jpg · .webp</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".md,.markdown,.html,.htm,.png,.jpg,.jpeg,.webp,.gif"
          className="hidden"
          onChange={(e) => e.target.files && uploadFiles(e.target.files)}
        />
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {uploads.length > 0 && (
        <ul className="mt-4 space-y-2">
          {uploads.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between rounded-lg bg-background px-3 py-2 text-sm"
            >
              <span className="text-foreground/90">{u.filename}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {TYPE_BADGE[u.type] ?? u.type}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
