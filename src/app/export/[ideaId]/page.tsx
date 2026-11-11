"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { EXPORT_TOOLS, type ExportToolId } from "@/lib/exporters";
import { DOC_KINDS } from "@/lib/constants";
import { apiFetch } from "@/lib/api";

const TOOL_ICONS: Record<ExportToolId, string> = {
  vscode: "code",
  cursor: "code",
  claude: "auto_awesome",
  copilot: "assistant",
  windsurf: "sailing",
  bolt: "bolt",
  lovable: "favorite",
  v0: "terminal",
};

type PreviewDoc = { kind: string; label: string; present: boolean; stale: boolean };
type ConsistencyIssueLike = { type: string; severity: string; message: string; docs: string[] };
type PackPreview = {
  platform: string | null;
  docs: PreviewDoc[];
  applicableKinds?: string[];
  consistency?: { ok: boolean; issues: ConsistencyIssueLike[]; missingKinds: string[] };
  scaffoldFiles?: string[];
  refinedBrief: boolean;
  uploads: { total: number; includable: number };
  skills: { names: string[]; status: "cached" | "will-download"; cachedCount: number };
};

function ChecklistRow({
  ok,
  title,
  detail,
  pill,
}: {
  ok: boolean;
  title: string;
  detail: string;
  pill: string;
}) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span
        className={`material-symbols mt-0.5 text-[22px] ${
          ok ? "text-score-high" : "text-score-medium"
        }`}
      >
        {ok ? "check_circle" : "warning"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
      <span
        className={`pill shrink-0 border ${
          ok
            ? "border-score-high/30 bg-score-high/10 text-score-high"
            : "border-score-medium/30 bg-score-medium/10 text-score-medium"
        }`}
      >
        {pill}
      </span>
    </li>
  );
}

