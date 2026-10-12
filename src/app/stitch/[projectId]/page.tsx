"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

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

function parseArr(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
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
  const [uploads, setUploads] = useState<
    { id: string; type: string; filename: string; createdAt: string }[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadUploads = useCallback(async () => {
    try {
      const res = await fetch(`/api/uploads?projectId=${projectId}`);
      const data = await res.json();
      setUploads(data.uploads ?? []);
    } catch {
      // ignore
    }
  }, [projectId]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/stitch-prompt?projectId=${projectId}`);
      const data = await res.json();
      setPrompt(data.prompt ?? null);
    } catch {
      // ignore — treat as no prompt yet
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
    loadUploads();
  }, [load, loadUploads]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/stitch-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
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
      const res = await fetch(`/api/uploads?id=${id}`, { method: "DELETE" });
      if (res.ok) setUploads((prev) => prev.filter((u) => u.id !== id));
    } catch {
      // ignore
    }
  }

  async function runReview() {
    setReviewing(true);
    setError(null);
    try {
      const res = await fetch("/api/stitch-review", {
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

  if (loading) {
    return (
      <main className="mx-auto max-w-[1200px] px-4 py-16 text-center text-muted-foreground md:px-8">
        Loading…
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-12 md:px-8">
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
          <p className="label-caps mb-2 text-primary">Step 3 — Design</p>
          <h1 className="mb-2 font-serif text-4xl tracking-tight text-foreground">
            Stitch Prompt Generator
          </h1>
          <p className="text-muted-foreground">
            Copy the prompt below into Google Stitch to design your app&apos;s UI.
          </p>
        </header>

        {!prompt && !generating && (
          <section className="card-elevated mx-auto max-w-xl p-8 text-center">
            <span className="material-symbols mb-4 inline-block text-[32px] text-primary">
              auto_awesome
            </span>
            <p className="mb-6 text-muted-foreground">
              You have an approved idea. Generate a detailed, copy-paste-ready
              prompt for Google Stitch now.
            </p>
            <button onClick={generate} className="btn-primary">
              <span className="material-symbols text-[20px]">auto_awesome</span>
              Generate Stitch Prompt
            </button>
            {error && (
              <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
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
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={async () => {
                    await copyPrompt();
                    window.open("https://stitch.withgoogle.com/", "_blank", "noopener");
                  }}
                  className="btn-primary"
                >
                  <span className="material-symbols text-[20px]">open_in_new</span>
                  {copied ? "Copied! Opening Stitch…" : "Copy prompt & Open Stitch"}
                </button>
                <button
                  onClick={generate}
                  disabled={generating}
                  className="btn-ghost"
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
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="btn-secondary !px-4 !py-1.5 !text-sm"
                >
                  <span className="material-symbols text-[18px]">upload</span>
                  {uploading ? "Uploading…" : "Upload export"}
                </button>
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
                      const res = await fetch("/api/uploads", {
                        method: "POST",
                        body: form,
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || "Upload failed.");
                      const list = data.uploads ?? (data.upload ? [data.upload] : []);
                      setUploads((prev) => [...list, ...prev]);
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
              {uploads.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  No exports yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {uploads.map((u) => (
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
                        onClick={() => deleteUpload(u.id)}
                        title="Delete upload"
                        className="ml-2 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
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

            {/* Design review — AI checks the design/prompt covers the idea */}
            <section className="card-elevated p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="label-caps inline-flex items-center gap-2 text-muted-foreground">
                  <span className="material-symbols text-[18px]">search</span>
                  Design review
                </h2>
                <button
                  onClick={runReview}
                  disabled={reviewing}
                  className="btn-secondary !px-4 !py-1.5 !text-sm"
                >
                  {reviewing
                    ? "Reviewing…"
                    : review
                      ? "Re-run review"
                      : "Review my design"}
                </button>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                Compares your idea&apos;s features against the Stitch prompt and any
                uploaded design exports — flags gaps and suggests fixes.
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
          <div className="mt-10 flex justify-end border-t border-border pt-6">
            <Link href={`/docs/${ideaId}`} className="btn-primary">
              Continue to Docs
              <span className="material-symbols text-[20px]">arrow_forward</span>
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
