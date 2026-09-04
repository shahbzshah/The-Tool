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

const SUPPORTED_EXT = [
  "md",
  "markdown",
  "html",
  "htm",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
];
const JUNK_FILES = [".DS_Store", "Thumbs.db", "desktop.ini"];
const MAX_FILES = 200;
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB

type DroppedFile = { file: File; relativePath: string };

/** Recursively walk a dropped directory entry, collecting supported files. */
async function collectFromEntry(
  entry: FileSystemEntry,
  base: string,
  out: DroppedFile[],
  depth = 0
): Promise<void> {
  if (depth > 8 || out.length >= MAX_FILES) return;

  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File | null>((resolve) =>
      fileEntry.file(
        (f) => resolve(f),
        () => resolve(null)
      )
    );
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (
      JUNK_FILES.includes(file.name) ||
      !SUPPORTED_EXT.includes(ext) ||
      file.size > MAX_FILE_BYTES
    ) {
      return;
    }
    out.push({
      file,
      relativePath: base ? `${base}/${file.name}` : file.name,
    });
    return;
  }

  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const nextBase = base ? `${base}/${dirEntry.name}` : dirEntry.name;
    const reader = dirEntry.createReader();
    // readEntries returns batches of ≤100 — loop until empty
    for (;;) {
      const entries = await new Promise<FileSystemEntry[]>((resolve) =>
        reader.readEntries(
          (e) => resolve(e as FileSystemEntry[]),
          () => resolve([])
        )
      );
      if (!entries.length) break;
      for (const e of entries) {
        await collectFromEntry(e, nextBase, out, depth + 1);
        if (out.length >= MAX_FILES) return;
      }
    }
  }
}

/** Extract files (with folder paths) from a drop event — supports folders. */
async function filesFromDataTransfer(
  dt: DataTransfer
): Promise<DroppedFile[]> {
  const out: DroppedFile[] = [];
  const items = Array.from(dt.items ?? []);
  const entries = items
    .map((item) =>
      typeof item.webkitGetAsEntry === "function"
        ? item.webkitGetAsEntry()
        : null
    )
    .filter((e): e is FileSystemEntry => e !== null);

  if (entries.length > 0) {
    for (const entry of entries) {
      await collectFromEntry(entry, "", out);
    }
    if (out.length > 0) return out;
  }

  // Fallback: plain files (uses webkitRelativePath from folder-picker input)
  for (const f of Array.from(dt.files ?? [])) {
    const rel =
      (f as File & { webkitRelativePath?: string }).webkitRelativePath ||
      f.name;
    out.push({ file: f, relativePath: rel });
  }
  return out;
}

/** Group uploads by their top-level folder (screen name). */
function groupByScreen(uploads: UploadItem[]) {
  const groups = new Map<string, UploadItem[]>();
  for (const u of uploads) {
    const screen = u.filename.includes("/")
      ? u.filename.slice(0, u.filename.indexOf("/"))
      : "";
    const key = screen || "";
    const list = groups.get(key) ?? [];
    list.push(u);
    groups.set(key, list);
  }
  return Array.from(groups.entries());
}

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
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function uploadFiles(dropped: DroppedFile[]) {
    if (dropped.length === 0) {
      setError(
        "No supported files found (.md, .html, images). Stitch folders like 'Home Page/' work — system folders are skipped."
      );
      return;
    }
    setBusy(true);
    setError(null);
    let uploaded = 0;
    let failed = 0;
    try {
      for (const { file, relativePath } of dropped) {
        setProgress(`Uploading ${uploaded + 1}/${dropped.length} — ${relativePath}`);
        const form = new FormData();
        form.append("projectId", projectId);
        form.append("file", file);
        form.append("relativePath", relativePath);
        try {
          const res = await fetch("/api/uploads", { method: "POST", body: form });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `Upload failed: ${file.name}`);
          uploaded++;
        } catch {
          failed++;
        }
      }
      onUploaded();
      if (failed > 0) {
        setError(`${uploaded} uploaded, ${failed} failed (unsupported type or too large).`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      setProgress("");
      if (inputRef.current) inputRef.current.value = "";
      if (folderInputRef.current) folderInputRef.current.value = "";
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = await filesFromDataTransfer(e.dataTransfer);
    await uploadFiles(dropped);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        3. Upload Stitch Exports
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
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragOver
            ? "border-accent bg-primary/10"
            : "border-border hover:border-ring"
        }`}
      >
        <p className="text-sm text-foreground/80">
          {busy
            ? progress || "Uploading…"
            : "Drag & drop your Stitch export FOLDER here — or files"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Folders work: every screen stays grouped · .md · .html · .png · .jpg ·
          .webp
        </p>
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
            className="rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 hover:border-ring"
          >
            Choose files
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              folderInputRef.current?.click();
            }}
            className="rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 hover:border-ring"
          >
            Choose folder 📁
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".md,.markdown,.html,.htm,.png,.jpg,.jpeg,.webp,.gif"
          className="hidden"
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? []);
            await uploadFiles(
              files.map((f) => ({
                file: f,
                relativePath:
                  (f as File & { webkitRelativePath?: string })
                    .webkitRelativePath || f.name,
              }))
            );
          }}
        />
        <input
          ref={(el) => {
            folderInputRef.current = el;
            if (el) {
              // Not standard React props — set directly for folder picking
              el.setAttribute("webkitdirectory", "");
              el.setAttribute("directory", "");
            }
          }}
          type="file"
          multiple
          className="hidden"
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? []);
            await uploadFiles(
              files.map((f) => ({
                file: f,
                relativePath:
                  (f as File & { webkitRelativePath?: string })
                    .webkitRelativePath || f.name,
              }))
            );
          }}
        />
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {uploads.length > 0 && (
        <div className="mt-4 space-y-3">
          {groupByScreen(uploads).map(([screen, items]) => (
            <div key={screen || "_root"} className="rounded-lg bg-background p-3">
              <p className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                📁 {screen || "Loose files"}
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">
                  {items.length} file{items.length === 1 ? "" : "s"}
                </span>
              </p>
              <ul className="space-y-1.5">
                {items.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="truncate text-foreground/90">
                      {u.filename.includes("/")
                        ? u.filename.slice(u.filename.indexOf("/") + 1)
                        : u.filename}
                    </span>
                    <span className="ml-2 shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {TYPE_BADGE[u.type] ?? u.type}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