function PackChecklist({ preview }: { preview: PackPreview }) {
  const applicableSet = preview.applicableKinds
    ? new Set(preview.applicableKinds)
    : null;
  const applicableDocs = preview.docs.filter(
    (d) => !applicableSet || applicableSet.has(d.kind)
  );
  const docsPresent = applicableDocs.filter((d) => d.present);
  const docsMissing = applicableDocs.filter((d) => !d.present);
  const docsOk = docsMissing.length === 0;
  const applicableTotal = applicableSet
    ? applicableSet.size
    : DOC_KINDS.length;
  const uploads = preview.uploads;
  const uploadsOk = uploads.includable > 0;
  const skillsOk = preview.skills.status === "cached";
  const consistency = preview.consistency;
  const consistencyOk = consistency ? consistency.ok : true;
  const blockingIssues = consistency
    ? consistency.issues.filter((i) => i.severity === "blocking")
    : [];

  return (
    <ul className="divide-y divide-border">
      <ChecklistRow
        ok={docsOk}
        title={
          docsOk
            ? `All ${applicableTotal} documents in the pack`
            : `${docsPresent.length}/${applicableTotal} documents in the pack`
        }
        detail={
          docsOk
            ? "Every required doc kind is generated."
            : `Missing: ${docsMissing.map((d) => d.label).join(", ")}`
        }
        pill={docsOk ? "Complete" : `${docsMissing.length} missing`}
      />
      <ChecklistRow
        ok={consistencyOk}
        title={
          consistencyOk
            ? "Documents agree with each other"
            : `${blockingIssues.length} contradiction(s) across documents`
        }
        detail={
          consistencyOk
            ? "No conflicting database, endpoint, table, or locked-decision claims found."
            : blockingIssues.map((i) => i.message).join(" ")
        }
        pill={
          consistencyOk
            ? "No conflicts"
            : `${blockingIssues.length} conflict${blockingIssues.length === 1 ? "" : "s"}`
        }
      />
      <ChecklistRow
        ok
        title="Scaffold files included"
        detail={
          preview.scaffoldFiles
            ? `${preview.scaffoldFiles.join(", ")} are generated from the pack's own documents — no AI call, no download.`
            : ".env.example and .gitignore are generated from the pack's own documents."
        }
        pill="Included"
      />
      <ChecklistRow
        ok={preview.refinedBrief}
        title={
          preview.refinedBrief
            ? "Refined brief present"
            : "No refined brief"
        }
        detail={
          preview.refinedBrief
            ? "The Refine decisions record is included."
            : "Approve one from Refine and generate REFINED_BRIEF.md to include it."
        }
        pill={preview.refinedBrief ? "Included" : "Missing"}
      />
      <ChecklistRow
        ok={uploadsOk}
        title={
          uploads.total === 0
            ? "No design uploads"
            : uploadsOk
              ? `${uploads.includable} design file(s) included`
              : "Design uploads not includable"
        }
        detail={
          uploads.total === 0
            ? "Nothing from Design to include."
            : uploadsOk
              ? uploads.includable < uploads.total
                ? `${uploads.total - uploads.includable} screenshot(s) have no stored content and are skipped.`
                : "From your Stitch design exports."
              : `${uploads.total} upload(s) exist but carry no stored content, so nothing is included.`
        }
        pill={
          uploads.total === 0
            ? "None"
            : uploadsOk
              ? `${uploads.includable} included`
              : "Skipped"
        }
      />
      <ChecklistRow
        ok={skillsOk}
        title={
          skillsOk
            ? `${preview.skills.names.length} agent skills ready`
            : `${preview.skills.names.length} agent skills selected`
        }
        detail={
          skillsOk
            ? "Bundled with the app — included in every export, no download needed."
            : "Will be downloaded from addyosmani/agent-skills when you export. If the download fails, the pack still builds without them."
        }
        pill={skillsOk ? "Bundled" : "Download"}
      />
    </ul>
  );
}

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
  const [preview, setPreview] = useState<PackPreview | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ideaRes, docsRes, previewRes] = await Promise.all([
        apiFetch(`/api/ideas/${ideaId}`),
        apiFetch(`/api/docs?ideaId=${ideaId}`),
        apiFetch(`/api/export/preview?ideaId=${ideaId}`),
      ]);
      const [ideaData, docsData, previewData] = await Promise.all([
        ideaRes.json(),
        docsRes.json(),
        previewRes.json(),
      ]);
      if (ideaRes.ok) setIdea(ideaData.idea);
      if (docsRes.ok) setDocCount((docsData.docs ?? []).length);
      if (previewRes.ok) setPreview(previewData);
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
      const res = await apiFetch("/api/export/zip", {
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

  const shareUrl =
    shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/share/${shareToken}`
      : null;

  async function createShare() {
    if (!idea) return;
    setShareBusy(true);
    setShareError(null);
    setShareCopied(false);
    try {
      const res = await apiFetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: idea.projectId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not create the share link.");
      setShareToken(data.token);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Could not create the share link.");
    } finally {
      setShareBusy(false);
    }
  }

  async function revokeShare() {
    if (!shareToken) return;
    setShareBusy(true);
    setShareError(null);
    try {
      const res = await apiFetch("/api/share", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: shareToken }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not revoke the share link.");
      }
      setShareToken(null);
      setShareCopied(false);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Could not revoke the share link.");
    } finally {
      setShareBusy(false);
    }
  }

  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
    } catch {
      setShareError("Copy failed — select the link and copy it manually.");
    }
  }

  const staleDocs = preview ? preview.docs.filter((d) => d.present && d.stale) : [];
  const consistencyBlocking = preview?.consistency
    ? preview.consistency.issues.filter((i) => i.severity === "blocking").length
    : null;
  const applicableSet = preview?.applicableKinds
    ? new Set(preview.applicableKinds)
    : null;
  const applicableTotal = applicableSet
    ? applicableSet.size
    : DOC_KINDS.length;
  const applicablePresent = preview
    ? preview.docs.filter(
        (d) => d.present && (!applicableSet || applicableSet.has(d.kind))
      ).length
    : docCount;
  const docsReady = preview
    ? applicablePresent === applicableTotal
    : docCount === DOC_KINDS.length;

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
      const res = await apiFetch("/api/export/zip", {
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
    <main className="mx-auto max-w-[1200px] px-4 py-6 md:px-8 md:py-12">
      <div>
        <div className="mb-6 text-sm">
          <Link
            href={`/docs/${idea.id}`}
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <span className="material-symbols text-[18px]">arrow_back</span>
            Back to Docs
          </Link>
        </div>

        <header className="mb-8">
          <p className="label-caps mb-2 text-primary">Step 05 // Pipeline</p>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-serif text-3xl tracking-tight text-foreground md:text-4xl">
                {docsReady
                  ? "Your build pack is ready"
                  : `${applicablePresent} of ${applicableTotal} docs generated`}
              </h1>
              <p className="mt-2 text-muted-foreground">
                Pack for <span className="text-foreground">{idea.title}</span> —{" "}
                <span className="font-mono text-sm">
                  {applicablePresent}/{applicableTotal} docs
                </span>{" "}
                included
              </p>
            </div>
            {preview && (
              <span
                className={`pill shrink-0 border ${
                  docsReady
                    ? "border-score-high/40 bg-score-high/10 text-score-high"
                    : "border-score-medium/40 bg-score-medium/10 text-score-medium"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    docsReady ? "bg-score-high" : "bg-score-medium"
                  }`}
                />
                {applicablePresent} of {applicableTotal} docs ready
              </span>
            )}
          </div>
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

        <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="card-paper p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="label-caps text-muted-foreground">Documents</p>
              <span className="material-symbols text-[20px] text-primary">
                description
              </span>
            </div>
            <p className="mt-2 font-mono text-2xl leading-none text-foreground">
              {applicablePresent}/{applicableTotal}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              required docs generated
            </p>
          </div>
          <div className="card-paper p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="label-caps text-muted-foreground">Target tool</p>
              <span className="material-symbols text-[20px] text-primary">
                smart_toy
              </span>
            </div>
            <p className="mt-2 font-serif text-2xl leading-none text-primary">
              {tool.name}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {tool.tagline}
            </p>
          </div>
          <div className="card-paper p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="label-caps text-muted-foreground">Format</p>
              <span className="material-symbols text-[20px] text-primary">
                folder_zip
              </span>
            </div>
            <p className="mt-2 font-mono text-2xl leading-none text-foreground">
              .zip
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              build pack archive
            </p>
          </div>
          <div className="card-paper p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="label-caps text-muted-foreground">Consistency</p>
              <span className="material-symbols text-[20px] text-primary">
                verified
              </span>
            </div>
            <p
              className={`mt-2 font-mono text-2xl leading-none ${
                consistencyBlocking === null
                  ? "text-muted-foreground"
                  : consistencyBlocking === 0
                    ? "text-score-high"
                    : "text-score-medium"
              }`}
            >
              {consistencyBlocking === null ? "—" : consistencyBlocking}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {consistencyBlocking === null
                ? "consistency not checked yet"
                : consistencyBlocking === 0
                  ? "no contradictions across documents"
                  : "contradiction(s) across documents"}
            </p>
          </div>
        </div>

        <section className="mb-6">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 font-serif text-xl font-medium text-foreground">
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-primary font-mono text-[11px] font-bold text-primary-foreground">
                1
              </span>
              Pick your AI coding tool
            </h2>
            <p className="label-caps text-muted-foreground">
              Presets adapt system instructions &amp; scaffolding
            </p>
          </div>
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
                  <span className="flex items-start justify-between gap-2">
                    <span
                      className={`material-symbols text-[24px] ${
                        active ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {TOOL_ICONS[t.id]}
                    </span>
                    {active && (
                      <span className="material-symbols text-[20px] text-primary">
                        check_circle
                      </span>
                    )}
                  </span>
                  <div className="mt-2 text-sm font-semibold text-foreground">
                    {t.name}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t.tagline}
                  </div>
                  {active && (
                    <span className="pill mt-3 border border-primary/30 bg-primary/10 text-primary">
                      Selected
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {preview && (
            <section className="card-paper p-4 md:p-6">
              <h2 className="mb-1 flex items-center gap-2 font-serif text-xl font-medium text-foreground">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-primary font-mono text-[11px] font-bold text-primary-foreground">
                  2
                </span>
                Pack checklist
              </h2>
              <p className="mb-2 text-sm text-muted-foreground">
                What the pack will contain. Gaps are informational — you can
                still download.
              </p>
              <PackChecklist preview={preview} />
              {staleDocs.length > 0 && (
                <div className="mt-4 rounded-md border border-score-medium/40 bg-score-medium/10 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-score-medium">
                    <span className="material-symbols text-[15px]">warning</span>
                    {staleDocs.length} doc{staleDocs.length > 1 ? "s" : ""} may
                    be outdated
                  </p>
                  <ul className="space-y-1.5">
                    {staleDocs.map((d) => (
                      <li
                        key={d.kind}
                        className="flex items-start gap-1.5 text-xs text-foreground"
                      >
                        <span className="material-symbols mt-px shrink-0 text-[14px] text-score-medium">
                          warning
                        </span>
                        <span>
                          <span className="font-medium">{d.label}</span> — May
                          be outdated — idea changed since generation
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <section className="card-elevated p-4 md:p-6">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="flex items-center gap-2 font-serif text-xl font-medium text-foreground">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-primary font-mono text-[11px] font-bold text-primary-foreground">
                  3
                </span>
                Download the pack
              </h2>
              <p className="label-caps text-muted-foreground">
                Immediate local handoff
              </p>
            </div>
            <p className="mb-5 text-sm text-muted-foreground">
              <span className="text-foreground">{tool.name}</span>: {tool.usage}
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={download}
                disabled={downloading || docCount === 0}
                className="btn-primary min-h-[48px] w-full"
              >
                <span className="material-symbols text-[20px]">download</span>
                {downloading ? "Building zip…" : `Download ${tool.name} pack`}
              </button>
              <button
                onClick={saveToFolder}
                disabled={downloading || docCount === 0}
                className="btn-secondary min-h-[48px] w-full"
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
        </div>

        <section className="card-paper mt-6 p-4 md:p-6">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 font-serif text-xl font-medium text-foreground">
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-primary font-mono text-[11px] font-bold text-primary-foreground">
                4
              </span>
              Share a public link
            </h2>
            {shareToken && (
              <span className="pill border border-score-high/30 bg-score-high/10 text-score-high">
                <span className="h-1.5 w-1.5 rounded-full bg-score-high" />
                Link active
              </span>
            )}
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Create a read-only public link showing the approved idea and all
            generated documents. Anyone with the link can view it — no sign-in
            needed. Revoke it any time.
          </p>
          {!shareToken ? (
            <button
              onClick={createShare}
              disabled={shareBusy}
              className="btn-secondary min-h-[48px]"
            >
              <span className="material-symbols text-[20px]">link</span>
              {shareBusy ? "Creating link…" : "Create share link"}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  readOnly
                  value={shareUrl ?? ""}
                  onFocus={(e) => e.target.select()}
                  className="input-paper flex-1 font-mono text-xs"
                  aria-label="Public share link"
                />
                <div className="flex gap-2">
                  <button
                    onClick={copyShareLink}
                    className="btn-secondary min-h-[44px] flex-1 px-4 sm:flex-none"
                  >
                    <span className="material-symbols text-[18px]">
                      {shareCopied ? "check" : "content_copy"}
                    </span>
                    {shareCopied ? "Copied" : "Copy"}
                  </button>
                  <button
                    onClick={revokeShare}
                    disabled={shareBusy}
                    className="btn-ghost min-h-[44px] flex-1 px-4 sm:flex-none"
                  >
                    <span className="material-symbols text-[18px]">
                      link_off
                    </span>
                    {shareBusy ? "Revoking…" : "Revoke"}
                  </button>
                </div>
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="material-symbols text-[15px]">public</span>
                Public — this link works for anyone, even without an account.
              </p>
            </div>
          )}
          {shareError && (
            <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {shareError}
            </p>
          )}
        </section>

        <div className="mt-10 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href={`/docs/${ideaId}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <span className="material-symbols text-[18px]">arrow_back</span>
            Back to Docs
          </Link>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/history"
              className="btn-secondary min-h-[44px] w-full sm:w-auto"
            >
              <span className="material-symbols text-[18px]">history</span>
              View in Project History
            </Link>
            <Link
              href="/"
              className="btn-primary min-h-[44px] w-full sm:w-auto"
            >
              Restart with New Opportunity
              <span className="material-symbols text-[18px]">arrow_forward</span>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
