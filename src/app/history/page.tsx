"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  averageScore,
  parseJsonField,
  type IdeaScores,
} from "@/lib/constants";

type HistoryIdea = {
  id: string;
  title: string;
  pitch: string;
  scores: string | null;
  favorite: boolean;
  status: string;
  createdAt: string;
};

type HistoryProject = {
  id: string;
  name: string;
  category: string;
  preferences: string | null;
  createdAt: string;
  ideas: HistoryIdea[];
  stitchPrompt: { id: string } | null;
};

export default function HistoryPage() {
  const [projects, setProjects] = useState<HistoryProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data.projects ?? []);
    } catch {
      setError("Failed to load projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = favoritesOnly
    ? projects
        .map((p) => ({ ...p, ideas: p.ideas.filter((i) => i.favorite) }))
        .filter((p) => p.ideas.length > 0)
    : projects;

  const totalIdeas = projects.reduce((sum, p) => sum + p.ideas.length, 0);

  return (
    <main className="mx-auto w-full max-w-[1000px] px-4 pb-32 pt-10 md:px-16">
      <header className="mb-10 text-center">
        <h1 className="mb-3 font-serif text-4xl tracking-tight text-foreground">
          Project History
        </h1>
        <p className="text-muted-foreground">
          {loading
            ? "Loading…"
            : `${projects.length} generation run${projects.length === 1 ? "" : "s"} · ${totalIdeas} ideas`}
        </p>
      </header>

      {error && (
        <p className="mx-auto mb-6 max-w-xl rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
          {error}
        </p>
      )}

      {!loading && projects.length > 0 && (
        <div className="mb-6 text-center">
          <button
            onClick={() => setFavoritesOnly((v) => !v)}
            className={`rounded px-3 py-1.5 font-mono text-xs transition-colors ${
              favoritesOnly
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            ★ Favorites only
          </button>
        </div>
      )}

      {loading && (
        <div className="space-y-6">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="card-shadow rounded-lg border border-border/30 bg-card p-6"
            >
              <div className="skeleton-loader mb-4 h-6 w-1/2 rounded" />
              <div className="skeleton-loader h-4 w-1/3 rounded" />
            </div>
          ))}
        </div>
      )}

      {!loading && projects.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-10 text-center font-mono text-sm text-muted-foreground/70">
          Nothing here yet — generate your first ideas on the home page.
        </p>
      )}
      <div className="space-y-8">
        {visible.map((project) => (
          <section
            key={project.id}
            className="card-shadow rounded-lg border border-border bg-card p-6"
          >
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-serif text-xl text-foreground">
                  {project.name}
                </h2>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {project.category} ·{" "}
                  {new Date(project.createdAt).toLocaleDateString()}
                  {project.stitchPrompt ? " · Stitch prompt ✓" : ""}
                </p>
              </div>
              <a
                href={`/api/projects/${project.id}/export`}
                className="rounded border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                ⬇ Download bundle
              </a>
            </div>

            <ul className="divide-y divide-border/40">
              {project.ideas.map((idea) => {
                const scores = parseJsonField<IdeaScores>(idea.scores);
                const avg = averageScore(scores);
                const approved = idea.status === "approved";
                return (
                  <li
                    key={idea.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <span
                        className="mr-2"
                        title={idea.favorite ? "Favorite" : ""}
                      >
                        {idea.favorite ? "★" : "☆"}
                      </span>
                      <span className="font-medium text-foreground">
                        {idea.title}
                      </span>
                      {avg > 0 && (
                        <span className="ml-2 font-mono text-xs text-primary">
                          {avg}/10
                        </span>
                      )}
                      <p className="mt-0.5 line-clamp-2 pl-6 text-sm text-muted-foreground">
                        {idea.pitch}
                      </p>
                    </div>
                    {approved && (
                      <div className="flex shrink-0 gap-2">
                        <Link
                          href={`/stitch/${project.id}`}
                          className="rounded border border-border px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                        >
                          Stitch
                        </Link>
                        <Link
                          href={`/docs/${idea.id}`}
                          className="rounded border border-border px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                        >
                          Docs
                        </Link>
                        <Link
                          href={`/export/${idea.id}`}
                          className="rounded border border-border px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                        >
                          Export
                        </Link>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}