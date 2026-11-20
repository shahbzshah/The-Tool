"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
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

// Doc kinds the align pass can regenerate from the locked stack — kept in
// sync with STACK_SENSITIVE_KINDS in src/lib/docgen.ts.
const ALIGN_KINDS = new Set([
  "TECHNICAL_SPEC",
  "FOLDER_STRUCTURE",
  "RULES",
  "MASTER_PROMPT",
  "BUILD_GUIDE",
  "ARCHITECTURE",
  "TASKS",
  "VOICE_SPEC",
  "SYNC_SPEC",
  "BRD",
  "DATABASE_SCHEMA",
]);

function ChecklistRow({
  ok,
  title,
  detail,
  pill,
  children,
}: {
  ok: boolean;
  title: string;
  detail: string;
  pill: string;
  children?: ReactNode;
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
        {children}
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

function PackChecklist({
  preview,
  ideaId,
  onRecheck,
}: {
  preview: PackPreview;
  ideaId: string;
  onRecheck: () => Promise<void> | void;
}) {
  const [fixOpen, setFixOpen] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixStep, setFixStep] = useState<string | null>(null);
  const [fixError, setFixError] = useState<string | null>(null);
  const [fixResult, setFixResult] = useState<string | null>(null);
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

  async function recheck() {
    setRechecking(true);
    try {
      await onRecheck();
    } finally {
      setRechecking(false);
    }
  }

  // The real fix: regenerate the disagreeing docs so they all derive from
  // the same locked stack and features. Stack-sensitive kinds go through
  // /api/docs/align (locked-stack pass); anything else (API_SPEC) is
  // regenerated directly. Old versions are snapshotted by docgen first, so
  // a fix can be undone from a doc's history. After regenerating, the
  // preview is re-loaded in place and the row shows the new count.
  const fixSteps = (() => {
    const seen = new Set<string>();
    const steps: { kind: string; via: "align" | "generate" }[] = [];
    for (const issue of blockingIssues) {
      for (const kind of issue.docs) {
        if (seen.has(kind)) continue;
        seen.add(kind);
        steps.push({
          kind,
          via: ALIGN_KINDS.has(kind) ? "align" : "generate",
        });
      }
    }
    return steps;
  })();

  async function fixNow() {
    if (fixSteps.length === 0) return;
    setFixing(true);
    setFixError(null);
    setFixResult(null);
    try {
      for (let i = 0; i < fixSteps.length; i++) {
        const step = fixSteps[i];
        setFixStep(
          `Regenerating ${step.kind} (${i + 1} of ${fixSteps.length})…`
        );
        const url =
          step.via === "align" ? "/api/docs/align" : "/api/docs/generate";
        // One automatic retry: a doc generation can exceed the AI timeout
        // when the model is slow (UI timed out twice at 120s on the Docs
        // page), and the second attempt usually lands.
        let lastErr: Error | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            if (attempt === 1)
              setFixStep(
                `Regenerating ${step.kind} (retrying…, ${i + 1} of ${fixSteps.length})…`
              );
            const res = await apiFetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ideaId, kind: step.kind }),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(
                data.error || `Could not regenerate ${step.kind}.`
              );
            }
            lastErr = null;
            break;
          } catch (err) {
            lastErr =
              err instanceof Error
                ? err
                : new Error(`Could not regenerate ${step.kind}.`);
          }
        }
        if (lastErr) throw lastErr;
      }
      setFixStep("Re-checking…");
      await onRecheck();
      setFixResult(
        `Regenerated ${fixSteps.length} doc${fixSteps.length === 1 ? "" : "s"} — see the row above for the new count.`
      );
    } catch (err) {
      setFixError(err instanceof Error ? err.message : "Fix failed.");
    } finally {
      setFixing(false);
      setFixStep(null);
    }
  }

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
      >
        {blockingIssues.length > 0 && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setFixOpen(!fixOpen)}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <span className="material-symbols text-[16px]">
                {fixOpen ? "expand_less" : "build"}
              </span>
              {fixOpen ? "Hide fix" : "Fix inline"}
            </button>
            {fixOpen && (
              <div className="mt-2 rounded-md border border-border bg-muted/50 p-3">
                <p className="text-xs leading-relaxed text-foreground">
                  Fix now regenerates the disagreeing docs from your locked
                  stack, so they all say the same thing. The old versions
                  are kept in each doc&apos;s history.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Will regenerate:{" "}
                  {fixSteps.map((s) => s.kind).join(", ")}.
                </p>
                {fixError && (
                  <p className="mt-2 text-xs font-medium text-score-medium">
                    {fixError}{" "}
                    {fixError.includes("stack lock") &&
                      "Pick the stack in Locked Decisions on the Docs page first, then come back and fix."}
                  </p>
                )}
                {fixResult && (
                  <p className="mt-2 text-xs font-medium text-score-high">
                    {fixResult}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={fixNow}
                    disabled={fixing || rechecking}
                    className="btn-primary min-h-[36px] px-3 text-xs"
                  >
                    <span className="material-symbols text-[16px]">
                      build
                    </span>
                    {fixing ? (fixStep ?? "Fixing…") : "Fix now"}
                  </button>
                  <button
                    type="button"
                    onClick={recheck}
                    disabled={rechecking || fixing}
                    className="btn-secondary min-h-[36px] px-3 text-xs"
                  >
                    <span className="material-symbols text-[16px]">
                      refresh
                    </span>
                    {rechecking ? "Re-checking…" : "Re-check now"}
                  </button>
                  <Link
                    href={`/docs/${ideaId}`}
                    className="btn-ghost min-h-[36px] px-3 text-xs"
                  >
                    Open Docs page
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </ChecklistRow>
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
  // GitHub upload — push the finished pack as a repo (one commit).
  type GhStatus = {
    connected: boolean;
    login: string | null;
    oauthConfigured: boolean;
    tokenInvalid?: boolean;
  };
  const [ghStatus, setGhStatus] = useState<GhStatus | null>(null);
  const [ghRepo, setGhRepo] = useState("");
  const [ghPrivate, setGhPrivate] = useState(true);
  const [ghPushing, setGhPushing] = useState(false);
  const [ghError, setGhError] = useState<string | null>(null);
  const [ghResult, setGhResult] = useState<{
    repoUrl: string;
    commitSha: string;
    filesPushed: number;
    created: boolean;
  } | null>(null);
  const [ghNotice, setGhNotice] = useState<string | null>(null);
  // showDirectoryPicker (File System Access) only exists in desktop
  // Chrome/Edge — Firefox, Safari and phone browsers don't have it, so the
  // Save to folder button is hidden there instead of failing on tap.
  const [folderSaveSupported, setFolderSaveSupported] = useState(false);

  useEffect(() => {
    setFolderSaveSupported(
      typeof window !== "undefined" && "showDirectoryPicker" in window
    );
  }, []);

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
      if (ideaRes.ok && ideaData.idea?.title) {
        // Default repo name for the GitHub push — same slug rule as the zip.
        setGhRepo(
          String(ideaData.idea.title)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40) || "project"
        );
      }
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
    // GitHub connection state — non-admins get a 403 and simply don't
    // see the upload section.
    apiFetch("/api/github/status")
      .then(async (r) => {
        if (!r.ok) return;
        const d = await r.json().catch(() => null);
        if (d) {
          setGhStatus(d);
          if (d.tokenInvalid) {
            setGhError("GitHub rejected the saved token — reconnect and try again.");
          }
        }
      })
      .catch(() => {
        // ignore
      });
    // Result of the OAuth connect flow, which redirects back here.
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search);
      if (q.get("github") === "connected") {
        setGhNotice("GitHub connected.");
      } else if (q.get("github") === "error") {
        setGhError(q.get("msg") || "GitHub sign-in did not complete.");
      }
    }
  }, [load]);

  async function disconnectGh() {
    try {
      await apiFetch("/api/github/disconnect", { method: "POST" });
      setGhStatus((s) =>
        s ? { ...s, connected: false, login: null } : s
      );
      setGhResult(null);
    } catch {
      // ignore
    }
  }

  async function pushToGitHub() {
    if (!idea) return;
    setGhPushing(true);
    setGhError(null);
    setGhResult(null);
    try {
      const res = await apiFetch("/api/github/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ideaId,
          tool: selected,
          repo: ghRepo.trim(),
          isPrivate: ghPrivate,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "GitHub push failed.");
      setGhResult(data);
    } catch (err) {
      setGhError(err instanceof Error ? err.message : "GitHub push failed.");
    } finally {
      setGhPushing(false);
    }
  }

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
              <PackChecklist preview={preview} ideaId={ideaId} onRecheck={load} />
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
              {folderSaveSupported && (
                <button
                  onClick={saveToFolder}
                  disabled={downloading || docCount === 0}
                  className="btn-secondary min-h-[48px] w-full"
                >
                  <span className="material-symbols text-[20px]">folder</span>
                  {downloading ? "Writing files…" : "Save to folder"}
                </button>
              )}
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
            {folderSaveSupported && (
              <p className="mt-4 text-xs text-muted-foreground">
                “Save to folder” works in Chrome/Edge — pick a folder and the
                files are written there directly, no unzipping needed.
              </p>
            )}
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

        {ghStatus && (
          <section className="card-paper mt-6 p-4 md:p-6">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="flex items-center gap-2 font-serif text-xl font-medium text-foreground">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-primary font-mono text-[11px] font-bold text-primary-foreground">
                  5
                </span>
                Upload to GitHub
              </h2>
              {ghStatus.connected && ghStatus.login && (
                <span className="pill border border-score-high/30 bg-score-high/10 text-score-high">
                  <span className="h-1.5 w-1.5 rounded-full bg-score-high" />
                  Connected as {ghStatus.login}
                </span>
              )}
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Push this pack to GitHub as a repository — the same files as
              the zip, in one commit, so you can clone it straight into{" "}
              {tool.name}. Upload again later and it pushes a new commit
              updating the same repo.
            </p>
            {!ghStatus.connected && !ghStatus.oauthConfigured ? (
              <p className="rounded-md border border-score-medium/40 bg-score-medium/10 px-3 py-2 text-sm text-foreground">
                GitHub isn&apos;t set up yet — add the OAuth App Client ID
                and Secret in{" "}
                <Link href="/settings" className="underline">
                  Settings
                </Link>{" "}
                first, then connect here.
              </p>
            ) : !ghStatus.connected ? (
              <button
                onClick={() => {
                  window.location.href = `/api/github/auth?returnTo=${encodeURIComponent(`/export/${ideaId}`)}`;
                }}
                className="btn-secondary min-h-[48px]"
              >
                <span className="material-symbols text-[20px]">link</span>
                Connect GitHub
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="flex-1">
                    <span className="label-caps text-muted-foreground">
                      Repository name
                    </span>
                    <input
                      value={ghRepo}
                      onChange={(e) => setGhRepo(e.target.value)}
                      className="input-paper mt-1 w-full font-mono text-sm"
                      aria-label="Repository name"
                    />
                  </label>
                  <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={ghPrivate}
                      onChange={(e) => setGhPrivate(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Private
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={pushToGitHub}
                    disabled={ghPushing || docCount === 0 || !ghRepo.trim()}
                    className="btn-primary min-h-[48px]"
                  >
                    <span className="material-symbols text-[20px]">upload</span>
                    {ghPushing ? "Pushing to GitHub…" : "Upload to GitHub"}
                  </button>
                  <button
                    onClick={disconnectGh}
                    disabled={ghPushing}
                    className="btn-ghost min-h-[48px] px-4"
                  >
                    Disconnect
                  </button>
                </div>
                {ghResult && (
                  <p className="flex flex-wrap items-center gap-1.5 rounded-md border border-score-high/30 bg-score-high/10 px-3 py-2 text-sm text-score-high">
                    <span className="material-symbols text-[18px]">
                      check_circle
                    </span>
                    <span>
                      Pushed {ghResult.filesPushed} files{" "}
                      {ghResult.created
                        ? "to a new repo"
                        : "as a new commit"}{" "}
                      —{" "}
                      <a
                        href={ghResult.repoUrl}
                        target="_blank"
                        rel="noopener"
                        className="underline"
                      >
                        Open on GitHub
                      </a>{" "}
                      · commit {ghResult.commitSha.slice(0, 7)}
                    </span>
                  </p>
                )}
              </div>
            )}
            {ghNotice && (
              <p className="mt-3 rounded-md border border-score-high/30 bg-score-high/10 px-3 py-2 text-sm text-score-high">
                {ghNotice}
              </p>
            )}
            {ghError && (
              <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {ghError}
              </p>
            )}
          </section>
        )}

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
