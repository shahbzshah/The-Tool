"use client";

import { useCallback, useEffect, useState } from "react";
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
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
        {title}
      </h3>
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
  }, [load]);

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

  async function runReview() {
    setReviewing(true);
    setError(null);
    try {
      const res = await fetch("/api/stitch-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Review failed.");
      setReview(data.review);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setReviewing(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16 text-center text-muted-foreground">
        Loading…
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      {/* Strict pipeline: Refine → Design → Docs */}
      <Link
        href={ideaId ? `/refine/${projectId}?idea=${ideaId}` : "/"}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to Refine
      </Link>

      <header className="mb-8 mt-4 text-center">
        <h1 className="mb-2 text-3xl font-bold">🎨 Stitch Prompt Generator</h1>
        <p className="text-muted-foreground">
          Copy the prompt below into Google Stitch to design your app&apos;s UI.
        </p>
      </header>

      {!prompt && !generating && (
        <section className="mx-auto max-w-xl rounded-xl border border-border bg-card p-8 text-center">
          <p className="mb-6 text-muted-foreground">
            You have an approved idea. Generate a detailed, copy-paste-ready
            prompt for Google Stitch now.
          </p>
          <button
            onClick={generate}
            className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Generate Stitch Prompt ✨
          </button>
          {error && (
            <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Your Stitch prompt
              </h2>
              <button
                onClick={copyPrompt}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                  copied
                    ? "bg-secondary text-secondary-foreground"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                {copied ? "Copied! ✅" : "Copy prompt 📋"}
              </button>
            </div>
            <p className="whitespace-pre-wrap rounded-lg bg-background p-4 font-mono text-sm leading-relaxed text-foreground/90">
              {prompt.promptText}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href="https://stitch.withgoogle.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground hover:bg-secondary/80"
              >
                Open Google Stitch ↗
              </a>
              <button
                onClick={generate}
                disabled={generating}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/80 hover:border-ring disabled:opacity-50"
              >
                Regenerate 🔄
              </button>
            </div>
            {error && (
              <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
                    <span className="mr-1.5 text-primary">{i + 1}.</span>
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

          {/* Design review — AI checks the design/prompt covers the idea */}
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Design review 🔍
              </h2>
              <button
                onClick={runReview}
                disabled={reviewing}
                className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium text-foreground/80 transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
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
                  <span className="font-serif text-3xl text-primary">
                    {review.alignmentScore}/10
                  </span>
                  <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    design alignment
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <h3 className="mb-2 font-mono text-xs uppercase tracking-wider text-foreground">
                      ✓ Covered
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
                    <h3 className="mb-2 font-mono text-xs uppercase tracking-wider text-foreground">
                      ⚠ Gaps
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
                    <h3 className="mb-2 font-mono text-xs uppercase tracking-wider text-foreground">
                      → Recommended fixes (paste into Stitch)
                    </h3>
                    <ul className="space-y-2 text-sm">
                      {review.recommendations.map((r, i) => (
                        <li
                          key={i}
                          className="rounded bg-background p-2 text-foreground/80"
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
          <Link
            href={`/docs/${ideaId}`}
            className="rounded-md bg-primary px-6 py-2.5 font-medium text-primary-foreground"
          >
            Continue to Docs →
          </Link>
        </div>
      )}
    </main>
  );
}

