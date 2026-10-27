"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

type StitchPrompt = {
  id: string;
  projectId: string;
  promptText: string;
  appType: string;
  screens: string;
  colorScheme: string;
  style: string;
  components: string;
  platform: string;
};

type StitchReview = {
  alignmentScore: number;
  matches: string[];
  gaps: string[];
  recommendations: string[];
};

type DesignUpload = {
  id: string;
  type: string;
  filename: string;
  batchId: string | null;
  createdAt: string;
};

type DesignVersion = {
  key: string;
  uploads: DesignUpload[];
  firstAt: string; // earliest createdAt in the batch — versions order by this
};

/**
 * Coverage heuristic (deliberately simple, advisory only — every row has a
 * manual override for when it's wrong): a feature counts as "covered" when
 * some uploaded screen filename contains the feature's full text, or any
 * significant word (4+ chars) from the feature — compared case-insensitively.
 * E.g. feature "Push notifications for price drops" matches
 * "notifications/index.html" via the word "notifications".
 */
function heuristicCoverage(
  feature: string,
  screens: DesignUpload[]
): { covered: boolean; matched: string | null } {
  const f = feature.toLowerCase();
  const words = f.split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
  for (const s of screens) {
    const name = s.filename.toLowerCase();
    if (name.includes(f) || words.some((w) => name.includes(w))) {
      return { covered: true, matched: s.filename };
    }
  }
  return { covered: false, matched: null };
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function parseArr(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * Read a JSON API response. When the AI call times out, Vercel answers with
 * plain text ("An error occurred...") instead of JSON — parsing that with
 * res.json() throws the raw "Unexpected token 'A'..." crash. Reading text
 * first turns it into a clean retry message instead.
 */
async function readJson<T>(res: Response, timeoutMessage: string): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(timeoutMessage);
  }
}

function ElementCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-paper p-4">
      <h3 className="label-caps mb-2 text-primary">{title}</h3>
      {children}
    </div>
  );
}

