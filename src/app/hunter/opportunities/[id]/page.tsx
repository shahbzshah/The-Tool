"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { scoreTier, timeAgo } from "@/lib/hunter/ui";

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

function Icon({ name, className = "text-[20px]" }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}

function tierTextClass(label: string) {
  if (label.includes("High")) return "text-score-high";
  if (label.includes("Medium")) return "text-score-medium";
  return "text-score-low";
}

function barClass(value: number) {
  if (value >= 71) return "bg-score-high";
  if (value >= 41) return "bg-score-medium";
  return "bg-score-low";
}

type Breakdown = {
  quality?: number;
  gap?: number;
  market?: number;
  competition?: number;
};

function parseBreakdown(raw: string | null): Breakdown | null {
  if (!raw) return null;
  try {
    const b = JSON.parse(raw);
    if (b && typeof b === "object") return b as Breakdown;
  } catch {
    // ignore
  }
  return null;
}

function AnalysisCards({ content }: { content: string }) {
  let a: any = null;
  try {
    a = JSON.parse(content);
  } catch {
    return (
      <p className="text-sm text-muted-foreground">Could not parse analysis.</p>
    );
  }

  const mvpItems: string[] = Array.isArray(a.mvp_scope?.must_have)
    ? a.mvp_scope.must_have
    : Array.isArray(a.build_plan)
      ? a.build_plan
      : [];

  const cards: {
    num: string;
    kicker: string;
    kickerClass: string;
    icon: string;
    title: string;
    body: React.ReactNode;
  }[] = [];

  if (a.summary) {
    cards.push({
      num: "01",
      kicker: "Core Synthesis",
      kickerClass: "text-primary",
      icon: "travel_explore",
      title: "Market Gap, Synthesized",
      body: <p className="text-sm leading-relaxed text-muted-foreground">{a.summary}</p>,
    });
  }
  if (Array.isArray(a.strengths) && a.strengths.length > 0) {
    cards.push({
      num: "02",
      kicker: "Incumbent Strengths",
      kickerClass: "text-score-high",
      icon: "verified",
      title: "What Users Adore",
      body: (
        <ul className="space-y-2.5 pt-1 text-sm text-muted-foreground">
          {a.strengths.map((s: string, i: number) => (
            <li key={i} className="flex items-start gap-2">
              <Icon name="check_circle" className="text-score-high text-[16px] mt-0.5" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      ),
    });
  }
  if (Array.isArray(a.weaknesses) && a.weaknesses.length > 0) {
    cards.push({
      num: "03",
      kicker: "Critical Vulnerabilities",
      kickerClass: "text-score-low",
      icon: "warning",
      title: "Deficits & Pain Points",
      body: (
        <ul className="space-y-2.5 pt-1 text-sm text-muted-foreground">
          {a.weaknesses.map((s: string, i: number) => (
            <li key={i} className="flex items-start gap-2">
              <Icon name="cancel" className="text-score-low text-[16px] mt-0.5" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      ),
    });
  }
  if (a.opportunity) {
    cards.push({
      num: "04",
      kicker: "Addressable Market",
      kickerClass: "text-primary",
      icon: "trending_up",
      title: "The Opportunity",
      body: <p className="text-sm leading-relaxed text-muted-foreground">{a.opportunity}</p>,
    });
  }
  if (mvpItems.length > 0) {
    cards.push({
      num: "05",
      kicker: "MVP Roadmap",
      kickerClass: "text-score-medium",
      icon: "terminal",
      title: "Build Plan",
      body: (
        <ul className="space-y-2 pt-1 text-sm text-muted-foreground">
          {mvpItems.map((s: string, i: number) => (
            <li key={i} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      ),
    });
  }
  if (a.monetization) {
    cards.push({
      num: "06",
      kicker: "Commercial Model",
      kickerClass: "text-score-high",
      icon: "payments",
      title: "Monetization",
      body: <p className="text-sm leading-relaxed text-muted-foreground">{a.monetization}</p>,
    });
  }

  if (cards.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        The analysis came back empty — try re-analyzing.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <div key={c.num} className="card-elevated flex flex-col justify-between space-y-3 p-6">
          <div>
            <div className={`mb-1 flex items-center gap-2 font-mono text-[13px] uppercase ${c.kickerClass}`}>
              <Icon name={c.icon} className="text-[18px]" />
              <span>
                {c.num} / {c.kicker}
              </span>
            </div>
            <h3 className="font-serif text-xl font-semibold text-foreground">{c.title}</h3>
            <div className="mt-2">{c.body}</div>
          </div>
        </div>
      ))}
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
  const [analyzeError, setAnalyzeError] = useState("");
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const autoAnalyzed = useRef(false);

  const runAnalysis = useCallback(async (id: string) => {
    setAnalyzing(true);
    setAnalyzeError("");
    try {
      const res = await fetch("/api/hunter/opportunities/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        setAnalyzeError("Analysis failed — tap to retry.");
        return;
      }
      const r = await fetch(`/api/hunter/opportunities/${id}`);
      if (r.ok) {
        const d = await r.json();
        setAnalyses(d.opportunity.analyses ?? []);
      }
    } finally {
      setAnalyzing(false);
    }
  }, []);

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
      const list: Analysis[] = data.opportunity.analyses ?? [];
      setAnalyses(list);
      // AI analysis runs automatically on first visit — no button needed.
      if (list.length === 0 && !autoAnalyzed.current) {
        autoAnalyzed.current = true;
        runAnalysis(data.opportunity.id);
      }
    } catch {
      setError("Could not load the opportunity.");
    }
  }, [params.id, router, runAnalysis]);

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
    const res = await fetch(`/api/hunter/opportunities/${opp.id}`, {
      method: "DELETE",
    });
    if (res.ok) router.push("/");
  }

  async function deleteAnalysis(id: string) {
    if (!opp) return;
    const res = await fetch(`/api/hunter/opportunities/analyses/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setAnalyses([]);
      // Analysis is automatic — a fresh one starts right away.
      runAnalysis(opp.id);
    }
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
      if (data.refineUrl) router.push(data.refineUrl);
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
      <main className="mx-auto w-full max-w-[1200px] px-6 py-8">
        <p className="text-muted-foreground">{error}</p>
        <Link
          href="/"
          className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
        >
          <Icon name="arrow_back" className="text-[18px]" />
          Back to Opportunities
        </Link>
      </main>
    );
  }

  if (!opp) {
    return (
      <main className="mx-auto w-full max-w-[1200px] px-6 py-8">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  const tier = scoreTier(opp.score);
  const breakdown = parseBreakdown(opp.breakdown);
  const archiveId = `#OPP-${opp.id.slice(0, 8).toUpperCase()}`;
  const summaryParagraphs = (opp.summary ?? "")
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const bars: { label: string; value: string; pct: number; tint: number }[] = [];
  if (breakdown?.quality != null) {
    bars.push({
      label: "App Quality",
      value: `${Math.round(breakdown.quality)}/100`,
      pct: Math.min(100, Math.max(0, breakdown.quality)),
      tint: breakdown.quality,
    });
  }
  if (breakdown?.market != null) {
    bars.push({
      label: "Market Size",
      value: `${Math.round(breakdown.market)}/100`,
      pct: Math.min(100, Math.max(0, breakdown.market)),
      tint: breakdown.market,
    });
  }
  if (breakdown?.gap != null) {
    const gapPct = Math.min(100, Math.max(0, ((breakdown.gap - 1) / 4) * 100));
    bars.push({
      label: "Hidden-Gem Gap",
      value: `${breakdown.gap.toFixed(2)}×`,
      pct: gapPct,
      tint: gapPct,
    });
  }

  return (
    <>
      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col space-y-6 px-6 py-8">
        {/* Top row: back link + archive id */}
        <section className="flex items-center justify-between">
          <Link
            href="/"
            className="group inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <Icon
              name="arrow_back"
              className="text-[18px] transition-transform group-hover:-translate-x-0.5"
            />
            <span className="font-medium">Back to Opportunities</span>
          </Link>
          <div className="flex items-center gap-3 font-mono text-[13px] text-muted-foreground">
            <span>ARCHIVE ID: {archiveId}</span>
            <span className="h-1.5 w-1.5 rounded-full bg-score-high" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-score-high">
              Live Radar Signal
            </span>
          </div>
        </section>

        {/* Header card */}
        <section className="card-elevated p-6 md:p-8">
          <div className="flex flex-col items-start justify-between gap-6 border-b border-border pb-6 lg:flex-row lg:items-center">
            <div className="flex flex-1 flex-col items-start gap-6 sm:flex-row sm:items-center">
              {/* Score box */}
              <div className="flex min-w-[110px] flex-col items-center justify-center rounded-md border border-border bg-card p-4 text-center">
                <span className="font-serif text-5xl leading-none text-foreground">
                  {tier.score}
                </span>
                <div
                  className={`mt-2 inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] ${tierTextClass(tier.label)}`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${barClass(tier.score)}`}
                  />
                  <span className="label-caps">{tier.label}</span>
                </div>
              </div>
              {/* Title + meta */}
              <div className="flex-1 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <h1 className="font-serif text-2xl font-medium tracking-tight text-foreground">
                    {opp.title}
                  </h1>
                  <button
                    onClick={toggleBookmark}
                    aria-label={opp.isBookmarked ? "Remove bookmark" : "Bookmark"}
                    className={`p-1 transition-opacity hover:opacity-80 ${
                      opp.isBookmarked
                        ? "text-score-medium"
                        : "text-muted-foreground/40 hover:text-score-medium"
                    }`}
                  >
                    <span
                      className="material-symbols text-[24px]"
                      style={
                        opp.isBookmarked
                          ? {
                              fontVariationSettings:
                                "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24",
                            }
                          : undefined
                      }
                    >
                      bookmark
                    </span>
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 font-mono text-[13px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1 font-medium text-foreground">
                    <Icon name="star" className="text-score-medium text-[16px]" />
                    {opp.rating ?? "—"} Rating
                  </span>
                  <span className="text-border">|</span>
                  <span className="inline-flex items-center gap-1">
                    <Icon name="download" className="text-[16px]" />
                    {opp.installs ?? "—"} Installs
                  </span>
                  <span className="text-border">|</span>
                  <span className="inline-flex items-center gap-1.5 rounded border border-border bg-card px-2 py-0.5 text-[12px]">
                    <span className="text-muted-foreground">package:</span>
                    <span className="font-bold text-foreground">{opp.appId}</span>
                    <button
                      onClick={copyPackageId}
                      aria-label="Copy package ID"
                      className="text-muted-foreground transition-colors hover:text-primary"
                    >
                      <Icon name={copied ? "check" : "content_copy"} className="text-[15px]" />
                    </button>
                  </span>
                  {opp.url && (
                    <>
                      <span className="text-border">|</span>
                      <a
                        href={opp.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                      >
                        Play Store Link
                        <Icon name="open_in_new" className="text-[15px]" />
                      </a>
                    </>
                  )}
                </div>
              </div>
            </div>
            {/* Delete (ghost, never filled) */}
            <div className="self-end pt-1 lg:self-start">
              <button onClick={deleteOpp} className="btn-ghost">
                <Icon name="delete" className="text-[18px]" />
                Delete Opportunity
              </button>
            </div>
          </div>

          {/* Metric strip — real data only */}
          <div className="grid grid-cols-2 gap-4 pt-6 md:grid-cols-4">
            <div className="card-paper p-3">
              <p className="label-caps text-muted-foreground">User Rating</p>
              <p className="mt-1 font-mono text-lg text-foreground">
                ★{opp.rating ?? "—"}
              </p>
            </div>
            <div className="card-paper p-3">
              <p className="label-caps text-muted-foreground">Installs</p>
              <p className="mt-1 font-mono text-lg text-foreground">
                {opp.installs ?? "—"}
              </p>
            </div>
            <div className="card-paper p-3">
              <p className="label-caps text-muted-foreground">Reviews</p>
              <p className="mt-1 font-mono text-lg text-foreground">
                {opp.reviewsCount ?? "—"}
              </p>
            </div>
            <div className="card-paper p-3">
              <p className="label-caps text-muted-foreground">Quality Signal</p>
              <p className="mt-1 font-mono text-lg text-foreground">
                {breakdown?.quality != null
                  ? `${Math.round(breakdown.quality)}/100`
                  : "—"}
              </p>
            </div>
          </div>
        </section>

        {/* Why it scores */}
        {summaryParagraphs.length > 0 && (
          <section className="card-paper p-6 md:p-8">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary font-mono text-sm font-bold text-foreground">
                ¶
              </div>
              <div>
                <span className="label-caps text-muted-foreground">
                  Editorial Thesis
                </span>
                <h2 className="font-serif text-[1.75rem] font-medium leading-tight text-foreground">
                  Why it scores {tier.score}/100
                </h2>
              </div>
            </div>
            <div className="space-y-4 pt-2 text-[0.9375rem] leading-relaxed">
              {summaryParagraphs.map((p, i) => (
                <p
                  key={i}
                  className={i === 0 ? "text-foreground" : "text-muted-foreground"}
                >
                  {p}
                </p>
              ))}
            </div>
            {bars.length > 0 && (
              <div className="mt-6 grid grid-cols-1 gap-6 border-t border-border pt-5 font-mono text-[13px] md:grid-cols-3">
                {bars.map((b) => (
                  <div key={b.label}>
                    <div className="mb-1.5 flex justify-between">
                      <span className="text-muted-foreground">{b.label}</span>
                      <span className="font-bold text-foreground">{b.value}</span>
                    </div>
                    <div className="h-1 w-full overflow-hidden bg-border">
                      <div
                        className={`h-full ${barClass(b.tint)}`}
                        style={{ width: `${b.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* AI Synthesized Intelligence */}
        <section className="space-y-6">
          <div className="flex flex-col justify-between gap-3 border-b border-border pb-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <Icon name="psychology" className="text-primary text-[22px]" />
              <h2 className="font-serif text-xl font-semibold text-foreground">
                AI Synthesized Intelligence
              </h2>
            </div>
            <button
              onClick={() => opp && runAnalysis(opp.id)}
              disabled={analyzing}
              className="btn-ghost !px-3 !py-1.5 !text-xs"
            >
              <Icon
                name="refresh"
                className={`text-[16px] ${analyzing ? "animate-spin" : ""}`}
              />
              {analyzing ? "Analyzing…" : "Re-analyze"}
            </button>
          </div>

          {analyzing && analyses.length === 0 && (
            <div className="card-paper flex items-center gap-3 p-6">
              <Icon name="psychology" className="animate-pulse text-primary text-[22px]" />
              <p className="text-sm text-muted-foreground">
                Synthesizing intelligence — reading the market, scoring the gap…
              </p>
            </div>
          )}
          {analyzeError && analyses.length === 0 && !analyzing && (
            <button
              onClick={() => opp && runAnalysis(opp.id)}
              className="text-sm text-muted-foreground underline hover:text-foreground"
            >
              {analyzeError}
            </button>
          )}

          <div className="space-y-8">
            {analyses.map((a) => (
              <div key={a.id} className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded border border-input bg-secondary px-2.5 py-1 font-mono text-[12px] text-foreground">
                      <span className="h-2 w-2 rounded-full bg-score-medium" />
                      {a.provider}
                    </span>
                    <span className="font-mono text-[13px] text-muted-foreground">
                      · Analyzed {timeAgo(a.createdAt)}
                    </span>
                  </div>
                  <button
                    onClick={() => deleteAnalysis(a.id)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Delete
                  </button>
                </div>
                <AnalysisCards content={a.content} />
              </div>
            ))}
          </div>
        </section>

        {/* Spacer so the sticky bar never covers content */}
        <div className="h-24" />
      </main>

      {/* Sticky bottom action bar — Send to Builder is the ONE rust CTA */}
      <aside className="sticky bottom-0 z-40 w-full border-t border-border bg-card-elevated px-6 py-4">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-primary">
              <Icon name="bolt" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Ready to synthesize specifications?
              </p>
              <p className="font-mono text-[13px] text-muted-foreground">
                Phase 2 · Refine
              </p>
            </div>
          </div>
          <button
            onClick={sendToBuilder}
            disabled={sending || analyzing || analyses.length === 0}
            className="btn-primary w-full sm:w-auto"
          >
            {sending ? (
              "Sending…"
            ) : (
              <>
                Send to Builder
                <Icon name="arrow_forward" className="text-[18px]" />
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
