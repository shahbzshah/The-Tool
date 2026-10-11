"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { scoreTier, timeAgo } from "@/lib/hunter/ui";

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

type ScanJob = {
  id: string;
  keyword: string;
  status: string;
  resultsCount: number;
  error: string | null;
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
  url: string | null;
  isBookmarked: boolean;
  scanJob?: { keyword: string; createdAt: string } | null;
};

function ScanStatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-green-500/15 text-green-600 border-green-500/30",
    failed: "bg-red-500/15 text-red-600 border-red-500/30",
    running: "bg-amber-500/15 text-amber-600 border-amber-500/30",
    pending: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
        styles[status] ?? styles.pending
      }`}
    >
      {status}
    </span>
  );
}

function OpportunityCard({
  opp,
  onBookmark,
}: {
  opp: Opportunity;
  onBookmark: (opp: Opportunity) => void;
}) {
  const tier = scoreTier(opp.score);
  return (
    <div className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/hunter/opportunities/${opp.id}`}
          className="font-medium leading-snug hover:underline"
        >
          {opp.title}
        </Link>
        <button
          onClick={() => onBookmark(opp)}
          aria-label={opp.isBookmarked ? "Remove bookmark" : "Bookmark"}
          className={`shrink-0 text-xl leading-none ${
            opp.isBookmarked ? "text-amber-500" : "text-muted-foreground/40 hover:text-amber-500"
          }`}
        >
          {opp.isBookmarked ? "★" : "☆"}
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="font-mono text-2xl font-bold" style={{ color: tier.color }}>
          {tier.score}
        </span>
        <span className="text-xs text-muted-foreground">{tier.label}</span>
      </div>
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
        title={`Opportunity score ${tier.score}/100`}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, tier.score))}%`, backgroundColor: tier.color }}
        />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {opp.rating != null ? `★${opp.rating}` : "—"} · {opp.installs ?? "—"} installs
        </span>
        {opp.scanJob && <span>“{opp.scanJob.keyword}”</span>}
      </div>
    </div>
  );
}

export default function HunterPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ email: string; name?: string | null } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Scans
  const [scans, setScans] = useState<ScanJob[]>([]);
  const [keyword, setKeyword] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");

  // Opportunities
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [oppMeta, setOppMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [search, setSearch] = useState("");
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [page, setPage] = useState(1);

  // Ideas
  const [ideas, setIdeas] = useState<TrendIdea[]>([]);
  const [ideasLoading, setIdeasLoading] = useState(true);
  const [selected, setSelected] = useState<TrendIdea | null>(null);
  const [analysis, setAnalysis] = useState<IdeaAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [sending, setSending] = useState(false);
  const [scanKeyword, setScanKeyword] = useState("");

  const loadScans = useCallback(async () => {
    try {
      const res = await fetch("/api/hunter/scans");
      if (res.status === 401) return;
      const data = await res.json();
      setScans(data.scans ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const loadOpps = useCallback(
    async (p = page, s = search, b = bookmarkedOnly) => {
      try {
        const q = new URLSearchParams({
          page: String(p),
          perPage: "20",
          ...(s ? { search: s } : {}),
          ...(b ? { bookmarked: "1" } : {}),
        });
        const res = await fetch(`/api/hunter/opportunities?${q}`);
        if (res.status === 401) return;
        const data = await res.json();
        setOpps(data.opportunities ?? []);
        setOppMeta({
          total: data.total ?? 0,
          page: data.page ?? 1,
          totalPages: data.totalPages ?? 1,
        });
      } catch {
        /* ignore */
      }
    },
    [page, search, bookmarkedOnly]
  );

  const loadIdeas = useCallback(async () => {
    setIdeasLoading(true);
    try {
      const res = await fetch("/api/hunter/ideas");
      const data = await res.json();
      setIdeas(data.ideas ?? []);
    } catch {
      setIdeas([]);
    } finally {
      setIdeasLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (!data.user) {
          router.push("/login");
          return;
        }
        setUser(data.user);
        setAuthChecked(true);
        loadScans();
        loadOpps(1, "", false);
        loadIdeas();
      } catch {
        router.push("/login");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function runScan(e?: React.FormEvent, kw?: string) {
    const k = (kw ?? keyword).trim();
    if (e) e.preventDefault();
    if (!k || scanning) return;
    setScanning(true);
    setScanError("");
    try {
      const res = await fetch("/api/hunter/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: k }),
      });
      const data = await res.json();
      if (!res.ok) {
        setScanError(data.error ?? "Scan failed.");
        return;
      }
      setKeyword("");
      await loadScans();
      setPage(1);
      setSearch("");
      setBookmarkedOnly(false);
      await loadOpps(1, "", false);
    } finally {
      setScanning(false);
    }
  }

  async function toggleBookmark(opp: Opportunity) {
    try {
      const res = await fetch(`/api/hunter/opportunities/${opp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBookmarked: !opp.isBookmarked }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setOpps((prev) =>
        prev.map((o) =>
          o.id === opp.id ? { ...o, isBookmarked: data.opportunity.isBookmarked } : o
        )
      );
    } catch {
      /* ignore */
    }
  }

  function applyFilters(s: string, b: boolean) {
    setSearch(s);
    setBookmarkedOnly(b);
    setPage(1);
    loadOpps(1, s, b);
  }

  async function analyzeIdea(idea: TrendIdea) {
    setSelected(idea);
    setScanKeyword("");
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

  if (!authChecked) {
    return (
      <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-16">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-16">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">
            Opportunity Hunter
          </h1>
          <p className="mt-2 text-muted-foreground">
            Trending app ideas, validated against the real Play Store. Pick one,
            analyze it, then send it to the builder.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-sm">
          <span className="hidden text-muted-foreground sm:inline">
            {user?.name ?? user?.email}
          </span>
          <button
            onClick={logout}
            className="rounded-md border border-border px-3 py-1.5 hover:border-primary"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Scan */}
      <section className="mb-8 rounded-lg border border-border bg-card p-6">
        <h2 className="font-serif text-xl font-semibold">Scan the Play Store</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter a keyword to find underrated apps in that niche — high rating,
          low installs, real opportunity.
        </p>
        <form onSubmit={(e) => runScan(e)} className="mt-4 flex gap-2">
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
            {scanning ? "Scanning… (30-60s)" : "Scan"}
          </button>
        </form>
        {scanError && (
          <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
            {scanError}
          </p>
        )}

        {scans.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
              Recent scans
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
              {scans.slice(0, 10).map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg border border-border p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{s.keyword}</span>
                    <ScanStatusPill status={s.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s.status === "completed" && `${s.resultsCount} apps · `}
                    {timeAgo(s.createdAt)}
                  </p>
                  {s.status === "failed" && s.error && (
                    <p className="mt-1 text-xs text-red-500">{s.error}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Opportunities */}
      <section className="mb-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-xl font-semibold">
            Opportunities{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({oppMeta.total})
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => applyFilters(e.target.value, bookmarkedOnly)}
              placeholder="Search apps…"
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
            <button
              onClick={() => applyFilters(search, !bookmarkedOnly)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                bookmarkedOnly
                  ? "border-amber-500 bg-amber-500/10 text-amber-600"
                  : "border-border hover:border-primary"
              }`}
            >
              ★ Bookmarked
            </button>
            {(search || bookmarkedOnly) && (
              <button
                onClick={() => applyFilters("", false)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {opps.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            No opportunities yet. Run a scan above to find underrated apps.
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {opps.map((o) => (
                <OpportunityCard key={o.id} opp={o} onBookmark={toggleBookmark} />
              ))}
            </div>
            {oppMeta.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-3 text-sm">
                <button
                  disabled={page <= 1}
                  onClick={() => {
                    setPage(page - 1);
                    loadOpps(page - 1, search, bookmarkedOnly);
                  }}
                  className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
                >
                  ← Prev
                </button>
                <span className="text-muted-foreground">
                  Page {oppMeta.page} of {oppMeta.totalPages}
                </span>
                <button
                  disabled={page >= oppMeta.totalPages}
                  onClick={() => {
                    setPage(page + 1);
                    loadOpps(page + 1, search, bookmarkedOnly);
                  }}
                  className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            )}
          </>
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

        {ideasLoading ? (
          <p className="text-muted-foreground">Loading trending ideas…</p>
        ) : ideas.length === 0 ? (
          <p className="text-muted-foreground">No ideas right now. Try refreshing.</p>
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

      {/* Idea analysis panel */}
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
                  <h4 className="font-semibold">Scan the Play Store for competition</h4>
                  <div className="mb-3 mt-2 flex flex-wrap gap-2">
                    {analysis.suggested_keywords.map((k, i) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setScanKeyword(k)}
                        className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                          (scanKeyword || analysis.suggested_keywords[0]) === k
                            ? "border-primary bg-primary font-medium text-primary-foreground"
                            : "border-border text-muted-foreground hover:border-primary"
                        }`}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() =>
                      runScan(undefined, scanKeyword || analysis.suggested_keywords[0])
                    }
                    disabled={scanning}
                    className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {scanning
                      ? "Scanning…"
                      : `Scan Play Store for “${scanKeyword || analysis.suggested_keywords[0]}”`}
                  </button>
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
