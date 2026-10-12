"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { timeAgo } from "@/lib/hunter/ui";

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

/** Real score tiers mapped onto the editorial design tokens. */
function tierStyle(score: number): {
  text: string;
  bar: string;
  pill: string;
  label: string;
} {
  if (score >= 71)
    return {
      text: "text-score-high",
      bar: "bg-score-high",
      pill: "border-score-high/30 bg-score-high/10 text-score-high",
      label: "High Opportunity",
    };
  if (score >= 41)
    return {
      text: "text-score-medium",
      bar: "bg-score-medium",
      pill: "border-score-medium/30 bg-score-medium/10 text-score-medium",
      label: "Medium Score",
    };
  return {
    text: "text-score-low",
    bar: "bg-score-low",
    pill: "border-score-low/30 bg-score-low/10 text-score-low",
    label: "Low Score",
  };
}

function ScanChip({ scan }: { scan: ScanJob }) {
  const dot =
    scan.status === "completed"
      ? "bg-score-high"
      : scan.status === "failed"
        ? "bg-score-low"
        : "animate-pulse bg-score-medium";
  return (
    <span
      title={scan.status === "failed" && scan.error ? scan.error : scan.status}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 font-mono text-xs text-muted-foreground"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {scan.keyword}
      {scan.status === "completed" ? (
        <span>
          {" "}
          · {scan.resultsCount} apps · {timeAgo(scan.createdAt)}
        </span>
      ) : (
        <span> · {scan.status}…</span>
      )}
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
  const tier = tierStyle(opp.score);
  return (
    <div className="card-paper p-6 transition-colors hover:bg-card-elevated">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="label-caps text-muted-foreground/70">app-id: {opp.appId}</p>
          <Link
            href={`/hunter/opportunities/${opp.id}`}
            className="mt-1 line-clamp-2 block font-medium leading-snug hover:underline"
          >
            {opp.title}
          </Link>
        </div>
        <button
          onClick={() => onBookmark(opp)}
          aria-label={opp.isBookmarked ? "Remove bookmark" : "Bookmark"}
          className={`shrink-0 rounded-md p-1 transition-colors ${
            opp.isBookmarked
              ? "text-score-medium"
              : "text-muted-foreground/40 hover:text-score-medium"
          }`}
        >
          <span
            className="material-symbols text-[20px]"
            style={
              opp.isBookmarked
                ? { fontVariationSettings: '"FILL" 1, "wght" 400, "GRAD" 0, "opsz" 20' }
                : undefined
            }
          >
            star
          </span>
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span className={`font-serif text-5xl leading-none ${tier.text}`}>
          {Math.round(opp.score)}
        </span>
        <span className={`label-caps rounded-full border px-2 py-0.5 ${tier.pill}`}>
          {tier.label}
        </span>
      </div>
      <div className="mt-2 h-1 bg-muted" title={`Opportunity score ${Math.round(opp.score)}/100`}>
        <div
          className={`h-full ${tier.bar}`}
          style={{ width: `${Math.min(100, Math.max(0, Math.round(opp.score)))}%` }}
        />
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
          <span className="material-symbols text-[14px]">star</span>
          {opp.rating != null ? opp.rating : "—"} · {opp.installs ?? "—"} installs
        </span>
        {opp.scanJob && (
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
            #{opp.scanJob.keyword.replace(/\s+/g, "-")}
          </span>
        )}
      </div>
    </div>
  );
}

function AnalysisSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="label-caps text-muted-foreground">{label}</h4>
      <div className="mt-2 text-sm leading-relaxed">{children}</div>
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
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(1);

  // Ideas
  const [ideas, setIdeas] = useState<TrendIdea[]>([]);
  const [ideasLoading, setIdeasLoading] = useState(true);
  const [radarOpen, setRadarOpen] = useState(true);
  const [showAllIdeas, setShowAllIdeas] = useState(false);
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

  // Slide-over: Escape to close + lock body scroll
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [selected]);

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
      if (data.refineUrl) router.push(data.refineUrl);
    } finally {
      setSending(false);
    }
  }

  const sortedOpps = [...opps].sort((a, b) =>
    sortDir === "desc" ? b.score - a.score : a.score - b.score
  );
  const visibleIdeas = showAllIdeas ? ideas : ideas.slice(0, 6);

  if (!authChecked) {
    return (
      <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-8">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-8">
      {/* Page header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl font-medium tracking-tight md:text-5xl">
            Opportunity Hunter
          </h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            Trending app ideas, validated against the real Play Store. Pick one,
            analyze it, then send it to the builder.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-sm">
          <span className="hidden text-muted-foreground sm:inline">
            {user?.name ?? user?.email}
          </span>
          <button onClick={logout} className="btn-ghost px-3 py-1.5 text-sm">
            Sign out
          </button>
        </div>
      </div>

      {/* Scan hero */}
      <section className="card-elevated mb-10 p-6 md:p-8">
        <h2 className="flex items-center gap-2 font-serif text-2xl font-medium">
          <span className="material-symbols text-primary text-[24px]">radar</span>
          Scan the Play Store
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter a keyword to find underrated apps in that niche — high rating,
          low installs, real opportunity.
        </p>
        <form onSubmit={(e) => runScan(e)} className="mt-5 flex gap-2">
          <div className="relative flex-1">
            <span className="material-symbols pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px] text-muted-foreground">
              search
            </span>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="habit tracker"
              className="input-paper pl-11"
            />
          </div>
          <button
            type="submit"
            disabled={scanning || !keyword.trim()}
            className="btn-primary shrink-0"
          >
            <span className="material-symbols text-[18px]">search</span>
            {scanning ? "Scanning… (30-60s)" : "Scan"}
          </button>
        </form>
        {scanError && (
          <p className="mt-4 rounded-md border border-score-low/40 bg-score-low/10 px-3 py-2 text-sm text-score-low">
            {scanError}
          </p>
        )}

        {scans.length > 0 && (
          <div className="mt-6 border-t border-border pt-5">
            <p className="label-caps mb-3 text-muted-foreground">Recent scans</p>
            <div className="flex flex-wrap gap-2">
              {scans.slice(0, 8).map((s) => (
                <ScanChip key={s.id} scan={s} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Opportunities */}
      <section className="mb-12">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-2xl font-medium">
            Opportunities{" "}
            <span className="font-mono text-base text-muted-foreground">({oppMeta.total})</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-56">
              <span className="material-symbols pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-muted-foreground">
                filter_list
              </span>
              <input
                value={search}
                onChange={(e) => applyFilters(e.target.value, bookmarkedOnly)}
                placeholder="Filter current view…"
                className="input-paper h-10 pl-10 text-sm"
                style={{ height: 40 }}
              />
            </div>
            <button
              onClick={() => applyFilters(search, !bookmarkedOnly)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                bookmarkedOnly
                  ? "border-score-medium/50 bg-score-medium/10 text-score-medium"
                  : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
              }`}
            >
              <span
                className="material-symbols text-[18px]"
                style={
                  bookmarkedOnly
                    ? { fontVariationSettings: '"FILL" 1, "wght" 400, "GRAD" 0, "opsz" 20' }
                    : undefined
                }
              >
                star
              </span>
              Bookmarked
            </button>
            <div className="relative w-44">
              <select
                value={sortDir}
                onChange={(e) => setSortDir(e.target.value as "desc" | "asc")}
                aria-label="Sort opportunities"
                className="input-paper h-10 appearance-none pr-9 text-sm"
                style={{ height: 40 }}
              >
                <option value="desc">Score: High to Low</option>
                <option value="asc">Score: Low to High</option>
              </select>
              <span className="material-symbols pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[18px] text-muted-foreground">
                unfold_more
              </span>
            </div>
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
          <div className="card-paper p-12 text-center">
            <p className="font-serif text-xl">No opportunities yet</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Run a scan above to find underrated apps.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {sortedOpps.map((o) => (
                <OpportunityCard key={o.id} opp={o} onBookmark={toggleBookmark} />
              ))}
            </div>
            {oppMeta.totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-3 text-sm">
                <button
                  disabled={page <= 1}
                  onClick={() => {
                    setPage(page - 1);
                    loadOpps(page - 1, search, bookmarkedOnly);
                  }}
                  className="btn-ghost px-3 py-1.5 disabled:opacity-40"
                >
                  <span className="material-symbols text-[18px]">arrow_back</span>
                  Prev
                </button>
                <span className="font-mono text-xs text-muted-foreground">
                  Page {oppMeta.page} of {oppMeta.totalPages}
                </span>
                <button
                  disabled={page >= oppMeta.totalPages}
                  onClick={() => {
                    setPage(page + 1);
                    loadOpps(page + 1, search, bookmarkedOnly);
                  }}
                  className="btn-ghost px-3 py-1.5 disabled:opacity-40"
                >
                  Next
                  <span className="material-symbols text-[18px]">arrow_forward</span>
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Idea Radar */}
      <section className="mb-8">
        <div className="mb-5 flex items-center justify-between">
          <button
            onClick={() => setRadarOpen(!radarOpen)}
            className="flex items-center gap-2"
            aria-expanded={radarOpen}
          >
            <span
              className={`material-symbols text-[20px] text-muted-foreground transition-transform ${
                radarOpen ? "" : "-rotate-90"
              }`}
            >
              keyboard_arrow_down
            </span>
            <h2 className="font-serif text-2xl font-medium">Idea Radar</h2>
          </button>
          <button
            onClick={loadIdeas}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <span className="material-symbols text-[18px]">sync</span>
            Refresh
          </button>
        </div>

        {radarOpen &&
          (ideasLoading ? (
            <p className="text-sm text-muted-foreground">Loading trending ideas…</p>
          ) : ideas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No ideas right now. Try refreshing.
            </p>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {visibleIdeas.map((idea) => (
                  <button
                    key={idea.id}
                    onClick={() => analyzeIdea(idea)}
                    className={`card-paper group p-5 text-left transition-colors ${
                      selected?.id === idea.id
                        ? "border-primary"
                        : "hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="label-caps text-muted-foreground/70">{idea.source}</p>
                        <h3 className="mt-1 line-clamp-2 font-medium leading-snug group-hover:underline">
                          {idea.title}
                        </h3>
                      </div>
                      <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 font-mono text-xs text-secondary-foreground">
                        {idea.hotness} pts
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              {ideas.length > 6 && (
                <div className="mt-4 text-center">
                  <button
                    onClick={() => setShowAllIdeas(!showAllIdeas)}
                    className="btn-ghost px-4 py-2 text-sm"
                  >
                    {showAllIdeas ? (
                      <>
                        Show less
                        <span className="material-symbols text-[18px]">keyboard_arrow_up</span>
                      </>
                    ) : (
                      <>
                        Show all {ideas.length} ideas
                        <span className="material-symbols text-[18px]">keyboard_arrow_down</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          ))}
      </section>

      {/* Idea analysis slide-over */}
      {selected && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/25"
            onClick={() => setSelected(null)}
          />
          <aside
            className="absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col border-l border-border bg-card-elevated drawer-shadow"
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <p className="label-caps text-muted-foreground">Idea analysis</p>
              <button
                onClick={() => setSelected(null)}
                aria-label="Close analysis"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <span className="material-symbols text-[20px]">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              <h2 className="font-serif text-2xl font-medium leading-snug">
                {selected.title}
              </h2>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {selected.source} · {selected.hotness} pts
              </p>

              {analyzing ? (
                <p className="mt-8 text-sm text-muted-foreground">
                  Analyzing this idea…
                </p>
              ) : analysis ? (
                <div className="mt-6 space-y-6">
                  <p className="text-[15px] leading-relaxed">{analysis.summary}</p>

                  <AnalysisSection label="Why it's trending">
                    <p className="text-muted-foreground">{analysis.why_trending}</p>
                  </AnalysisSection>

                  <AnalysisSection label="Target audience">
                    <p className="text-muted-foreground">{analysis.target_audience}</p>
                  </AnalysisSection>

                  <AnalysisSection label="Key features">
                    <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                      {analysis.key_features?.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </AnalysisSection>

                  <AnalysisSection label="Monetization">
                    <p className="text-muted-foreground">{analysis.monetization}</p>
                  </AnalysisSection>

                  <AnalysisSection label="Competition angle">
                    <p className="text-muted-foreground">{analysis.competition_angle}</p>
                  </AnalysisSection>

                  {analysis.suggested_keywords?.length > 0 && (
                    <div>
                      <h4 className="label-caps text-muted-foreground">
                        Scan the Play Store for competition
                      </h4>
                      <div className="mb-3 mt-3 flex flex-wrap gap-2">
                        {analysis.suggested_keywords.map((k) => (
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
                        className="btn-secondary w-full"
                      >
                        {scanning ? (
                          "Scanning…"
                        ) : (
                          <>
                            Scan Play Store for “
                            {scanKeyword || analysis.suggested_keywords[0]}”
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {analysis && (
              <div className="border-t border-border bg-card-elevated px-6 py-4">
                <button
                  onClick={sendToBuilder}
                  disabled={sending}
                  className="btn-primary w-full"
                >
                  {sending ? (
                    "Sending…"
                  ) : (
                    <>
                      Send to Builder
                      <span className="material-symbols text-[18px]">arrow_forward</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
