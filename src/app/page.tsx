"use client";

import { useCallback, useEffect, useState } from "react";
import IdeaCard from "@/components/IdeaCard";
import { CATEGORIES } from "@/lib/constants";

type Idea = {
  id: string;
  projectId: string;
  title: string;
  pitch: string;
  features: string;
  targetAudience: string;
  monetization: string | null;
  status: string;
};

type Project = {
  id: string;
  name: string;
  category: string;
  ideas: Idea[];
};

export default function Home() {
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [preferences, setPreferences] = useState("");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadIdeas = useCallback(async () => {
    try {
      const res = await fetch("/api/ideas");
      const data = await res.json();
      setIdeas(data.ideas ?? []);
    } catch {
      // ignore — empty DB is fine
    }
  }, []);

  useEffect(() => {
    loadIdeas();
  }, [loadIdeas]);

  async function generate() {
    setLoading(true);
    setError(null);
    setIdeas([]);
    try {
      const res = await fetch("/api/ideas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, preferences }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed.");
      setIdeas((data.project as Project).ideas);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function approve(id: string) {
    setApprovingId(id);
    try {
      const res = await fetch(`/api/ideas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
      if (res.ok) {
        setIdeas((prev) =>
          prev.map((i) => (i.id === id ? { ...i, status: "approved" } : i))
        );
      }
    } finally {
      setApprovingId(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-32 pt-10 md:px-16">
      {/* Hero */}
      <section className="mx-auto mb-16 max-w-3xl text-center md:mb-24">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted px-3 py-1 font-mono text-xs tracking-wider text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-secondary" />
          powered by AI + live trends
        </div>
        <h1 className="mb-6 font-serif text-4xl leading-tight tracking-tight text-foreground md:text-5xl">
          Turn your idea into a buildable app
        </h1>
        <p className="text-lg text-muted-foreground">
          Describe your vision, and we&apos;ll craft the architecture, features,
          and documentation needed to start building today.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Generator column */}
        <div className="lg:col-span-4">
          <div className="card-shadow sticky top-24 rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 font-serif text-2xl text-foreground">
              Generate ideas
            </h2>
            <div className="mb-4">
              <label
                htmlFor="category"
                className="mb-2 block font-mono text-xs uppercase tracking-wider text-muted-foreground"
              >
                Category
              </label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded border border-border bg-background p-3 text-sm text-foreground outline-none transition-colors focus:border-ring"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-6">
              <label
                htmlFor="preferences"
                className="mb-2 block font-mono text-xs uppercase tracking-wider text-muted-foreground"
              >
                Preferences &amp; Goals{" "}
                <span className="normal-case text-muted-foreground/60">
                  (optional)
                </span>
              </label>
              <textarea
                id="preferences"
                value={preferences}
                onChange={(e) => setPreferences(e.target.value)}
                rows={4}
                placeholder="E.g., solo-dev buildable, mobile-first, no login required…"
                className="w-full resize-none rounded border border-border bg-background p-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-l-2 focus:border-l-primary focus:border-ring"
              />
            </div>
            <button
              onClick={generate}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Generating ideas…" : "Generate Idea ⚡"}
            </button>
            {error && (
              <p className="mt-3 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        </div>

        {/* Idea grid column */}
        <div className="flex flex-col gap-6 lg:col-span-8">
          {loading &&
            [1, 2, 3].map((n) => (
              <div
                key={n}
                className="card-shadow rounded-lg border border-border/30 bg-card p-6"
              >
                <div className="skeleton-loader mb-4 h-6 w-16 rounded" />
                <div className="skeleton-loader mb-6 h-8 w-3/4 rounded" />
                <div className="mb-8 space-y-3">
                  <div className="skeleton-loader h-4 w-full rounded" />
                  <div className="skeleton-loader h-4 w-full rounded" />
                  <div className="skeleton-loader h-4 w-2/3 rounded" />
                </div>
                <div className="skeleton-loader h-10 w-32 rounded" />
              </div>
            ))}

          {ideas.length > 0 && !loading && ideas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              onApprove={approve}
              busy={approvingId !== null}
            />
          ))}

          {ideas.length === 0 && !loading && (
            <p className="rounded-lg border border-dashed border-border p-10 text-center font-mono text-sm text-muted-foreground/70">
              No ideas yet — pick a category and hit Generate.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
