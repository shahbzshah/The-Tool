"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  createdAt: string;
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
  summary: string | null;
  scanJob?: { keyword: string; createdAt: string } | null;
};

/** Score tiers (Stitch pill language). */
function tierStyle(score: number): { text: string; pill: string; label: string } {
  if (score >= 71)
    return {
      text: "text-score-high",
      pill: "border-score-high/30 bg-score-high/10 text-score-high",
      label: "High",
    };
  if (score >= 41)
    return {
      text: "text-score-medium",
      pill: "border-score-medium/30 bg-score-medium/10 text-score-medium",
      label: "Medium",
    };
  return {
    text: "text-score-low",
    pill: "border-score-low/30 bg-score-low/10 text-score-low",
    label: "Low",
  };
}

function fmtScore(score: number): string {
  return String(Math.round(score));
}

/** Stitch stat card: label / big serif number / optional badge / mono sub-caption. */
function StatCard({
  label,
  value,
  badge,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  badge?: React.ReactNode;
  sub: string;
}) {
  return (
    <div className="card-paper flex flex-col justify-between p-3.5">
      <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="font-serif text-2xl font-bold text-foreground">{value}</span>
        {badge}
      </div>
      <span className="mt-1 truncate font-mono text-[10px] text-muted-foreground" title={sub}>
        {sub}
      </span>
    </div>
  );
}

/** Recent-scan chip — click to re-run. Red variant for failed scans. */
function ScanChip({ scan, onRerun }: { scan: ScanJob; onRerun: (kw: string) => void }) {
  const failed = scan.status === "failed";
  const dot =
    scan.status === "completed"
      ? "bg-score-high"
      : failed
        ? "bg-score-low"
        : "animate-pulse bg-score-medium";
  return (
    <button
      onClick={() => onRerun(scan.keyword)}
      title={failed && scan.error ? scan.error : `Re-run scan for "${scan.keyword}"`}
      className={`inline-flex min-h-[44px] items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors ${
        failed
          ? "border-score-low/40 bg-score-low/10 hover:border-score-low"
          : "border-border bg-card hover:border-primary"
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <span className={`font-medium ${failed ? "text-score-low" : "text-foreground"}`}>
        {scan.keyword}
      </span>
      {failed ? (
        <span className="rounded bg-score-low/15 px-1.5 py-0.5 font-mono text-[10px] font-medium text-score-low">
          {scan.error ? scan.error.split(":")[0].slice(0, 24) : "Failed"}
        </span>
      ) : scan.status === "completed" ? (
        <span className="font-mono text-[11px] text-muted-foreground">
          {scan.resultsCount} results
        </span>
      ) : (
        <span className="font-mono text-[11px] text-muted-foreground">{scan.status}…</span>
      )}
      <span className="border-l border-border pl-1.5 font-mono text-[10px] text-muted-foreground">
        {timeAgo(scan.createdAt)}
      </span>
    </button>
  );
}

/** Star bookmark toggle (ranked rows). */
function BookmarkStar({
  active,
  onToggle,
  label,
}: {
  active: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md border transition-colors ${
        active
          ? "border-score-medium/40 bg-score-medium/10 text-score-medium"
          : "border-transparent text-muted-foreground/50 hover:border-border hover:text-score-medium"
      }`}
    >
      <span
        className="material-symbols text-[18px]"
        style={
          active
            ? { fontVariationSettings: '"FILL" 1, "wght" 400, "GRAD" 0, "opsz" 20' }
            : undefined
        }
      >
        star
      </span>
    </button>
  );
}

