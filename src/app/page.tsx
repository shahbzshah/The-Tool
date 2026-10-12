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

/** Score tiers. */
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

/** Stat card: mono label / big serif number / optional badge / mono sub-caption. */
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
    <div className="card-paper flex flex-col justify-between p-3">
      <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="font-serif text-[32px] font-light leading-tight text-foreground">
          {value}
        </span>
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
      className={`inline-flex min-h-[44px] items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors ${
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

/** Star bookmark toggle (44px tap target). */
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
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition-colors active:scale-90 ${
        active
          ? "text-score-medium"
          : "text-muted-foreground/60 hover:text-score-medium"
      }`}
    >
      <span
        className="material-symbols text-[20px]"
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

/** Ranked opportunity card (Stitch mobile article style). Tap → detail page. */
function OpportunityCard({
  opp,
  rank,
  onBookmark,
  onOpen,
}: {
  opp: Opportunity;
  rank: number;
  onBookmark: (opp: Opportunity) => void;
  onOpen: (opp: Opportunity) => void;
}) {
  const tier = tierStyle(opp.score);
  return (
    <article
      onClick={() => onOpen(opp)}
      className="card-paper cursor-pointer p-3 transition-colors active:scale-[0.99]"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(opp);
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-baseline gap-2.5">
          <span className="shrink-0 font-mono text-sm font-bold text-muted-foreground">
            #{String(rank).padStart(2, "0")}
          </span>
          <h3 className="truncate font-serif text-lg font-medium text-foreground">
            {opp.title}
          </h3>
          <span className={`ml-auto shrink-0 font-serif text-[22px] font-medium ${tier.text}`}>
            {fmtScore(opp.score)}
          </span>
        </div>
        <BookmarkStar
          active={opp.isBookmarked}
          onToggle={() => onBookmark(opp)}
          label={opp.isBookmarked ? "Remove bookmark" : "Bookmark"}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2 font-mono text-[11px]">
        {opp.category && (
          <span className="rounded border border-border bg-muted px-2 py-0.5 text-muted-foreground">
            {opp.category.toUpperCase()}
          </span>
        )}
        <span className={`px-2 py-0.5 font-semibold ${tier.text}`}>
          {opp.rating != null ? `${opp.rating} ★` : "—"}
        </span>
        <span className="text-muted-foreground">
          {opp.installs ? `${opp.installs} installs` : "—"}
        </span>
        <span className="max-w-[160px] truncate text-muted-foreground/70">{opp.appId}</span>
        {opp.scanJob && (
          <span className="text-muted-foreground/70">kw: &quot;{opp.scanJob.keyword}&quot;</span>
        )}
        <span className={`ml-auto rounded border px-2 py-0.5 text-[10px] font-semibold ${tier.pill}`}>
          {tier.label.toUpperCase()}
        </span>
      </div>
    </article>
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

/** Section heading inside the bottom sheet (mono caps + rust icon). */
function SheetSection({
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

/** Bottom-right toast (clears the mobile bottom nav). */
function Toast({ msg }: { msg: string | null }) {
  return (
    <div
      aria-live="polite"
      className={`fixed bottom-[4.75rem] right-4 z-[60] flex items-center gap-2 rounded-md bg-foreground px-4 py-2.5 text-xs text-background shadow-lg transition-transform duration-200 lg:bottom-5 ${
        msg ? "" : "pointer-events-none translate-y-24"
      }`}
    >
      <span className="material-symbols text-[16px] text-score-high">check_circle</span>
      <span>{msg ?? ""}</span>
    </div>
  );
}

/** Compact top app bar (mobile, <lg). Desktop uses the global AppHeader. */
function TopAppBar({
  onLogout,
}: {
  onLogout: () => void;
}) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
    setDark(next);
  }

  const btn =
    "flex min-h-[44px] min-w-[44px] items-center justify-center text-muted-foreground transition-colors hover:text-foreground active:scale-95";
  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-border bg-card-elevated px-4 lg:hidden">
      <div className="flex items-center gap-2">
        <span className={`${btn} pointer-events-none`}>
          <span className="material-symbols text-[20px] text-primary">insights</span>
        </span>
        <h1 className="font-serif text-lg font-medium tracking-tight text-foreground">
          1 · Hunter
        </h1>
      </div>
      <div className="flex items-center">
        <button onClick={toggleTheme} aria-label="Toggle theme" className={btn}>
          <span className="material-symbols text-[20px]">
            {dark ? "light_mode" : "dark_mode"}
          </span>
        </button>
        <Link href="/settings" aria-label="Settings" className={btn}>
          <span className="material-symbols text-[20px]">settings</span>
        </Link>
        <button onClick={onLogout} aria-label="Sign out" className={btn}>
          <span className="material-symbols text-[20px]">logout</span>
        </button>
      </div>
    </header>
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
  const listRef = useRef<HTMLElement | null>(null);
  const radarRef = useRef<HTMLElement | null>(null);

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

  // Bottom nav
  const [activeTab, setActiveTab] = useState("hunter");

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

  // Bottom sheet: Escape to close + lock body scroll
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

  /** Keyword pill in the sheet: fill input, close sheet, scroll up, scan. */
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

  function scrollToList() {
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (!authChecked) {
    return (
      <>
        <TopAppBar onLogout={logout} />
        <main className="mx-auto w-full max-w-[1100px] px-4 py-8">
          <p className="text-muted-foreground">Loading…</p>
        </main>
      </>
    );
  }

  const tabs = [
    {
      id: "hunter",
      label: "Hunter",
      icon: "radar",
      action: () => window.scrollTo({ top: 0, behavior: "smooth" }),
    },
    {
      id: "triage",
      label: "Triage",
      icon: "filter_list",
      action: () => scrollToList(),
    },
    {
      id: "radar",
      label: "Radar",
      icon: "explore",
      action: () => {
        setRadarOpen(true);
        setTimeout(
          () => radarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
          60
        );
      },
    },
    {
      id: "saved",
      label: "Saved",
      icon: "bookmark",
      action: () => {
        applyFilters(search, !bookmarkedOnly);
        setTimeout(() => scrollToList(), 60);
      },
    },
  ];

  return (
    <>
      <TopAppBar onLogout={logout} />

      <main className="mx-auto w-full max-w-[1100px] flex-1 space-y-6 px-4 pb-28 pt-4 lg:pb-12">
        {/* 1. Stat strip — 2×2, real numbers only */}
        <section className="grid grid-cols-2 gap-2" aria-label="Overview">
          <StatCard
            label="Opportunities"
            value={oppMeta.total.toLocaleString()}
            sub="indexed"
          />
          <StatCard
            label="Bookmarked"
            value={bookmarkedCount.toLocaleString()}
            sub="saved"
          />
          <StatCard label="Scans" value={scans.length} sub="recent" />
          <StatCard
            label="Watchlist"
            value={12}
            sub="keywords · daily 06:51 EAT"
          />
        </section>

        {/* 2. Scan hero */}
        <section
          ref={scanRef}
          className="card-elevated flex scroll-mt-24 flex-col gap-3 p-4"
          aria-labelledby="scan-heading"
        >
          <div className="flex items-center justify-between">
            <h2
              id="scan-heading"
              className="flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              <span className="material-symbols text-[14px] text-primary">radar</span>
              Scan the Play Store
            </h2>
            <span className="border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary">
              LIVE
            </span>
          </div>
          <form onSubmit={(e) => runScan(e)} className="flex flex-col gap-2">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Try &quot;habit tracker&quot;…"
              className="input-paper"
              aria-label="Play Store keyword"
            />
            <button
              type="submit"
              disabled={scanning || !keyword.trim()}
              className="btn-primary min-h-[44px] w-full font-semibold tracking-wide"
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
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Recent scans
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

        {/* 3. Editor's pick */}
        {pick && pickTier && (
          <section
            className="card-elevated relative border-2 border-primary/40 p-4"
            aria-label="Top opportunity"
          >
            <div className="mb-3 flex items-center justify-between border-b border-border pb-2">
              <span className="flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-primary">
                <span className="material-symbols text-[14px]">verified</span>
                Top opportunity
              </span>
              <span
                className={`rounded border px-2 py-0.5 font-mono text-[11px] font-semibold ${pickTier.pill}`}
              >
                {pickTier.label.toUpperCase()}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-serif text-2xl font-normal leading-tight text-foreground">
                  {pick.title}
                </h3>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  {pick.rating != null ? `${pick.rating} ★` : "—"} ·{" "}
                  {pick.installs ? `${pick.installs} installs` : "—"}
                  {pick.scanJob ? ` · kw: "${pick.scanJob.keyword}"` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <span className={`font-serif text-[3.5rem] font-light leading-none ${pickTier.text}`}>
                  {fmtScore(pick.score)}
                </span>
                <span className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  Score
                </span>
              </div>
            </div>
            {pick.summary && (
              <blockquote className="my-4 border-l-2 border-primary pl-3 font-serif text-[15px] italic leading-relaxed text-foreground">
                {pick.summary}
              </blockquote>
            )}
            <div className="mb-4 h-1 w-full overflow-hidden bg-muted">
              <div className="h-full bg-primary" style={{ width: `${Math.min(100, pick.score)}%` }} />
            </div>
            <Link
              href={`/hunter/opportunities/${pick.id}`}
              className="btn-primary min-h-[44px] w-full font-medium"
            >
              <span>Analyze</span>
              <span className="material-symbols text-[18px]">arrow_forward</span>
            </Link>
          </section>
        )}

        {/* 4. Toolbar */}
        <section ref={listRef} className="scroll-mt-24 space-y-2" aria-label="Filters">
          <div className="relative">
            <span className="material-symbols pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-muted-foreground">
              search
            </span>
            <input
              value={search}
              onChange={(e) => applyFilters(e.target.value, bookmarkedOnly)}
              placeholder="Filter opportunities…"
              aria-label="Filter opportunities"
              type="search"
              className="input-paper pl-10"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto py-1">
            <button
              onClick={() => applyFilters(search, !bookmarkedOnly)}
              aria-pressed={bookmarkedOnly}
              className={`flex min-h-[44px] shrink-0 items-center gap-1.5 border px-3 font-mono text-[11px] font-medium uppercase tracking-wider transition-colors active:scale-95 ${
                bookmarkedOnly
                  ? "border-score-medium/50 bg-score-medium/10 text-score-medium"
                  : "border-border bg-card text-muted-foreground"
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
                bookmark
              </span>
              <span>Saved Only</span>
            </button>
            <div className="relative shrink-0">
              <select
                aria-label="Sort opportunities"
                value={sortDir}
                onChange={(e) => setSortDir(e.target.value as "desc" | "asc")}
                className="input-paper min-h-[44px] cursor-pointer appearance-none pr-8 font-mono text-[11px] uppercase tracking-wider"
              >
                <option value="desc">Score: High → Low</option>
                <option value="asc">Score: Low → High</option>
              </select>
              <span className="material-symbols pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[16px] text-muted-foreground">
                unfold_more
              </span>
            </div>
            <button
              onClick={() => applyFilters("", false)}
              aria-label="Reset filters"
              title="Reset filters"
              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:text-score-low active:scale-95"
            >
              <span className="material-symbols text-[18px]">restart_alt</span>
            </button>
          </div>
        </section>

        {/* 5. Ranked list */}
        <section className="space-y-2" aria-label="Ranked opportunities">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Ranked opportunities ({oppMeta.total})
            </h2>
            <span className="font-mono text-[11px] text-muted-foreground">
              Page {oppMeta.page}/{oppMeta.totalPages}
            </span>
          </div>
          {listOpps.length === 0 ? (
            <div className="card-paper p-12 text-center">
              <p className="font-serif text-xl text-foreground">No opportunities yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Run a scan above to find underrated apps.
              </p>
            </div>
          ) : (
            listOpps.map((o, i) => (
              <OpportunityCard
                key={o.id}
                opp={o}
                rank={showPick ? i + 2 : i + 1}
                onBookmark={toggleBookmark}
                onOpen={(opp) => router.push(`/hunter/opportunities/${opp.id}`)}
              />
            ))
          )}
          <div className="flex items-center justify-between gap-3 pt-1 text-xs">
            <span className="font-mono text-muted-foreground">
              Showing {rangeStart}-{rangeEnd} of {oppMeta.total}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => {
                  setPage(page - 1);
                  loadOpps(page - 1, search, bookmarkedOnly);
                }}
                className="btn-ghost min-h-[44px] px-4 text-xs disabled:opacity-40"
              >
                Prev
              </button>
              <button
                disabled={page >= oppMeta.totalPages}
                onClick={() => {
                  setPage(page + 1);
                  loadOpps(page + 1, search, bookmarkedOnly);
                }}
                className="btn-ghost min-h-[44px] px-4 text-xs disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </section>

        {/* 6. Idea Radar accordion */}
        <section
          ref={radarRef}
          className="card-paper scroll-mt-24 overflow-hidden"
          aria-label="Idea Radar"
        >
          <div className="flex items-center">
            <button
              onClick={() => setRadarOpen(!radarOpen)}
              aria-expanded={radarOpen}
              className="flex min-h-[48px] flex-1 items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-muted/50"
            >
              <span className="material-symbols text-[20px] text-primary">explore</span>
              <span className="font-serif text-lg font-medium text-foreground">
                Trending Ideas Radar
              </span>
              <span className="bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary">
                {ideas.length} ACTIVE
              </span>
              <span
                className="material-symbols ml-auto text-[20px] text-muted-foreground transition-transform duration-200"
                style={{ transform: radarOpen ? "rotate(180deg)" : "none" }}
              >
                expand_more
              </span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                loadIdeas();
              }}
              title="Refresh radar"
              aria-label="Refresh radar"
              className="flex min-h-[48px] min-w-[48px] items-center justify-center text-muted-foreground transition-colors hover:text-foreground active:scale-95"
            >
              <span className="material-symbols text-[20px]">refresh</span>
            </button>
          </div>
          {radarOpen && (
            <div className="space-y-2 border-t border-border bg-card p-4">
              {ideasLoading ? (
                <p className="py-4 text-sm text-muted-foreground">Loading trending ideas…</p>
              ) : ideas.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  No ideas right now. Try refreshing.
                </p>
              ) : (
                <>
                  {visibleIdeas.map((idea) => {
                    const badge = sourceBadge(idea.source);
                    return (
                      <button
                        key={idea.id}
                        onClick={() => analyzeIdea(idea)}
                        className="group w-full cursor-pointer rounded-md border border-border bg-card-elevated p-3 text-left transition-colors hover:border-primary active:scale-[0.99]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                          <span className="font-mono text-[11px] font-semibold text-primary">
                            {idea.hotness} pts
                          </span>
                        </div>
                        <h5
                          className={`mt-1.5 line-clamp-2 text-sm font-medium leading-snug transition-colors group-hover:text-primary ${
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
                  {ideas.length > 6 && (
                    <button
                      onClick={() => setShowAllIdeas(!showAllIdeas)}
                      className="mx-auto flex min-h-[44px] items-center justify-center gap-1 text-xs font-semibold text-primary"
                    >
                      <span>
                        {showAllIdeas ? "Show less" : `Show all ${ideas.length} ideas`}
                      </span>
                      <span className="material-symbols text-[16px]">
                        {showAllIdeas ? "expand_less" : "expand_more"}
                      </span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      </main>

      {/* 7. Mobile bottom nav */}
      <nav
        aria-label="Primary"
        className="pb-safe fixed bottom-0 left-0 z-40 flex h-16 w-full items-center justify-around border-t border-border bg-card-elevated lg:hidden"
      >
        {tabs.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                setActiveTab(t.id);
                t.action();
              }}
              className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 font-mono text-[10px] uppercase tracking-wider transition-transform active:scale-95 ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span
                className="material-symbols text-[22px]"
                style={
                  active
                    ? { fontVariationSettings: '"FILL" 1, "wght" 400, "GRAD" 0, "opsz" 20' }
                    : undefined
                }
              >
                {t.icon}
              </span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* 8. Detail bottom sheet */}
      {selected && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            onClick={() => setSelected(null)}
          />
          <aside className="drawer-shadow absolute bottom-0 left-1/2 flex h-[88dvh] w-full max-w-2xl -translate-x-1/2 flex-col border-x border-t border-border bg-card-elevated md:h-[85dvh] md:rounded-t-xl">
            {/* Drag handle */}
            <div
              className="flex w-full cursor-pointer items-center justify-center pb-1 pt-3"
              onClick={() => setSelected(null)}
            >
              <div className="h-1.5 w-12 rounded-full bg-border" />
            </div>
            {/* Sheet header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-primary">
                  Idea inspection
                </span>
                {(() => {
                  const badge = sourceBadge(selected.source);
                  return (
                    <span
                      className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  );
                })()}
              </div>
              <button
                onClick={() => setSelected(null)}
                aria-label="Close"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center text-muted-foreground transition-colors hover:text-foreground active:scale-95"
              >
                <span className="material-symbols text-[22px]">close</span>
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 text-xs text-muted-foreground">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-serif text-2xl font-normal leading-tight text-foreground">
                    {selected.title}
                  </h2>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {selected.source} · {timeAgo(selected.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span className="font-serif text-[42px] font-light leading-none text-primary">
                    {selected.hotness}
                  </span>
                  <span className="mt-1 font-mono text-[11px] uppercase text-muted-foreground">
                    Hotness
                  </span>
                </div>
              </div>
              <div className="h-1.5 w-full overflow-hidden bg-muted">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${Math.min(100, selected.hotness)}%` }}
                />
              </div>

              {analyzing ? (
                <p className="text-sm">Analyzing this idea…</p>
              ) : analysis ? (
                <>
                  <SheetSection icon="description" label="Summary">
                    <p className="rounded-md border border-border bg-card p-3 font-sans leading-relaxed">
                      {analysis.summary}
                    </p>
                  </SheetSection>

                  <SheetSection icon="trending_up" label="Why Trending">
                    <p className="font-sans leading-relaxed">{analysis.why_trending}</p>
                  </SheetSection>

                  <SheetSection icon="group" label="Target Audience">
                    <div className="grid grid-cols-1 gap-2 font-sans sm:grid-cols-2">
                      {audienceHalves[0] && (
                        <div className="rounded-md border border-border bg-card p-2.5">
                          <p className="text-[11px] leading-relaxed">{audienceHalves[0]}</p>
                        </div>
                      )}
                      {audienceHalves[1] && (
                        <div className="rounded-md border border-border bg-card p-2.5">
                          <p className="text-[11px] leading-relaxed">{audienceHalves[1]}</p>
                        </div>
                      )}
                    </div>
                  </SheetSection>

                  <SheetSection icon="check_circle" label="Key Features">
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
                  </SheetSection>

                  <SheetSection icon="payments" label="Monetization Ideas">
                    <div className="rounded-md border border-score-medium/30 bg-score-medium/10 p-3 font-sans">
                      <p className="leading-relaxed text-foreground">{analysis.monetization}</p>
                    </div>
                  </SheetSection>

                  <SheetSection icon="swords" label="Competition Angle">
                    <p className="font-sans leading-relaxed">{analysis.competition_angle}</p>
                  </SheetSection>

                  {analysis.suggested_keywords?.length > 0 && (
                    <SheetSection
                      icon="sell"
                      label="Suggested Keywords"
                      right={
                        <span className="font-mono text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
                          Tap to scan
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
                    </SheetSection>
                  )}
                </>
              ) : null}
            </div>

            {/* Sticky bottom CTA */}
            {analysis && (
              <div className="pb-safe border-t border-border bg-card-elevated p-4">
                <button
                  onClick={sendToBuilder}
                  disabled={sending}
                  className="btn-primary min-h-[48px] w-full font-semibold"
                >
                  <span className="material-symbols text-[20px]">send</span>
                  <span>{sending ? "Sending…" : "Send to Builder"}</span>
                </button>
              </div>
            )}
          </aside>
        </div>
      )}

      <Toast msg={toastMsg} />
    </>
  );
}
