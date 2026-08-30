"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

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

  const [prompt, setPrompt] = useState<StitchPrompt | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16 text-center text-muted-foreground">
        Loading…
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to ideas
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
        </section>
      )}
    </main>
  );
}

