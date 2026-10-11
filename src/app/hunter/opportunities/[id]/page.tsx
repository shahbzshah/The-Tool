"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { scoreTier } from "@/lib/hunter/ui";

type Analysis = {
  id: string;
  content: string;
  provider: string;
  createdAt: string;
};

type Opportunity = {
  id: string;
  appId: string;
  title: string;
  rating: number | null;
  installs: string | null;
  reviewsCount: string | null;
  score: number;
  category: string | null;
  summary: string | null;
  url: string | null;
  breakdown: string | null;
  isBookmarked: boolean;
  scanJob?: { keyword: string } | null;
};

function ParsedAnalysis({ content }: { content: string }) {
  let a: any = null;
  try {
    a = JSON.parse(content);
  } catch {
    return <p className="text-sm text-muted-foreground">Could not parse analysis.</p>;
  }
  return (
    <div className="space-y-4 text-sm">
      {a.summary && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Summary</h4>
          <p className="mt-1">{a.summary}</p>
        </div>
      )}
      {Array.isArray(a.strengths) && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-green-600">Strengths</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
            {a.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
      {Array.isArray(a.weaknesses) && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-600">Weaknesses</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
            {a.weaknesses.map((s: string, i: number) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
      {a.opportunity && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Opportunity</h4>
          <p className="mt-1">{a.opportunity}</p>
        </div>
      )}
      {Array.isArray(a.build_plan) && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Build plan</h4>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">
            {a.build_plan.map((s: string, i: number) => <li key={i}>{s}</li>)}
          </ol>
        </div>
      )}
      {a.monetization && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Monetization</h4>
          <p className="mt-1">{a.monetization}</p>
        </div>
      )}
    </div>
  );
}

export default function OpportunityDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [error, setError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/hunter/opportunities/${params.id}`);
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        setError("Opportunity not found.");
        return;
      }
      const data = await res.json();
      setOpp(data.opportunity);
      setAnalyses(data.opportunity.analyses ?? []);
    } catch {
      setError("Could not load the opportunity.");
    }
  }, [params.id, router]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleBookmark() {
    if (!opp) return;
    const res = await fetch(`/api/hunter/opportunities/${opp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isBookmarked: !opp.isBookmarked }),
    });
    if (res.ok) {
      const data = await res.json();
      setOpp({ ...opp, isBookmarked: data.opportunity.isBookmarked });
    }
  }

  async function deleteOpp() {
    if (!opp || !window.confirm(`Delete “${opp.title}”?`)) return;
    const res = await fetch(`/api/hunter/opportunities/${opp.id}`, { method: "DELETE" });
    if (res.ok) router.push("/");
  }

  async function analyze() {
    if (!opp || analyzing) return;
    setAnalyzing(true);
    try {
      const res = await fetch("/api/hunter/opportunities/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: opp.id }),
      });
      if (res.ok) await load();
    } finally {
      setAnalyzing(false);
    }
  }

  async function deleteAnalysis(id: string) {
    const res = await fetch(`/api/hunter/opportunities/analyses/${id}`, {
      method: "DELETE",
    });
    if (res.ok) setAnalyses((prev) => prev.filter((a) => a.id !== id));
  }

  async function sendToBuilder() {
    if (!opp) return;
    setSending(true);
    try {
      const res = await fetch("/api/hunter/opportunities/send-to-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: opp.id }),
      });
      const data = await res.json();
      if (data.designUrl) router.push(data.designUrl);
    } finally {
      setSending(false);
    }
  }

  function copyPackageId() {
    if (!opp) return;
    navigator.clipboard?.writeText(opp.appId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (error) {
    return (
      <main className="mx-auto w-full max-w-[900px] px-4 py-8">
        <p className="text-muted-foreground">{error}</p>
        <Link href="/" className="mt-2 inline-block text-sm underline">
          ← Back to Hunter
        </Link>
      </main>
    );
  }

  if (!opp) {
    return (
      <main className="mx-auto w-full max-w-[900px] px-4 py-8">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  const tier = scoreTier(opp.score);

  return (
    <main className="mx-auto w-full max-w-[900px] px-4 py-8">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← Hunter
        {opp.scanJob ? ` / “${opp.scanJob.keyword}”` : ""}
      </Link>

      {/* Header card */}
      <section className="mt-4 rounded-lg border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg font-mono text-2xl font-bold text-white"
              style={{ backgroundColor: tier.color }}
            >
              {tier.score}
            </div>
            <div>
              <h1 className="font-serif text-2xl font-bold leading-tight">{opp.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{tier.label}</p>
            </div>
          </div>
          <button
            onClick={toggleBookmark}
            aria-label={opp.isBookmarked ? "Remove bookmark" : "Bookmark"}
            className={`text-2xl leading-none ${
              opp.isBookmarked ? "text-amber-500" : "text-muted-foreground/40 hover:text-amber-500"
            }`}
          >
            {opp.isBookmarked ? "★" : "☆"}
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Rating</p>
            <p className="font-mono text-lg">★{opp.rating ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Installs</p>
            <p className="font-medium">{opp.installs ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Reviews</p>
            <p className="font-mono">{opp.reviewsCount ?? "—"}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={copyPackageId}
            className="rounded-md border border-border px-3 py-1.5 font-mono text-xs hover:border-primary"
            title="Copy package ID"
          >
            {copied ? "Copied ✓" : opp.appId}
          </button>
          {opp.url && (
            <a
              href={opp.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-border px-4 py-1.5 text-sm hover:border-primary"
            >
              Play Store ↗
            </a>
          )}
          <button
            onClick={deleteOpp}
            className="rounded-md border border-border px-4 py-1.5 text-sm text-red-500 hover:border-red-500"
          >
            Delete
          </button>
          <button
            onClick={sendToBuilder}
            disabled={sending}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send to Builder →"}
          </button>
        </div>
      </section>

      {/* Why it scores */}
      {opp.summary && (
        <section className="mt-4 rounded-lg border border-border bg-card p-6">
          <h2 className="font-serif text-lg font-semibold">Why it scores</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{opp.summary}</p>
        </section>
      )}

      {/* AI analysis */}
      <section className="mt-4 rounded-lg border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold">AI Analysis</h2>
          <button
            onClick={analyze}
            disabled={analyzing}
            className="rounded-md border border-border px-4 py-1.5 text-sm hover:border-primary disabled:opacity-50"
          >
            {analyzing ? "Analyzing…" : analyses.length ? "Re-analyze" : "Analyze with AI"}
          </button>
        </div>
        {analyses.length === 0 && !analyzing && (
          <p className="text-sm text-muted-foreground">
            No analysis yet. Run the AI deep-dive to get the breakdown: summary,
            strengths, weaknesses, the opportunity angle, a build plan and monetization.
          </p>
        )}
        <div className="space-y-6">
          {analyses.map((a) => (
            <div key={a.id} className="rounded-md border border-border p-4">
              <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                  {a.provider} · {new Date(a.createdAt).toLocaleString()}
                </span>
                <button
                  onClick={() => deleteAnalysis(a.id)}
                  className="hover:text-red-500"
                >
                  Delete
                </button>
              </div>
              <ParsedAnalysis content={a.content} />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
