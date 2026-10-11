"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type TrendIdea = {
  id: string;
  title: string;
  source: string;
  hotness: number;
  url: string | null;
  text: string | null;
  analysis: string | null;
};

type IdeaAnalysis = {
  summary: string;
  why_trending: string;
  target_audience: string;
  key_features: string[];
  monetization: string;
  competition_angle: string;
  suggested_keywords: string[];
};

export default function HunterPage() {
  const router = useRouter();
  const [ideas, setIdeas] = useState<TrendIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TrendIdea | null>(null);
  const [analysis, setAnalysis] = useState<IdeaAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [sending, setSending] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [selectedOpp, setSelectedOpp] = useState<any>(null);
  const [sendingOpp, setSendingOpp] = useState(false);
  const [oppAnalysis, setOppAnalysis] = useState<any>(null);
  const [analyzingOpp, setAnalyzingOpp] = useState(false);

  async function analyzeOpportunity() {
    if (!selectedOpp || analyzingOpp) return;
    setAnalyzingOpp(true);
    setOppAnalysis(null);
    try {
      const res = await fetch("/api/hunter/opportunities/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedOpp.id }),
      });
      const data = await res.json();
      if (data.analysis) setOppAnalysis(data.analysis);
    } finally {
      setAnalyzingOpp(false);
    }
  }

  const loadIdeas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/hunter/ideas");
      const data = await res.json();
      setIdeas(data.ideas ?? []);
    } catch {
      setIdeas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIdeas();
  }, [loadIdeas]);

  async function analyzeIdea(idea: TrendIdea) {
    setSelected(idea);
    setAnalysis(idea.analysis ? JSON.parse(idea.analysis) : null);
    if (idea.analysis) return;
    setAnalyzing(true);
    try {
      const res = await fetch("/api/hunter/ideas/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: idea.id }),
      });
      const data = await res.json();
      if (data.analysis) {
        setAnalysis(data.analysis);
        // Update the cached copy in the list
        setIdeas((prev) =>
          prev.map((i) =>
            i.id === idea.id ? { ...i, analysis: JSON.stringify(data.analysis) } : i
          )
        );
      }
    } finally {
      setAnalyzing(false);
    }
  }

  async function sendToBuilder() {
    if (!selected) return;
    setSending(true);
    try {
      const res = await fetch("/api/hunter/ideas/send-to-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id }),
      });
      const data = await res.json();
      if (data.designUrl) router.push(data.designUrl);
    } finally {
      setSending(false);
    }
  }

  async function sendOpportunityToBuilder() {
    if (!selectedOpp) return;
    setSendingOpp(true);
    try {
      const res = await fetch("/api/hunter/opportunities/send-to-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedOpp.id }),
      });
      const data = await res.json();
      if (data.designUrl) router.push(data.designUrl);
    } finally {
      setSendingOpp(false);
    }
  }

  async function runScan(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim() || scanning) return;
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/hunter/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: keyword.trim() }),
      });
      const data = await res.json();
      setScanResult(data);
    } finally {
      setScanning(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-16">
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold text-foreground">
          Opportunity Hunter
        </h1>
        <p className="mt-2 text-muted-foreground">
          Trending app ideas, validated against the real Play Store. Pick one,
          analyze it, then send it to the builder.
        </p>
      </div>

      {/* Play Store scan */}
      <section className="mb-10 rounded-lg border border-border bg-card p-6">
        <h2 className="font-serif text-xl font-semibold">Scan the Play Store</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter a keyword to find underrated apps in that niche — high rating,
          low installs, real opportunity.
        </p>
        <form onSubmit={runScan} className="mt-4 flex gap-2">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="e.g. habit tracker"
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={scanning || !keyword.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {scanning ? "Scanning…" : "Scan"}
          </button>
        </form>
        {scanResult?.opportunities && (
          <div className="mt-4 space-y-2">
            {scanResult.opportunities.slice(0, 10).map((o: any) => (
              <button
                key={o.appId}
                onClick={() => {
                  setSelectedOpp(o);
                  setOppAnalysis(null);
                }}
                className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  selectedOpp?.appId === o.appId
                    ? "border-primary bg-accent/30"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <span className="font-medium">{o.title}</span>
                <span className="font-mono text-muted-foreground">
                  {o.score}/100 · ★{o.rating}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Opportunity detail panel */}
        {selectedOpp && (
          <div className="mt-4 rounded-lg border border-primary/30 p-5">
            <h3 className="font-serif text-lg font-semibold">{selectedOpp.title}</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Opportunity</p>
                <p className="font-mono text-lg font-semibold">{selectedOpp.score}/100</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Rating</p>
                <p className="font-mono text-lg">★{selectedOpp.rating}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Installs</p>
                <p className="font-medium">{selectedOpp.installs ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Reviews</p>
                <p className="font-mono">{selectedOpp.reviewsCount ?? "—"}</p>
              </div>
            </div>
            {selectedOpp.breakdown && (
              <div className="mt-3 text-xs text-muted-foreground">
                {(() => {
                  try {
                    const b = JSON.parse(selectedOpp.breakdown);
                    return `Quality ${b.quality} · Gap ${b.gap} · Market ${b.market} · Competition ${b.competition}`;
                  } catch {
                    return null;
                  }
                })()}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={analyzeOpportunity}
                disabled={analyzingOpp}
                className="rounded-md border border-border px-4 py-2 text-sm hover:border-primary disabled:opacity-50"
              >
                {analyzingOpp ? "Analyzing…" : "Analyze with AI"}
              </button>
              {selectedOpp.url && (
                <a
                  href={selectedOpp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-border px-4 py-2 text-sm hover:border-primary"
                >
                  View on Play Store ↗
                </a>
              )}
              <button
                onClick={sendOpportunityToBuilder}
                disabled={sendingOpp}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {sendingOpp ? "Sending…" : "Send to Builder →"}
              </button>
            </div>

            {/* AI analysis of the opportunity */}
            {oppAnalysis && (
              <div className="mt-4 space-y-4 border-t border-border pt-4 text-sm">
                <div>
                  <h4 className="font-semibold">Summary</h4>
                  <p className="mt-1 text-muted-foreground">{oppAnalysis.summary}</p>
                </div>
                {Array.isArray(oppAnalysis.strengths) && (
                  <div>
                    <h4 className="font-semibold">Strengths</h4>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                      {oppAnalysis.strengths.map((s: string, i: number) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(oppAnalysis.weaknesses) && (
                  <div>
                    <h4 className="font-semibold">Weaknesses to exploit</h4>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                      {oppAnalysis.weaknesses.map((s: string, i: number) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {oppAnalysis.opportunity && (
                  <div>
                    <h4 className="font-semibold">The opportunity</h4>
                    <p className="mt-1 text-muted-foreground">{oppAnalysis.opportunity}</p>
                  </div>
                )}
                {Array.isArray(oppAnalysis.build_plan) && (
                  <div>
                    <h4 className="font-semibold">Build plan</h4>
                    <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">
                      {oppAnalysis.build_plan.map((s: string, i: number) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  </div>
                )}
                {oppAnalysis.monetization && (
                  <div>
                    <h4 className="font-semibold">Monetization</h4>
                    <p className="mt-1 text-muted-foreground">{oppAnalysis.monetization}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Idea Radar */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold">Idea Radar</h2>
          <button
            onClick={loadIdeas}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading trending ideas…</p>
        ) : ideas.length === 0 ? (
          <p className="text-muted-foreground">
            No ideas right now. Try refreshing.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {ideas.map((idea) => (
              <button
                key={idea.id}
                onClick={() => analyzeIdea(idea)}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  selected?.id === idea.id
                    ? "border-primary bg-accent/30"
                    : "border-border bg-card hover:border-primary/50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium leading-snug">{idea.title}</h3>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                    {idea.hotness}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{idea.source}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Analysis panel */}
      {selected && (
        <section className="mt-8 rounded-lg border border-primary/30 bg-card p-6">
          <h2 className="font-serif text-xl font-semibold">{selected.title}</h2>
          {analyzing ? (
            <p className="mt-4 text-muted-foreground">Analyzing…</p>
          ) : analysis ? (
            <div className="mt-4 space-y-4 text-sm">
              <p>{analysis.summary}</p>
              <div>
                <h4 className="font-semibold">Why it's trending</h4>
                <p className="text-muted-foreground">{analysis.why_trending}</p>
              </div>
              <div>
                <h4 className="font-semibold">Target audience</h4>
                <p className="text-muted-foreground">{analysis.target_audience}</p>
              </div>
              <div>
                <h4 className="font-semibold">Key features</h4>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {analysis.key_features?.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
              <div>
                <h4 className="font-semibold">Monetization</h4>
                <p className="text-muted-foreground">{analysis.monetization}</p>
              </div>
              <div>
                <h4 className="font-semibold">Competition angle</h4>
                <p className="text-muted-foreground">{analysis.competition_angle}</p>
              </div>
              {analysis.suggested_keywords?.length > 0 && (
                <div>
                  <h4 className="font-semibold">Suggested keywords</h4>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {analysis.suggested_keywords.map((k, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-muted px-3 py-1 text-xs"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <button
                onClick={sendToBuilder}
                disabled={sending}
                className="mt-2 rounded-md bg-primary px-6 py-2.5 font-medium text-primary-foreground disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send to Builder →"}
              </button>
            </div>
          ) : null}
        </section>
      )}
    </main>
  );
}
