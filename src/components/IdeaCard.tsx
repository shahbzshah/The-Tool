"use client";

import Link from "next/link";

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

function parseFeatures(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export default function IdeaCard({
  idea,
  onApprove,
  busy,
}: {
  idea: Idea;
  onApprove: (id: string) => void;
  busy: boolean;
}) {
  const features = parseFeatures(idea.features);
  const approved = idea.status === "approved";

  return (
    <div className="card-shadow rounded-lg border border-border bg-card p-6 transition-colors hover:border-input">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <span
            className={`mb-2 inline-flex w-max items-center gap-1 rounded px-2 py-1 font-mono text-xs uppercase tracking-wider ${
              approved
                ? "bg-secondary text-secondary-foreground"
                : "bg-accent text-accent-foreground"
            }`}
          >
            {approved ? "Approved ✓" : "Idea"}
          </span>
          <h3 className="font-serif text-2xl leading-8 text-foreground">
            {idea.title}
          </h3>
        </div>
      </div>

      <p className="mb-6 text-muted-foreground">{idea.pitch}</p>

      {features.length > 0 && (
        <div className="mb-6">
          <h4 className="mb-3 font-mono text-xs uppercase tracking-wider text-foreground">
            Core features
          </h4>
          <ul className="space-y-2">
            {features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-primary">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 border-t border-border/30 py-4 sm:grid-cols-2">
        <div>
          <span className="mb-1 block font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Audience
          </span>
          <span className="text-sm font-medium">{idea.targetAudience}</span>
        </div>
        {idea.monetization && (
          <div>
            <span className="mb-1 block font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Monetization
            </span>
            <span className="text-sm font-medium">{idea.monetization}</span>
          </div>
        )}
      </div>

      {approved ? (
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/stitch/${idea.projectId}`}
            className="flex items-center gap-2 rounded bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Stitch Prompt 🎨
          </Link>
          <Link
            href={`/docs/${idea.id}`}
            className="flex items-center gap-2 rounded border border-foreground px-4 py-2 font-medium text-foreground transition-colors hover:bg-muted"
          >
            Docs 📄
          </Link>
          <Link
            href={`/export/${idea.id}`}
            className="flex items-center gap-2 rounded bg-secondary px-4 py-2 font-medium text-secondary-foreground transition-colors hover:bg-secondary/90"
          >
            Export 🤖
          </Link>
        </div>
      ) : (
        <button
          onClick={() => onApprove(idea.id)}
          disabled={busy}
          className="rounded bg-primary px-6 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          I Like This!
        </button>
      )}
    </div>
  );
}