/** Stitch ranked-list row. */
function OpportunityRow({
  opp,
  rank,
  onBookmark,
}: {
  opp: Opportunity;
  rank: number;
  onBookmark: (opp: Opportunity) => void;
}) {
  const tier = tierStyle(opp.score);
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border p-3.5 px-4 transition-colors last:border-b-0 hover:bg-muted/50 md:gap-4">
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="w-6 shrink-0 text-right font-mono text-sm font-bold text-muted-foreground">
          {String(rank).padStart(2, "0")}
        </span>
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-2">
            <Link
              href={`/hunter/opportunities/${opp.id}`}
              className="truncate font-serif font-bold text-foreground transition-colors hover:text-primary"
            >
              {opp.title}
            </Link>
            {opp.category && (
              <span className="hidden shrink-0 rounded border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground sm:inline">
                {opp.category}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <span className="font-medium text-score-medium">
              {opp.rating != null ? `${opp.rating} ★` : "—"}
            </span>
            <span>·</span>
            <span>{opp.installs ? `${opp.installs} installs` : "—"}</span>
            <span className="hidden md:inline">·</span>
            <span className="hidden max-w-[190px] truncate md:inline">{opp.appId}</span>
            {opp.scanJob && (
              <>
                <span className="hidden md:inline">·</span>
                <span className="hidden md:inline">kw: &quot;{opp.scanJob.keyword}&quot;</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 md:gap-4">
        <div className="text-right">
          <span className={`font-serif text-lg font-bold ${tier.text}`}>
            {fmtScore(opp.score)}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">/100</span>
        </div>
        <span
          className={`hidden rounded border px-2 py-0.5 text-[11px] font-semibold sm:inline ${tier.pill}`}
        >
          {tier.label}
        </span>
        <BookmarkStar
          active={opp.isBookmarked}
          onToggle={() => onBookmark(opp)}
          label={opp.isBookmarked ? "Remove bookmark" : "Bookmark"}
        />
      </div>
    </div>
  );
}

/** Colored source badge for radar rows. */
function sourceBadge(source: string): { label: string; cls: string } {
  const s = source.toLowerCase();
  if (s.includes("hacker"))
    return {
      label: "HN",
      cls: "border-score-medium/30 bg-score-medium/10 text-score-medium",
    };
  if (s.includes("reddit"))
    return { label: "REDDIT", cls: "border-primary/30 bg-primary/10 text-primary" };
  if (s.includes("product"))
    return { label: "PH", cls: "border-score-low/30 bg-score-low/10 text-score-low" };
  return {
    label: source.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase() || "WEB",
    cls: "border-border bg-muted text-muted-foreground",
  };
}

/** Section heading inside the slide-over (Stitch: mono caps + rust icon). */
function DrawerSection({
  icon,
  label,
  right,
  children,
}: {
  icon: string;
  label: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="mb-1.5 flex items-center justify-between font-mono text-[11px] font-bold uppercase tracking-wider text-foreground">
        <span className="flex items-center gap-1.5">
          <span className="material-symbols text-[14px] text-primary">{icon}</span>
          {label}
        </span>
        {right}
      </h4>
      {children}
    </div>
  );
}

/** Bottom-right toast. */
function Toast({ msg }: { msg: string | null }) {
  return (
    <div
      aria-live="polite"
      className={`fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-md bg-foreground px-4 py-2.5 text-xs text-background shadow-lg transition-transform duration-200 ${
        msg ? "" : "pointer-events-none translate-y-24"
      }`}
    >
      <span className="material-symbols text-[16px] text-score-high">check_circle</span>
      <span>{msg ?? ""}</span>
    </div>
  );
}

export default function HunterPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

  // Scans
  const [scans, setScans] = useState<ScanJob[]>([]);
  const [keyword, setKeyword] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const scanRef = useRef<HTMLElement | null>(null);

  // Opportunities
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [oppMeta, setOppMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [bookmarkedCount, setBookmarkedCount] = useState(0);
  const [search, setSearch] = useState("");
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(1);

  // Ideas
  const [ideas, setIdeas] = useState<TrendIdea[]>([]);
  const [ideasLoading, setIdeasLoading] = useState(true);
  const [radarOpen, setRadarOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 1024
  );
  const [showAllIdeas, setShowAllIdeas] = useState(false);
  const [selected, setSelected] = useState<TrendIdea | null>(null);
  const [analysis, setAnalysis] = useState<IdeaAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [sending, setSending] = useState(false);

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3200);
  }, []);

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
        setAuthChecked(true);
        loadScans();
        loadOpps(1, "", false);
        loadIdeas();
        // Bookmark count for the stat strip (total only — one cheap row).
        try {
          const bRes = await fetch("/api/hunter/opportunities?bookmarked=1&perPage=1");
          if (bRes.ok) {
            const bData = await bRes.json();
            setBookmarkedCount(bData.total ?? 0);
          }
        } catch {
          /* ignore */
        }
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

  async function runScan(e?: React.FormEvent, kw?: string) {
    const k = (kw ?? keyword).trim();
    if (e) e.preventDefault();
    if (!k || scanning) return;
    setScanning(true);
    setScanError("");
    showToast(`Scanning Play Store for "${k}"…`);
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
      const nowBookmarked = data.opportunity.isBookmarked as boolean;
      setOpps((prev) =>
        prev.map((o) => (o.id === opp.id ? { ...o, isBookmarked: nowBookmarked } : o))
      );
      setBookmarkedCount((c) => c + (nowBookmarked ? 1 : -1));
      showToast(nowBookmarked ? `Bookmarked "${opp.title}"` : "Bookmark removed");
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
      if (data.refineUrl) {
        showToast("Sent to Step 2: Refine");
        router.push(data.refineUrl);
      }
    } finally {
      setSending(false);
    }
  }

  /** Keyword pill in the slide-over: fill input, close drawer, scroll up, scan. */
  async function scanFromPill(k: string) {
    setSelected(null);
    setKeyword(k);
    scanRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    await runScan(undefined, k);
  }

  const sortedOpps = [...opps].sort((a, b) =>
    sortDir === "desc" ? b.score - a.score : a.score - b.score
  );
  // Editor's pick: the true #1, only on the unfiltered first page (high→low).
  const showPick =
    page === 1 && !search && !bookmarkedOnly && sortDir === "desc" && sortedOpps.length > 0;
  const pick = showPick ? sortedOpps[0] : null;
  const listOpps = showPick ? sortedOpps.slice(1) : sortedOpps;
  const pickTier = pick ? tierStyle(pick.score) : null;
  const visibleIdeas = showAllIdeas ? ideas : ideas.slice(0, 6);

  // Pagination range for the footer line.
  const rangeStart = oppMeta.total === 0 ? 0 : (oppMeta.page - 1) * 20 + 1;
  const rangeEnd = Math.min(oppMeta.page * 20, oppMeta.total);

  // Split the audience string into two boxes for the 2-col grid.
  const audienceHalves: [string, string] = (() => {
    if (!analysis?.target_audience) return ["", ""];
    const parts = analysis.target_audience.split(/(?<=\.)\s+/).filter(Boolean);
    if (parts.length < 2) return [analysis.target_audience, ""];
    const mid = Math.ceil(parts.length / 2);
    return [parts.slice(0, mid).join(" "), parts.slice(mid).join(" ")];
  })();

  if (!authChecked) {
    return (
      <main className="mx-auto w-full max-w-[1580px] px-4 py-8 md:px-6">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1580px] flex-1 px-4 py-7 md:px-6">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* LEFT: main content */}
        <div className="flex flex-col gap-6 lg:col-span-8">
          {/* 1. Page title block */}
          <div className="flex flex-col gap-1 border-b border-border pb-5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-primary">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                Play Store realtime telemetry
              </span>
            </div>
            <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-foreground">
              Opportunity Hunter
            </h1>
            <p className="text-sm font-normal text-muted-foreground">
              Trending app ideas, validated against the real Play Store. High ratings
              coupled with underserved install volume.
            </p>
          </div>

          {/* 2. Stat strip */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Overview">
            <StatCard
              label="Opportunities Indexed"
              value={oppMeta.total.toLocaleString()}
              sub="Verified Play Store packages"
            />
            <StatCard
              label="Bookmarked"
              value={bookmarkedCount.toLocaleString()}
              badge={
                <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  Active queue
                </span>
              }
              sub="Saved for pipeline refine"
            />
            <StatCard
              label="Recent Scans"
              value={scans.length}
              sub="latest scan runs"
            />
            <StatCard
              label="Watchlist"
              value={
                <>
                  12 <span className="font-mono text-xs font-normal text-muted-foreground">terms</span>
                </>
              }
              badge={
                <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  Auto-scan
                </span>
              }
              sub="12 keywords · daily 06:51 EAT"
            />
          </div>

          {/* 3. Scan hero */}
          <section ref={scanRef} className="card-elevated flex scroll-mt-24 flex-col gap-4 p-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded border border-primary/30 bg-primary/10 text-primary">
                  <span className="material-symbols text-[14px]">radar</span>
                </div>
                <h2 className="font-serif text-lg font-semibold text-foreground">
                  Scan the Play Store
                </h2>
              </div>
            </div>

            <form onSubmit={(e) => runScan(e)} className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <span className="material-symbols pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-muted-foreground">
                  search
                </span>
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="e.g. minimalist habit tracker, offline inventory…"
                  className="input-paper pl-10"
                  aria-label="Play Store keyword"
                />
              </div>
              <button
                type="submit"
                disabled={scanning || !keyword.trim()}
                className="btn-primary min-h-[44px] shrink-0"
              >
                <span className="material-symbols text-[18px]">qr_code_scanner</span>
                <span>{scanning ? "Scanning…" : "Scan Play Store"}</span>
              </button>
            </form>
            {scanError && (
              <p className="rounded-md border border-score-low/40 bg-score-low/10 px-3 py-2 text-sm text-score-low">
                {scanError}
              </p>
            )}

            {scans.length > 0 && (
              <div className="flex flex-col gap-2 pt-1">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Recent scans (click chip to rerun)
                </p>
                <div className="flex flex-wrap gap-2">
                  {scans.slice(0, 8).map((s) => (
                    <ScanChip
                      key={s.id}
                      scan={s}
                      onRerun={(kw) => {
                        setKeyword(kw);
                        runScan(undefined, kw);
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 4. Editor's pick */}
          {pick && pickTier && (
            <section className="card-elevated relative overflow-hidden p-5" aria-label="Top opportunity">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <span className="rounded border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-wider text-primary">
                    № 01 · Top opportunity
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Highest scoring opportunity
                  </span>
                </div>
                <span className="rounded border border-border bg-card px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                  ★ {pick.rating != null ? pick.rating : "—"} /{" "}
                  {pick.installs ? `${pick.installs} installs` : "—"}
                </span>
              </div>

              <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-12">
                <div className="flex items-center justify-between gap-4 border-b border-border pb-3 md:col-span-3 md:flex-col md:items-start md:justify-center md:border-b-0 md:border-r md:pb-0 md:pr-4">
                  <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    Opportunity
                  </span>
                  <div className="my-1 flex items-baseline gap-1">
                    <span className={`font-serif text-5xl font-bold leading-none ${pickTier.text}`}>
                      {fmtScore(pick.score)}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">/100</span>
                  </div>
                  <span
                    className={`mt-1 inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${pickTier.pill}`}
                  >
                    {pickTier.label} Potential
                  </span>
                </div>

                <div className="flex h-full flex-col justify-between md:col-span-9">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/hunter/opportunities/${pick.id}`}
                          className="font-serif text-xl font-bold tracking-tight text-foreground transition-colors hover:text-primary"
                        >
                          {pick.title}
                        </Link>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
                          <span className="font-semibold text-score-medium">
                            {pick.rating != null ? `${pick.rating} ★` : "—"}
                          </span>
                          <span>·</span>
                          <span className="font-medium text-foreground">
                            {pick.installs ? `${pick.installs} installs` : "—"}
                          </span>
                          <span>·</span>
                          <span className="truncate">pkg: {pick.appId}</span>
                          {pick.scanJob && (
                            <>
                              <span>·</span>
                              <span className="rounded border border-border bg-muted px-1.5 py-0.5">
                                kw: &quot;{pick.scanJob.keyword}&quot;
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleBookmark(pick)}
                        aria-label={pick.isBookmarked ? "Remove bookmark" : "Bookmark"}
                        title={pick.isBookmarked ? "Remove bookmark" : "Bookmark"}
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md border transition-colors ${
                          pick.isBookmarked
                            ? "border-score-medium/40 bg-score-medium/10 text-score-medium"
                            : "border-border text-muted-foreground hover:bg-muted hover:text-score-medium"
                        }`}
                      >
                        <span
                          className="material-symbols text-[18px]"
                          style={
                            pick.isBookmarked
                              ? { fontVariationSettings: '"FILL" 1, "wght" 400, "GRAD" 0, "opsz" 20' }
                              : undefined
                          }
                        >
                          bookmark
                        </span>
                      </button>
                    </div>

                    {pick.summary && (
                      <p className="mt-3 rounded-r border-l-2 border-primary/40 bg-muted/50 py-0.5 pl-3 text-xs leading-relaxed text-muted-foreground">
                        <strong className="font-medium text-foreground">Why it scores:</strong>{" "}
                        {pick.summary}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {pick.scanJob ? `Scanned ${timeAgo(pick.scanJob.createdAt)}` : "Scanned recently"}
                    </span>
                    <Link
                      href={`/hunter/opportunities/${pick.id}`}
                      className="btn-primary min-h-[44px] !px-4 !py-2 text-xs"
                    >
                      <span>Analyze</span>
                      <span className="material-symbols text-[16px]">arrow_forward</span>
                    </Link>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 5. Ranked opportunities list */}
          <section className="card-paper flex flex-col" aria-label="Ranked opportunities">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
              <div className="flex min-w-[240px] flex-1 flex-wrap items-center gap-2">
                <div className="relative w-full max-w-sm">
                  <span className="material-symbols pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-muted-foreground">
                    filter_list
                  </span>
                  <input
                    value={search}
                    onChange={(e) => applyFilters(e.target.value, bookmarkedOnly)}
                    placeholder="Filter ranked opportunities…"
                    aria-label="Filter ranked opportunities"
                    className="input-paper min-h-[44px] pl-10 !text-xs"
                  />
                </div>
                <button
                  onClick={() => applyFilters(search, !bookmarkedOnly)}
                  aria-pressed={bookmarkedOnly}
                  className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    bookmarkedOnly
                      ? "border-score-medium/50 bg-score-medium/10 text-score-medium"
                      : "border-border bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <span
                    className="material-symbols text-[16px]"
                    style={
                      bookmarkedOnly
                        ? { fontVariationSettings: '"FILL" 1, "wght" 400, "GRAD" 0, "opsz" 20' }
                        : undefined
                    }
                  >
                    star
                  </span>
                  <span>Bookmarked only</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-muted-foreground">Sort:</span>
                <div className="inline-flex rounded-md border border-border bg-muted p-0.5">
                  <button
                    onClick={() => setSortDir("desc")}
                    className={`min-h-[44px] rounded px-2 py-1 font-medium md:min-h-0 ${
                      sortDir === "desc"
                        ? "bg-card font-semibold text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Score: High → Low
                  </button>
                  <button
                    onClick={() => setSortDir("asc")}
                    className={`min-h-[44px] rounded px-2 py-1 font-medium md:min-h-0 ${
                      sortDir === "asc"
                        ? "bg-card font-semibold text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Low → High
                  </button>
                </div>
                {(search || bookmarkedOnly) && (
                  <button
                    onClick={() => applyFilters("", false)}
                    title="Reset filters"
                    aria-label="Reset filters"
                    className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                  >
                    <span className="material-symbols text-[18px]">refresh</span>
                  </button>
                )}
              </div>
            </div>

            {listOpps.length === 0 ? (
              <div className="p-12 text-center">
                <p className="font-serif text-xl text-foreground">No opportunities yet</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Run a scan above to find underrated apps.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {listOpps.map((o, i) => (
                  <OpportunityRow
                    key={o.id}
                    opp={o}
                    rank={showPick ? i + 2 : i + 1}
                    onBookmark={toggleBookmark}
                  />
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 p-3.5 text-xs">
              <span className="font-mono text-muted-foreground">
                Page <strong className="text-foreground">{oppMeta.page}</strong> of{" "}
                <strong className="text-foreground">{oppMeta.totalPages}</strong> · Showing{" "}
                {rangeStart}-{rangeEnd} of {oppMeta.total} opportunities
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  disabled={page <= 1}
                  onClick={() => {
                    setPage(page - 1);
                    loadOpps(page - 1, search, bookmarkedOnly);
                  }}
                  className="btn-ghost min-h-[44px] !px-3 !py-1 text-xs disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  disabled={page >= oppMeta.totalPages}
                  onClick={() => {
                    setPage(page + 1);
                    loadOpps(page + 1, search, bookmarkedOnly);
                  }}
                  className="btn-ghost min-h-[44px] !px-3 !py-1 text-xs disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* RIGHT: Idea Radar rail */}
        <div className="lg:col-span-4">
          <div className="sticky top-20 flex flex-col gap-4">
            <div className="card-paper p-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 animate-ping rounded-full bg-primary" />
                  <h3 className="font-serif text-base font-bold text-foreground">Idea Radar</h3>
                  <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                    Live
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={loadIdeas}
                    title="Refresh radar stream"
                    aria-label="Refresh radar stream"
                    className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <span className="material-symbols text-[18px]">refresh</span>
                  </button>
                  <button
                    onClick={() => setRadarOpen(!radarOpen)}
                    title={radarOpen ? "Collapse card" : "Expand card"}
                    aria-label={radarOpen ? "Collapse card" : "Expand card"}
                    aria-expanded={radarOpen}
                    className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <span className="material-symbols text-[18px]">
                      {radarOpen ? "expand_less" : "expand_more"}
                    </span>
                  </button>
                </div>
              </div>

              {radarOpen &&
                (ideasLoading ? (
                  <p className="py-4 text-sm text-muted-foreground">Loading trending ideas…</p>
                ) : ideas.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">
                    No ideas right now. Try refreshing.
                  </p>
                ) : (
                  <>
                    <p className="my-2.5 text-[11px] leading-normal text-muted-foreground">
                      Realtime community discussions signaling unmet user demand. Click any
                      item to inspect analysis.
                    </p>
                    <div className="divide-y divide-border">
                      {visibleIdeas.map((idea) => {
                        const badge = sourceBadge(idea.source);
                        return (
                          <button
                            key={idea.id}
                            onClick={() => analyzeIdea(idea)}
                            className="group -mx-2 w-[calc(100%+1rem)] cursor-pointer rounded px-2 py-2.5 text-left transition-colors hover:bg-muted/50"
                          >
                            <div className="mb-1 flex items-center justify-between gap-1">
                              <span
                                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${badge.cls}`}
                              >
                                {badge.label}
                              </span>
                              <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                                <span className="font-semibold text-primary">
                                  {idea.hotness} pts
                                </span>
                              </div>
                            </div>
                            <h5
                              className={`line-clamp-2 text-xs font-medium leading-snug transition-colors group-hover:text-primary ${
                                selected?.id === idea.id ? "text-primary" : "text-foreground"
                              }`}
                            >
                              {idea.title}
                            </h5>
                            <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                              <span>{timeAgo(idea.createdAt)}</span>
                              <span>→ Tap to analyze</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {ideas.length > 6 && (
                      <div className="mt-2 border-t border-border pt-3 text-center">
                        <button
                          onClick={() => setShowAllIdeas(!showAllIdeas)}
                          className="mx-auto flex min-h-[44px] items-center justify-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary-hover"
                        >
                          <span>
                            {showAllIdeas ? "Show less" : `Show all ${ideas.length} ideas`}
                          </span>
                          <span className="material-symbols text-[16px]">
                            {showAllIdeas ? "expand_less" : "expand_more"}
                          </span>
                        </button>
                      </div>
                    )}
                  </>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* 6. Idea analysis slide-over */}
      {selected && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/25 backdrop-blur-[1px]"
            onClick={() => setSelected(null)}
          />
          <aside className="drawer-shadow absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col border-l border-border bg-card-elevated">
            <div className="flex items-start justify-between gap-4 border-b border-border bg-card p-5">
              <div className="flex min-w-0 flex-col gap-1 pr-2">
                <div className="flex flex-wrap items-center gap-2">
                  {(() => {
                    const badge = sourceBadge(selected.source);
                    return (
                      <span
                        className={`rounded border px-2 py-0.5 font-mono text-[10px] font-bold ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    );
                  })()}
                  <span className="font-mono text-xs font-semibold text-primary">
                    {selected.hotness} hotness pts
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    Realtime Scan
                  </span>
                </div>
                <h3 className="mt-1 font-serif text-lg font-bold leading-snug tracking-tight text-foreground">
                  {selected.title}
                </h3>
              </div>
              <button
                onClick={() => setSelected(null)}
                title="Close analysis"
                aria-label="Close analysis"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <span className="material-symbols text-[20px]">close</span>
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5 text-xs text-muted-foreground">
              {analyzing ? (
                <p className="text-sm">Analyzing this idea…</p>
              ) : analysis ? (
                <>
                  <DrawerSection icon="description" label="Summary">
                    <p className="rounded border border-border bg-muted p-3 font-sans leading-relaxed text-muted-foreground">
                      {analysis.summary}
                    </p>
                  </DrawerSection>

                  <DrawerSection icon="trending_up" label="Why Trending">
                    <p className="font-sans leading-relaxed">{analysis.why_trending}</p>
                  </DrawerSection>

                  <DrawerSection icon="group" label="Target Audience">
                    <div className="grid grid-cols-1 gap-2 font-sans sm:grid-cols-2">
                      {audienceHalves[0] && (
                        <div className="rounded border border-border bg-card p-2.5">
                          <p className="text-[11px] leading-relaxed">{audienceHalves[0]}</p>
                        </div>
                      )}
                      {audienceHalves[1] && (
                        <div className="rounded border border-border bg-card p-2.5">
                          <p className="text-[11px] leading-relaxed">{audienceHalves[1]}</p>
                        </div>
                      )}
                    </div>
                  </DrawerSection>

                  <DrawerSection icon="check_circle" label="Key Features">
                    <ul className="space-y-1.5 pl-1 font-sans">
                      {analysis.key_features?.map((f, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="material-symbols mt-0.5 shrink-0 text-[14px] text-primary">
                            check
                          </span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </DrawerSection>

                  <DrawerSection icon="payments" label="Monetization Ideas">
                    <div className="rounded border border-score-medium/30 bg-score-medium/10 p-3 font-sans">
                      <p className="leading-relaxed text-foreground">{analysis.monetization}</p>
                    </div>
                  </DrawerSection>

                  <DrawerSection icon="swords" label="Competition Angle">
                    <p className="font-sans leading-relaxed">{analysis.competition_angle}</p>
                  </DrawerSection>

                  {analysis.suggested_keywords?.length > 0 && (
                    <DrawerSection
                      icon="sell"
                      label="Suggested Keywords"
                      right={
                        <span className="font-mono text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
                          Tap to trigger Play Store scan
                        </span>
                      }
                    >
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {analysis.suggested_keywords.map((k) => (
                          <button
                            key={k}
                            onClick={() => scanFromPill(k)}
                            disabled={scanning}
                            className="flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 font-mono text-[11px] text-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                          >
                            <span>&quot;{k}&quot;</span>
                            <span className="material-symbols text-[12px] text-primary">
                              search
                            </span>
                          </button>
                        ))}
                      </div>
                    </DrawerSection>
                  )}
                </>
              ) : null}
            </div>

            {analysis && (
              <div className="flex items-center justify-between gap-3 border-t border-border bg-card p-4">
                <div className="flex flex-col">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    Pipeline Transition
                  </span>
                  <span className="text-xs font-semibold text-foreground">
                    Send to Step 2: Refine
                  </span>
                </div>
                <button
                  onClick={sendToBuilder}
                  disabled={sending}
                  className="btn-primary min-h-[44px] !px-5 !py-2.5 text-xs"
                >
                  <span>{sending ? "Sending…" : "Send to Builder"}</span>
                  <span className="material-symbols text-[16px]">arrow_forward</span>
                </button>
              </div>
            )}
          </aside>
        </div>
      )}

      <Toast msg={toastMsg} />
    </main>
  );
}
