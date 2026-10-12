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

function scoreClass(avg: number): string {
  if (avg >= 7) return "text-score-high";
  if (avg >= 4) return "text-score-medium";
  return "text-score-low";
}

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
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-32 pt-10 md:px-8">
      <header className="mb-10 text-center">
        <h1 className="mb-3 font-serif text-4xl tracking-tight text-foreground">
          Project History
        </h1>
        <p className="font-mono text-sm text-muted-foreground">
          {loading
            ? "Loading…"
            : `${projects.length} generation run${projects.length === 1 ? "" : "s"} · ${totalIdeas} ideas`}
        </p>
      </header>

      {error && (
        <p className="mx-auto mb-6 max-w-xl rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
          {error}
        </p>
      )}

      {!loading && projects.length > 0 && (
        <div className="mb-6 text-center">
          <button
            onClick={() => setFavoritesOnly((v) => !v)}
            className={favoritesOnly ? "btn-primary !px-4 !py-2 !text-xs" : "btn-ghost !px-4 !py-2 !text-xs"}
          >
            <span className="material-symbols text-[16px]">
              {favoritesOnly ? "star" : "star_outline"}
            </span>
            Favorites only
          </button>
        </div>
      )}

      {loading && (
        <div className="mx-auto max-w-4xl space-y-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="card-paper p-6">
              <div className="mb-4 h-6 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {!loading && projects.length === 0 && (
        <div className="mx-auto max-w-2xl rounded-md border border-dashed border-border p-10 text-center">
          <span className="material-symbols mb-3 inline-block text-[32px] text-muted-foreground">
            history
          </span>
          <p className="text-sm text-muted-foreground">
            Nothing here yet — generate your first ideas on the home page.
          </p>
        </div>
      )}
      <div className="mx-auto max-w-4xl space-y-8">
        {visible.map((project) => (
          <section key={project.id} className="card-paper p-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="label-caps rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
                    {project.stitchPrompt ? "Design" : "Refine"}
                  </span>
                </div>
                <h2 className="font-serif text-xl text-foreground">
                  {project.name}
                </h2>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {project.category} ·{" "}
                  {new Date(project.createdAt).toLocaleDateString()}
                </p>
              </div>
              <a
                href={`/api/projects/${project.id}/export`}
                className="btn-ghost !px-3 !py-1.5 !text-xs"
              >
                <span className="material-symbols text-[16px]">download</span>
                Download bundle
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
                      <span className="mr-2 inline-flex align-middle">
                        <span
                          className={`material-symbols text-[18px] ${
                            idea.favorite ? "text-primary" : "text-muted-foreground"
                          }`}
                          title={idea.favorite ? "Favorite" : ""}
                        >
                          {idea.favorite ? "star" : "star_outline"}
                        </span>
                      </span>
                      <span className="font-medium text-foreground">
                        {idea.title}
                      </span>
                      {avg > 0 && (
                        <span className={`ml-2 font-mono text-xs ${scoreClass(avg)}`}>
                          {avg}/10
                        </span>
                      )}
                      <p className="mt-0.5 line-clamp-2 pl-7 text-sm text-muted-foreground">
                        {idea.pitch}
                      </p>
                    </div>
                    {approved && (
                      <div className="flex shrink-0 gap-2">
                        <Link
                          href={`/stitch/${project.id}`}
                          className="btn-ghost !px-2.5 !py-1 !font-mono !text-xs"
                        >
                          Design
                        </Link>
                        <Link
                          href={`/docs/${idea.id}`}
                          className="btn-ghost !px-2.5 !py-1 !font-mono !text-xs"
                        >
                          Docs
                        </Link>
                        <Link
                          href={`/export/${idea.id}`}
                          className="btn-ghost !px-2.5 !py-1 !font-mono !text-xs"
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