export default function StitchPromptPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const searchParams = useSearchParams();
  const ideaId = searchParams.get("idea");

  const [prompt, setPrompt] = useState<StitchPrompt | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<StitchReview | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [uploads, setUploads] = useState<DesignUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [features, setFeatures] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});
  const [aiResults, setAiResults] = useState<Record<number, { covered: boolean; matchedFile: string | null; reason: string }>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");

  // Preview viewer state.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewMode, setPreviewMode] = useState<"phone" | "desktop">("phone");
  const [previewContents, setPreviewContents] = useState<Record<string, string>>({});
  const [previewItems, setPreviewItems] = useState<(DesignUpload & { isScreenshot: boolean })[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  async function analyzeWithAi() {
    if (analyzing) return;
    setAnalyzing(true);
    setAnalyzeError("");
    try {
      const r = await apiFetch("/api/design/analyze-coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const d = await readJson<{
        results: { covered: boolean; matchedFile: string | null; reason: string }[];
        error?: string;
      }>(r, "Analysis timed out — try again.");
      if (!r.ok) throw new Error(d.error || "Analysis failed");
      const next: Record<number, { covered: boolean; matchedFile: string | null; reason: string }> = {};
      d.results.forEach((res: { covered: boolean; matchedFile: string | null; reason: string }, i: number) => {
        next[i] = res;
      });
      setAiResults(next);
      // Clear manual overrides so AI results show; user can re-override after.
      setOverrides({});
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }


  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Item 9: project-wide AI token usage, shown muted in the header.
  const [tokensUsed, setTokensUsed] = useState<string | null>(null);

  const loadUploads = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/uploads?projectId=${projectId}`);
      const data = await res.json();
      setUploads(data.uploads ?? []);
    } catch {
      // ignore
    }
  }, [projectId]);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/stitch-prompt?projectId=${projectId}`);
      const data = await res.json();
      const existing = data.prompt ?? null;
      setPrompt(existing);
      setFeatures(Array.isArray(data.features) ? data.features : []);
      // No prompt yet → generate it automatically; it's a required step.
      if (!existing) {
        setGenerating(true);
        try {
          const gen = await apiFetch("/api/stitch-prompt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId }),
          });
          const genData = await readJson<{ prompt: StitchPrompt; error?: string }>(
            gen,
            "Generation timed out — try again."
          );
          if (!gen.ok) throw new Error(genData.error || "Generation failed.");
          setPrompt(genData.prompt);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Something went wrong.");
        } finally {
          setGenerating(false);
        }
      }
    } catch {
      // ignore — treat as no prompt yet
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
    loadUploads();
    // Item 9: project-wide AI token usage (advisory — the page works without it).
    apiFetch(`/api/usage?projectId=${projectId}`)
      .then(async (r) => {
        if (!r.ok) return;
        const d = await r.json().catch(() => null);
        if (d && typeof d.display === "string") setTokensUsed(d.display);
      })
      .catch(() => {
        // ignore
      });
  }, [load, loadUploads, projectId]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await apiFetch("/api/stitch-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await readJson<{ prompt: StitchPrompt; error?: string }>(
        res,
        "Generation timed out — try again."
      );
      if (!res.ok) throw new Error(data.error || "Generation failed.");
      setPrompt(data.prompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setGenerating(false);
    }
  }

  async function copyPrompt() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt.promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Clipboard blocked — select the text and copy manually.");
    }
  }

  async function deleteUpload(id: string) {
    try {
      const res = await apiFetch(`/api/uploads?id=${id}`, { method: "DELETE" });
      if (res.ok) setUploads((prev) => prev.filter((u) => u.id !== id));
    } catch {
      // ignore
    }
  }

  async function runReview() {
    setReviewing(true);
    setError(null);
    try {
      const res = await apiFetch("/api/stitch-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const text = await res.text();
      let data: { review?: StitchReview; error?: string };
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Review timed out — try again.");
      }
      if (!res.ok) throw new Error(data.error || "Review failed.");
      setReview(data.review ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setReviewing(false);
    }
  }

  // Group uploads into design versions: every zip import shares one batchId.
  // Older uploads with no batchId are grouped together as "Version 1".
  // Versions order oldest → newest; the newest is the "current" one.
  const versions: DesignVersion[] = useMemo(() => {
    const byKey = new Map<string, DesignUpload[]>();
    for (const u of uploads) {
      const key = u.batchId ?? "legacy";
      const list = byKey.get(key) ?? [];
      list.push(u);
      byKey.set(key, list);
    }
    return [...byKey.entries()]
      .map(([key, list]) => {
        const sorted = [...list].sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt)
        );
        return {
          key,
          uploads: sorted,
          firstAt: sorted.reduce(
            (m, u) => (u.createdAt < m ? u.createdAt : m),
            sorted[0].createdAt
          ),
        };
      })
      .sort((a, b) => a.firstAt.localeCompare(b.firstAt));
  }, [uploads]);

  const currentVersion: DesignVersion | null =
    versions.find((v) => v.key === selectedKey) ??
    versions[versions.length - 1] ??
    null;
  const visibleUploads = currentVersion?.uploads ?? [];

  // Feature coverage against the currently shown version's screens.
  // Advisory only — Docs stays accessible regardless.
  const coverage = useMemo(
    () =>
      features.map((feature, i) => {
        const ai = aiResults[i];
        const auto = ai
          ? { covered: ai.covered, matched: ai.matchedFile }
          : heuristicCoverage(feature, visibleUploads);
        const manual = overrides[i];
        return {
          feature,
          covered: manual ?? auto.covered,
          auto: auto.covered,
          overridden: manual !== undefined,
          matched: auto.matched,
          aiReason: ai?.reason || null,
          fromAi: !!ai,
        };
      }),
    [features, visibleUploads, overrides, aiResults]
  );

  // Preview: fetch HTML content for the visible uploads and open the viewer.
  async function openPreview(startIndex: number) {
    setPreviewIndex(0);
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const screenshotUploads = visibleUploads.filter((u) => u.type === "screenshot");
      const htmlUploads = visibleUploads.filter((u) => u.type === "html");
      // Prefer screenshots — they're pixel-perfect. Fall back to HTML.
      const useScreenshots = screenshotUploads.length > 0;
      const items = useScreenshots ? screenshotUploads : htmlUploads;

      const contents: Record<string, string> = {};
      await Promise.all(
        items.map(async (u) => {
          if (previewContents[u.id]) {
            contents[u.id] = previewContents[u.id];
            return;
          }
          const r = await apiFetch(`/api/uploads/${u.id}`);
          const d = await r.json();
          if (d.upload?.content) {
            contents[u.id] = useScreenshots
              ? d.upload.content
              : inlineCss(d.upload.content, await fetchCssMap());
          }
        })
      );
      setPreviewContents((prev) => ({ ...prev, ...contents }));
      setPreviewItems(items.map((u) => ({ ...u, isScreenshot: useScreenshots })));
      // Auto-detect phone vs desktop (screenshots are usually phone-sized).
      if (useScreenshots) {
        setPreviewMode("phone");
      } else {
        const first = htmlUploads[startIndex] || htmlUploads[0];
        const html = contents[first?.id] || "";
        const looksMobile =
          /viewport[^>]*width\s*=\s*device-width/i.test(html) ||
          /max-width\s*:\s*(3\d\d|4\d\d)px/i.test(html) ||
          /iPhone|Android|mobile/i.test(html);
        setPreviewMode(looksMobile ? "phone" : "desktop");
      }
    } catch {
      // Leave viewer open; missing screens show a fallback.
    } finally {
      setPreviewLoading(false);
    }
  }

  async function fetchCssMap(): Promise<Record<string, string>> {
    const cssUploads = visibleUploads.filter((u) => u.type === "css");
    const cssByName: Record<string, string> = {};
    await Promise.all(
      cssUploads.map(async (u) => {
        const r = await apiFetch(`/api/uploads/${u.id}`);
        const d = await r.json();
        if (d.upload?.content) {
          const base = u.filename.split("/").pop() || u.filename;
          cssByName[base.toLowerCase()] = d.upload.content;
          cssByName[u.filename.toLowerCase()] = d.upload.content;
        }
      })
    );
    return cssByName;
  }

  /**
   * Inline external CSS: replace <link rel="stylesheet" href="x.css">
   * with <style>…</style> using the uploaded CSS contents.
   */
  function inlineCss(html: string, cssByName: Record<string, string>): string {
    let out = html.replace(
      /<link[^>]+rel=["']stylesheet["'][^>]*>/gi,
      (tag) => {
        const m = tag.match(/href=["']([^"']+)["']/i);
        if (!m) return "";
        const href = m[1].split("/").pop() || m[1];
        const css = cssByName[href.toLowerCase()] || cssByName[m[1].toLowerCase()];
        return css ? `<style>${css}</style>` : "";
      }
    );
    // If the HTML uses Tailwind utility classes but has no Tailwind script,
    // inject the Play CDN so the design actually renders styled.
    const usesTailwindClasses = /\b(flex|grid|rounded|bg-|text-|p-\d|m-\d|gap-|items-|justify-)\b/.test(out);
    const hasTailwind = /cdn\.tailwindcss\.com|tailwind/i.test(out);
    if (usesTailwindClasses && !hasTailwind) {
      out = out.replace(
        /<\/head>/i,
        `<script src="https://cdn.tailwindcss.com"></script></head>`
      );
      // If there was no <head>, prepend it.
      if (out === html.replace(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi, "")) {
        out = `<script src="https://cdn.tailwindcss.com"></script>` + out;
      }
    }
    return out;
  }

  function closePreview() {
    setPreviewOpen(false);
  }

  // Keyboard navigation for the preview viewer.
  useEffect(() => {
    if (!previewOpen) return;
    function onKey(e: KeyboardEvent) {
      const htmlScreens = visibleUploads.filter((u) => u.type === "html");
      if (e.key === "Escape") closePreview();
      if (e.key === "ArrowRight")
        setPreviewIndex((i) => Math.min(i + 1, htmlScreens.length - 1));
      if (e.key === "ArrowLeft") setPreviewIndex((i) => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewOpen, visibleUploads]);
  const coveredCount = coverage.filter((c) => c.covered).length;
  const readyForDocs = features.length > 0 && coveredCount === features.length;

  function toggleOverride(i: number) {
    setOverrides((prev) => ({
      ...prev,
      [i]: !(prev[i] ?? coverage[i].covered),
    }));
  }

  function clearOverride(i: number) {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[i];
      return next;
    });
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-[1200px] px-4 py-16 text-center text-muted-foreground md:px-8">
        Loading…
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6 md:px-8 md:py-12">
      <div className="mx-auto max-w-4xl">
        {/* Strict pipeline: Refine → Design → Docs */}
        <Link
          href={ideaId ? `/refine/${projectId}?idea=${ideaId}` : "/"}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <span className="material-symbols text-[18px]">arrow_back</span>
          Back to Refine
        </Link>

        <header className="mb-8 mt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="label-caps text-primary">Step 3 — Design</p>
            {/* Item 9: project-wide AI token usage */}
            {tokensUsed && (
              <span
                className="font-mono text-[11px] text-muted-foreground"
                title="Total AI tokens logged for this project"
              >
                {tokensUsed} tokens used
              </span>
            )}
          </div>
          <h1 className="mb-2 font-serif text-3xl tracking-tight text-foreground md:text-4xl">
            Stitch Prompt Generator
          </h1>
          <p className="text-muted-foreground">
            Copy the prompt below into Google Stitch to design your app&apos;s UI.
          </p>
        </header>

        {!prompt && !generating && error && (
          <section className="card-elevated mx-auto max-w-xl p-8 text-center">
            <p className="mb-6 text-muted-foreground">
              The prompt couldn&apos;t be generated.
            </p>
            <button onClick={generate} className="btn-primary">
              <span className="material-symbols text-[20px]">refresh</span>
              Try again
            </button>
            <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          </section>
        )}

        {generating && (
          <p className="text-center text-muted-foreground">
            Designing your prompt… (this can take up to a minute)
          </p>
        )}

        {prompt && (
          <section className="space-y-6">
            <div className="card-elevated p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="label-caps text-muted-foreground">
                  Your Stitch prompt
                </h2>
                <button onClick={copyPrompt} className="btn-secondary !px-4 !py-1.5 !text-sm">
                  <span className="material-symbols text-[18px]">
                    {copied ? "check" : "content_copy"}
                  </span>
                  {copied ? "Copied!" : "Copy prompt"}
                </button>
              </div>
              <p className="whitespace-pre-wrap rounded-md border border-border bg-background p-4 font-mono text-sm leading-relaxed text-foreground/90">
                {prompt.promptText}
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button
                  onClick={async () => {
                    await copyPrompt();
                    window.open("https://stitch.withgoogle.com/", "_blank", "noopener");
                  }}
                  className="btn-primary min-h-[48px] w-full justify-center sm:w-auto"
                >
                  <span className="material-symbols text-[20px]">open_in_new</span>
                  {copied ? "Copied! Opening Stitch…" : "Copy prompt & Open Stitch"}
                </button>
                <button
                  onClick={generate}
                  disabled={generating}
                  className="btn-ghost min-h-[44px] w-full justify-center sm:w-auto"
                >
                  <span className="material-symbols text-[20px]">refresh</span>
                  Regenerate
                </button>
              </div>
              {error && (
                <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <ElementCard title="App type">{prompt.appType}</ElementCard>
              <ElementCard title="Platform">{prompt.platform}</ElementCard>
              <ElementCard title="Color scheme">{prompt.colorScheme}</ElementCard>
              <ElementCard title="Style">{prompt.style}</ElementCard>
              <ElementCard title="Screens">
                <ul className="space-y-1">
                  {parseArr(prompt.screens).map((s, i) => (
                    <li key={i} className="text-sm text-foreground/80">
                      <span className="mr-1.5 font-mono text-primary">{i + 1}.</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </ElementCard>
              <ElementCard title="Components">
                <ul className="space-y-1">
                  {parseArr(prompt.components).map((c, i) => (
                    <li key={i} className="text-sm text-foreground/80">
                      <span className="mr-1.5 text-primary">•</span>
                      {c}
                    </li>
                  ))}
                </ul>
              </ElementCard>
            </div>

            {/* Stitch exports — close the loop: bring designs back in */}
            <section className="card-elevated p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="label-caps inline-flex items-center gap-2 text-muted-foreground">
                  <span className="material-symbols text-[18px]">upload_file</span>
                  Stitch exports
                </h2>
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:flex-wrap">
                  {versions.length > 0 && (
                    <label className="inline-flex w-full items-center gap-2 text-sm text-muted-foreground sm:w-auto">
                      <span className="material-symbols shrink-0 text-[18px]">history</span>
                      <select
                        value={currentVersion?.key ?? ""}
                        onChange={(e) => setSelectedKey(e.target.value)}
                        className="input-paper !w-full !py-1.5 text-sm sm:!w-auto"
                        aria-label="Design version"
                      >
                        {versions.map((v, i) => (
                          <option key={v.key} value={v.key}>
                            Version {i + 1} — {fmtDate(v.firstAt)}
                            {i === versions.length - 1 ? " (current)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="btn-secondary min-h-[44px] w-full !px-4 !py-1.5 !text-sm sm:w-auto"
                  >
                    <span className="material-symbols text-[18px]">upload</span>
                    {uploading ? "Uploading…" : "Upload export"}
                  </button>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".md,.markdown,.txt,.html,.htm,.png,.jpg,.jpeg,.webp,.gif,.zip"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    setUploading(true);
                    setError(null);
                    try {
                      const form = new FormData();
                      form.append("file", file);
                      form.append("projectId", projectId);
                      const res = await apiFetch("/api/uploads", {
                        method: "POST",
                        body: form,
                      });
                      const data = await readJson<{
                        uploads?: DesignUpload[];
                        upload?: DesignUpload;
                        error?: string;
                      }>(res, "Upload timed out — try again.");
                      if (!res.ok) throw new Error(data.error || "Upload failed.");
                      const list = data.uploads ?? (data.upload ? [data.upload] : []);
                      setUploads((prev) => [...list, ...prev]);
                      // A fresh upload is always the newest → show the "current" version.
                      setSelectedKey(null);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Upload failed.");
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                Zip your Stitch export folder and upload the zip — the app unpacks
                it screen by screen (each screen&apos;s HTML and images become
                separate entries). Single files work too. The design review and
                your Docs are then built from what was actually designed.
              </p>
              {visibleUploads.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  No exports yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {visibleUploads.map((u) => (
                    <li
                      key={u.id}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="material-symbols shrink-0 text-[18px] text-muted-foreground">
                          description
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                          {u.type}
                        </span>
                        <span className="truncate font-medium">{u.filename}</span>
                      </span>
                      <button
                        onClick={() => openPreview(0)}
                        title="Preview design"
                        className="ml-2 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <span className="material-symbols text-[18px]">visibility</span>
                      </button>
                      <button
                        onClick={() => deleteUpload(u.id)}
                        title="Delete upload"
                        className="ml-1 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                      >
                        <span className="material-symbols text-[18px]">delete</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {error && (
                <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
            </section>

            {/* Feature coverage — advisory checklist against the current version */}
            <section className="card-elevated p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="label-caps inline-flex items-center gap-2 text-muted-foreground">
                  <span className="material-symbols text-[18px]">checklist</span>
                  Feature coverage
                </h2>
                {features.length > 0 && uploads.length > 0 && (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                      readyForDocs
                        ? "border-score-high/40 bg-score-high/10 text-score-high"
                        : "border-score-medium/40 bg-score-medium/10 text-score-medium"
                    }`}
                  >
                    <span className="material-symbols text-[16px]">
                      {readyForDocs ? "check_circle" : "pending"}
                    </span>
                    {readyForDocs
                      ? "Ready for docs"
                      : `${features.length - coveredCount} feature${features.length - coveredCount === 1 ? "" : "s"} not yet covered`}
                  </span>
                )}
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                Each feature from your approved idea, checked against the
                screens in the selected version above. Advisory only — the
                toggle on each row lets you correct the automatic guess, and
                Docs stays open either way.
              </p>
              {features.length > 0 && uploads.length > 0 && (
                <div className="mb-4">
                  <button
                    onClick={analyzeWithAi}
                    disabled={analyzing}
                    className="btn-primary min-h-[44px]"
                  >
                    {analyzing ? "Analyzing with AI…" : "Analyze with AI"}
                  </button>
                  {analyzeError && (
                    <p className="mt-2 text-sm text-destructive">{analyzeError}</p>
                  )}
                  {Object.keys(aiResults).length > 0 && !analyzing && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      AI analysis complete — review the results below. Toggle any row to correct it.
                    </p>
                  )}
                </div>
              )}
              {features.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  No features to check yet — draft them in Refine with
                  “Draft idea from analysis”, then upload your Stitch export
                  here to check coverage.
                </p>
              ) : uploads.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  Your features are already in the Stitch prompt above — Stitch
                  was told to design screens for every one of them. Upload your
                  Stitch export and this checklist will verify each feature made
                  it into the design.
                </p>
              ) : (
                <>
                  <p className="mb-3 font-serif text-2xl text-foreground">
                    {coveredCount}
                    <span className="text-muted-foreground"> of {features.length} features covered</span>
                  </p>
                  <ul className="space-y-2">
                    {coverage.map((c, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5"
                      >
                        <span className="flex min-w-0 items-start gap-2.5">
                          <span
                            className={`material-symbols mt-0.5 shrink-0 text-[20px] ${
                              c.covered ? "text-score-high" : "text-score-medium"
                            }`}
                          >
                            {c.covered ? "check_circle" : "radio_button_unchecked"}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-foreground">
                              {c.feature}
                            </span>
                            {c.matched && !c.overridden && (
                              <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                                matched: {c.matched}
                              </span>
                            )}
                            {c.aiReason && c.fromAi && !c.overridden && (
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                AI: {c.aiReason}
                              </span>
                            )}
                            {c.overridden && (
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                set manually · was{" "}
                                <button
                                  onClick={() => clearOverride(i)}
                                  className="underline hover:text-foreground"
                                >
                                  auto ({c.auto ? "covered" : "uncovered"})
                                </button>
                              </span>
                            )}
                          </span>
                        </span>
                        <button
                          onClick={() => toggleOverride(i)}
                          role="switch"
                          aria-checked={c.covered}
                          aria-label={`Mark feature "${c.feature}" as ${c.covered ? "uncovered" : "covered"}`}
                          title={c.covered ? "Mark as uncovered" : "Mark as covered"}
                          className="ml-2 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center"
                        >
                          <span
                            className={`material-symbols text-[32px] transition-colors ${
                              c.covered ? "text-primary" : "text-muted-foreground/50"
                            }`}
                          >
                            {c.covered ? "toggle_on" : "toggle_off"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            {/* Design review — AI checks the design/prompt covers the idea */}
            <section className="card-elevated p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="label-caps inline-flex items-center gap-2 text-muted-foreground">
                  <span className="material-symbols text-[18px]">search</span>
                  Design review
                </h2>
                <button
                  onClick={runReview}
                  disabled={reviewing || uploads.length === 0}
                  title={uploads.length === 0 ? "Upload a Stitch export first" : undefined}
                  className="btn-secondary !px-4 !py-1.5 !text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {reviewing
                    ? "Reviewing…"
                    : review
                      ? "Re-run review"
                      : "Review my design"}
                </button>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                Compares your idea&apos;s features against your uploaded Stitch
                design exports — flags gaps and suggests fixes.
                {uploads.length === 0 && (
                  <span className="mt-1 block font-medium text-foreground">
                    Upload a Stitch export above to enable the review.
                  </span>
                )}
              </p>

              {review && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="font-serif text-4xl text-primary">
                      {review.alignmentScore}
                      <span className="text-2xl text-muted-foreground">/10</span>
                    </span>
                    <span className="label-caps text-muted-foreground">
                      design alignment
                    </span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <h3 className="label-caps mb-2 inline-flex items-center gap-1.5 text-foreground">
                        <span className="material-symbols text-[16px] text-score-high">
                          check_circle
                        </span>
                        Covered
                      </h3>
                      <ul className="space-y-1 text-sm">
                        {review.matches?.map((m, i) => (
                          <li key={i} className="text-foreground/80">
                            {m}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h3 className="label-caps mb-2 inline-flex items-center gap-1.5 text-foreground">
                        <span className="material-symbols text-[16px] text-score-medium">
                          warning
                        </span>
                        Gaps
                      </h3>
                      <ul className="space-y-1 text-sm">
                        {review.gaps?.map((g, i) => (
                          <li key={i} className="text-foreground/80">
                            {g}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  {review.recommendations?.length > 0 && (
                    <div>
                      <h3 className="label-caps mb-2 inline-flex items-center gap-1.5 text-foreground">
                        <span className="material-symbols text-[16px] text-primary">
                          arrow_forward
                        </span>
                        Recommended fixes (paste into Stitch)
                      </h3>
                      <ul className="space-y-2 text-sm">
                        {review.recommendations.map((r, i) => (
                          <li
                            key={i}
                            className="rounded-md border border-border bg-background p-2.5 text-foreground/80"
                          >
                            {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </section>
          </section>
        )}

        {/* Strict pipeline: Design → Docs (no skipping, no back) */}
        {ideaId && (
          <div className="mt-8 flex border-t border-border pt-6 md:mt-10">
            <Link href={`/docs/${ideaId}`} className="btn-primary min-h-[48px] w-full justify-center sm:w-auto">
              Continue to Docs
              <span className="material-symbols text-[20px]">arrow_forward</span>
            </Link>
          </div>
        )}
      </div>

      {/* Stitch UI preview viewer */}
      {previewOpen && (
        <PreviewViewer
          uploads={previewItems}
          contents={previewContents}
          index={previewIndex}
          setIndex={setPreviewIndex}
          mode={previewMode}
          setMode={setPreviewMode}
          loading={previewLoading}
          onClose={closePreview}
        />
      )}
    </main>
  );
}

/**
 * Full-screen viewer for Stitch HTML exports. Phone frame or desktop
 * browser frame, swipe/arrow/keyboard navigation, thumbnail strip.
 * HTML renders in a sandboxed iframe — export scripts can't touch the app.
 */
function PreviewViewer({
  uploads,
  contents,
  index,
  setIndex,
  mode,
  setMode,
  loading,
  onClose,
}: {
  uploads: (DesignUpload & { isScreenshot: boolean })[];
  contents: Record<string, string>;
  index: number;
  setIndex: (i: number) => void;
  mode: "phone" | "desktop";
  setMode: (m: "phone" | "desktop") => void;
  loading: boolean;
  onClose: () => void;
}) {
  const current = uploads[index];
  const isScreenshot = current?.isScreenshot;
  const html = current ? contents[current.id] : null;
  const count = uploads.length;

  // Touch swipe support.
  const touchX = useRef<number | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    touchX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (dx < -40) setIndex(Math.min(index + 1, count - 1));
    if (dx > 40) setIndex(Math.max(index - 1, 0));
    touchX.current = null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Design preview"
    >
      {/* Top bar */}
      <div
        className="flex shrink-0 items-center justify-between gap-3 px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onClose}
            className="rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close preview"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
          <span className="truncate font-mono text-sm text-white/80">
            {current?.filename ?? "No screens"}
          </span>
          {count > 1 && (
            <span className="shrink-0 font-mono text-xs text-white/50">
              {index + 1} of {count}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 p-1">
          <button
            onClick={() => setMode("phone")}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "phone" ? "bg-white text-black" : "text-white/70 hover:text-white"
            }`}
          >
            Phone
          </button>
          <button
            onClick={() => setMode("desktop")}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "desktop" ? "bg-white text-black" : "text-white/70 hover:text-white"
            }`}
          >
            Desktop
          </button>
        </div>
      </div>

      {/* Stage */}
      <div
        className="flex min-h-0 flex-1 items-center justify-center gap-2 px-2 pb-2 sm:gap-4 sm:px-6"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Prev */}
        {count > 1 && (
          <button
            onClick={() => setIndex(Math.max(index - 1, 0))}
            disabled={index === 0}
            className="shrink-0 rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/20 disabled:opacity-30"
            aria-label="Previous screen"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
        )}

        {/* Frame */}
        <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
          {loading || !html ? (
            <p className="text-sm text-white/60">
              {loading ? "Loading screens…" : isScreenshot ? "Screenshot not saved — re-upload your Stitch export to enable previews." : "Could not load this screen."}
            </p>
          ) : isScreenshot ? (
            <div className="flex h-full max-h-full min-h-0 items-center justify-center">
              <img
                src={html}
                alt={current.filename}
                className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
                style={mode === "phone" ? { width: 375, maxWidth: "92vw" } : {}}
              />
            </div>
          ) : mode === "phone" ? (
            <div className="flex h-full max-h-full min-h-0 flex-col overflow-hidden rounded-[2.5rem] border-[10px] border-neutral-800 bg-neutral-800 shadow-2xl" style={{ width: 375, maxWidth: "92vw", aspectRatio: "9 / 18.5" }}>
              <div className="relative z-10 flex h-7 shrink-0 items-center justify-center bg-neutral-800">
                <div className="h-5 w-28 rounded-full bg-black" />
              </div>
              <iframe
                title={current.filename}
                srcDoc={html}
                sandbox="allow-same-origin allow-scripts"
                className="min-h-0 w-full flex-1 bg-white"
              />
            </div>
          ) : (
            <div className="flex h-full max-h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/15 bg-neutral-900 shadow-2xl">
              <div className="flex h-10 shrink-0 items-center gap-2 bg-neutral-800 px-4">
                <span className="h-3 w-3 rounded-full bg-red-500/80" />
                <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
                <span className="h-3 w-3 rounded-full bg-green-500/80" />
                <span className="ml-3 truncate rounded-md bg-black/40 px-3 py-1 font-mono text-xs text-white/60">
                  {current.filename}
                </span>
              </div>
              <iframe
                title={current.filename}
                srcDoc={html}
                sandbox="allow-same-origin allow-scripts"
                className="min-h-0 w-full flex-1 bg-white"
              />
            </div>
          )}
        </div>

        {/* Next */}
        {count > 1 && (
          <button
            onClick={() => setIndex(Math.min(index + 1, count - 1))}
            disabled={index === count - 1}
            className="shrink-0 rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/20 disabled:opacity-30"
            aria-label="Next screen"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        )}
      </div>

      {/* Thumbnails + dots */}
      {count > 1 && (
        <div
          className="flex shrink-0 items-center justify-center gap-2 overflow-x-auto px-4 pb-4"
          onClick={(e) => e.stopPropagation()}
        >
          {uploads.map((u, i) => (
            <button
              key={u.id}
              onClick={() => setIndex(i)}
              title={u.filename}
              className={`h-2.5 rounded-full transition-all ${
                i === index ? "w-8 bg-white" : "w-2.5 bg-white/30 hover:bg-white/60"
              }`}
              aria-label={`Go to screen ${i + 1}: ${u.filename}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
