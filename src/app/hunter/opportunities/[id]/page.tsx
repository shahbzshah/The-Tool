"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { scoreTier, timeAgo } from "@/lib/hunter/ui";
import { apiFetch } from "@/lib/api";
import NewBadge from "@/components/NewBadge";
import ConfirmDialog from "@/components/ConfirmDialog";

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
  // Power & Accuracy plan fields (stored at scan time).
  velocityPerDay: number | null;
  deltaRatings30: number | null;
  isRising: boolean;
  offersIap: boolean | null;
  containsAds: boolean | null;
  priceText: string | null;
  playUpdated: string | null;
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
    if (b && typeof b === "object") {
      // New breakdowns nest the legacy gap components under .legacy;
      // the composite lives in EvidenceSections.
      if (b.legacy && typeof b.legacy === "object") return b.legacy as Breakdown;
      return b as Breakdown;
    }
  } catch {
    // ignore
  }
  return null;
}

type ScorePoint = {
  id: string;
  score: number;
  scannedAt: string;
};

/** Compact editorial SVG sparkline of score over time. */
function ScoreSparkline({ points }: { points: ScorePoint[] }) {
  const W = 560;
  const H = 72;
  const PAD = 8;
  const scores = points.map((p) => p.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const current = scores[scores.length - 1];
  const span = max - min || 1;
  const x = (i: number) =>
    points.length === 1
      ? W / 2
      : PAD + (i * (W - PAD * 2)) / (points.length - 1);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`)
    .join(" ");

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Score over time: high ${Math.round(max)}, low ${Math.round(min)}, current ${Math.round(current)}`}
      >
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" className="text-primary" />
        {points.map((p, i) => (
          <circle key={p.id} cx={x(i)} cy={y(p.score)} r="3" className="fill-primary" />
        ))}
      </svg>
      <figcaption className="mt-2 flex items-center justify-between font-mono text-[13px] text-muted-foreground">
        <span>
          Low <span className="font-bold text-foreground">{Math.round(min)}</span>
        </span>
        <span>
          High <span className="font-bold text-foreground">{Math.round(max)}</span>
        </span>
        <span>
          Current{" "}
          <span className="font-bold text-foreground">{Math.round(current)}</span>
        </span>
      </figcaption>
    </figure>
  );
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
  if (Array.isArray(a.user_pain_points) && a.user_pain_points.length > 0) {
    cards.push({
      num: "04",
      kicker: "User Frustrations",
      kickerClass: "text-score-low",
      icon: "error",
      title: "What Users Complain About",
      body: (
        <ul className="space-y-2.5 pt-1 text-sm text-muted-foreground">
          {a.user_pain_points.map((s: string, i: number) => (
            <li key={i} className="flex items-start gap-2">
              <Icon name="error" className="text-score-low text-[16px] mt-0.5" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      ),
    });
  }
  if (a.competition) {
    cards.push({
      num: "05",
      kicker: "Competitive Landscape",
      kickerClass: "text-score-medium",
      icon: "group",
      title: "Who Else Is There",
      body: <p className="text-sm leading-relaxed text-muted-foreground">{a.competition}</p>,
    });
  }
  if (Array.isArray(a.differentiation) && a.differentiation.length > 0) {
    cards.push({
      num: "06",
      kicker: "Standing Out",
      kickerClass: "text-primary",
      icon: "auto_awesome",
      title: "How to Beat Them",
      body: (
        <ul className="space-y-2.5 pt-1 text-sm text-muted-foreground">
          {a.differentiation.map((s: string, i: number) => (
            <li key={i} className="flex items-start gap-2">
              <Icon name="auto_awesome" className="text-primary text-[16px] mt-0.5" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      ),
    });
  }
  if (a.opportunity) {
    cards.push({
      num: "07",
      kicker: "Addressable Market",
      kickerClass: "text-primary",
      icon: "trending_up",
      title: "The Opportunity",
      body: <p className="text-sm leading-relaxed text-muted-foreground">{a.opportunity}</p>,
    });
  }
  if (mvpItems.length > 0) {
    cards.push({
      num: "08",
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
  const laterItems: string[] = Array.isArray(a.mvp_scope?.later) ? a.mvp_scope.later : [];
  if (laterItems.length > 0) {
    cards.push({
      num: "09",
      kicker: "Deliberately Later",
      kickerClass: "text-muted-foreground",
      icon: "history",
      title: "After Launch",
      body: (
        <ul className="space-y-2 pt-1 text-sm text-muted-foreground">
          {laterItems.map((s: string, i: number) => (
            <li key={i} className="flex items-start gap-2">
              <Icon name="history" className="text-muted-foreground text-[16px] mt-0.5" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      ),
    });
  }
  if (a.monetization) {
    cards.push({
      num: "10",
      kicker: "Commercial Model",
      kickerClass: "text-score-high",
      icon: "payments",
      title: "Monetization",
      body: <p className="text-sm leading-relaxed text-muted-foreground">{a.monetization}</p>,
    });
  }
  if (Array.isArray(a.risks) && a.risks.length > 0) {
    cards.push({
      num: "11",
      kicker: "Honest Risks",
      kickerClass: "text-score-medium",
      icon: "warning",
      title: "What Could Go Wrong",
      body: (
        <ul className="space-y-2.5 pt-1 text-sm text-muted-foreground">
          {a.risks.map((s: string, i: number) => (
            <li key={i} className="flex items-start gap-2">
              <Icon name="warning" className="text-score-medium text-[16px] mt-0.5" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      ),
    });
  }
  if (a.go_to_market) {
    cards.push({
      num: "12",
      kicker: "First 1,000 Users",
      kickerClass: "text-primary",
      icon: "send",
      title: "Go to Market",
      body: <p className="text-sm leading-relaxed text-muted-foreground">{a.go_to_market}</p>,
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

/** Grounded go/no-go scorecard (plan item 8). Renders only when the
 * stored analysis carries a scorecard; legacy prose analyses fall back
 * to AnalysisCards. */
function ScorecardCards({ content }: { content: string }) {
  let a: any = null;
  try {
    a = JSON.parse(content);
  } catch {
    return null;
  }
  const sc = a?.scorecard;
  if (!sc) return null;
  const verdict = String(sc.verdict ?? "CONDITIONAL");
  const verdictCls =
    verdict === "GO"
      ? "border-score-high/40 bg-score-high/10 text-score-high"
      : verdict === "NO-GO"
        ? "border-score-low/40 bg-score-low/10 text-score-low"
        : "border-score-medium/40 bg-score-medium/10 text-score-medium";
  const criteria: { key: string; label: string; c: any }[] = [
    { key: "demand", label: "Demand", c: sc.demand },
    { key: "competition", label: "Competition", c: sc.competition },
    { key: "vulnerability", label: "Incumbent vulnerability", c: sc.vulnerability },
    { key: "monetisation", label: "Monetisation", c: sc.monetisation },
    { key: "wedge_keyword", label: `Wedge keyword: ${sc.wedge_keyword?.keyword ?? "—"}`, c: sc.wedge_keyword },
  ];
  return (
    <div className="space-y-6">
      <div className={`rounded-md border px-4 py-3 ${verdictCls}`}>
        <p className="font-serif text-xl font-semibold">Verdict: {verdict} <NewBadge /></p>
        {a.summary && <p className="mt-1 text-sm leading-relaxed opacity-90">{a.summary}</p>}
        <p className="mt-2 font-mono text-[12px] opacity-80">
          Every criterion below is scored from the computed evidence packet. A criterion with no
          evidence scores Unknown — never 0, never a guess.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {criteria.map(({ key, label, c }) => (
          <div key={key} className="card-elevated flex flex-col space-y-2 p-6">
            <span className="label-caps text-muted-foreground">{label}</span>
            <p className="font-serif text-3xl font-semibold text-foreground">
              {c?.value === "Unknown" || c?.value == null ? "Unknown" : `${c.value}/100`}
            </p>
            {c?.evidence && <p className="text-sm leading-relaxed text-muted-foreground">{c.evidence}</p>}
            <p className="font-mono text-[12px] text-muted-foreground">
              Confidence: {c?.confidence ?? "Low"}
            </p>
          </div>
        ))}
      </div>
      {Array.isArray(sc.kill_criteria) && sc.kill_criteria.length > 0 && (
        <div className="card-paper p-6">
          <h3 className="font-serif text-lg font-medium text-foreground">Kill criteria</h3>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            {sc.kill_criteria.map((k: string, i: number) => (
              <li key={i} className="flex items-start gap-2">
                <Icon name="cancel" className="text-score-low text-[16px] mt-0.5" />
                <span>{k}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {Array.isArray(sc.verified_quotes) && sc.verified_quotes.length > 0 && (
        <div className="card-paper p-6">
          <h3 className="font-serif text-lg font-medium text-foreground">
            Verified user quotes
          </h3>
          <p className="mt-1 font-mono text-[12px] text-muted-foreground">
            Each quote was checked in code against a fetched Play review before display. Reviewer
            names are never shown.
          </p>
          <ul className="mt-3 space-y-3">
            {sc.verified_quotes.map((q: any, i: number) => (
              <li key={i} className="border-l-2 border-primary/40 pl-3">
                <p className="text-sm italic leading-relaxed text-foreground">“{q.text}”</p>
                <p className="mt-1 font-mono text-[12px] text-muted-foreground">
                  {q.appTitle} · {q.stars}★
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* What the AI does not know — standing unknowns, always shown. */}
      <div className="card-paper p-6">
        <h3 className="font-serif text-lg font-medium text-foreground">
          What the AI does not know
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Play data cannot answer these. Any analysis that fills them in is guessing.
        </p>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          {(Array.isArray(sc.unknowns) ? sc.unknowns : []).map((u: string, i: number) => (
            <li key={i} className="flex items-start gap-2">
              <Icon name="help" className="text-[16px] mt-0.5" />
              <span>{u}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function fmtRange(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(Math.round(n));
}

/** Small dated sparkline of ratings counts from snapshots. */
function RatingsSparkline({ points }: { points: { day: string; ratingsCount: number | null }[] }) {
  const pts = points.filter((p) => p.ratingsCount != null) as { day: string; ratingsCount: number }[];
  if (pts.length < 2) return null;
  const W = 560;
  const H = 72;
  const PAD = 8;
  const vals = pts.map((p) => p.ratingsCount);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (pts.length - 1);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.ratingsCount).toFixed(1)}`).join(" ");
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Ratings count over time">
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" className="text-primary" />
        {pts.map((p, i) => (
          <circle key={p.day} cx={x(i)} cy={y(p.ratingsCount)} r="3" className="fill-primary" />
        ))}
      </svg>
      <figcaption className="mt-2 flex items-center justify-between font-mono text-[13px] text-muted-foreground">
        <span>{pts[0].day}</span>
        <span>
          {fmtRange(min)} → {fmtRange(max)} ratings
        </span>
        <span>{pts[pts.length - 1].day}</span>
      </figcaption>
    </figure>
  );
}

/**
 * Evidence sections (plan items 1–12): score anatomy, velocity + ranges,
 * wedge audit, monetisation strip, freshness, review themes, trend, rank
 * alert, cross-check links. Everything shown was computed in code; a
 * section with no evidence says so instead of showing a number.
 */
function EvidenceSections({ evidence, opp }: { evidence: any; opp: Opportunity }) {
  const [priorLow, setPriorLow] = useState<number | null>(null);
  const [priorHigh, setPriorHigh] = useState<number | null>(null);
  const comp = evidence.composite ?? {};
  const components = comp.components ?? {};
  const weights = comp.weights ?? {};
  const compEntries: { key: string; label: string; value: number | null }[] = [
    { key: "demand", label: "Demand proxy", value: components.demand ?? null },
    { key: "wedge", label: "Wedge strength", value: components.wedge ?? null },
    { key: "vulnerability", label: "Incumbent vulnerability", value: components.vulnerability ?? null },
    { key: "momentum", label: "Momentum", value: components.momentum ?? null },
    { key: "monetisation", label: "Monetisation presence", value: components.monetisation ?? null },
    { key: "freshness", label: "Freshness", value: components.freshness ?? null },
  ];
  const v = evidence.velocity ?? {};
  const wedge = evidence.wedge ?? {};
  const mon = evidence.monetisation ?? {};
  const mining = evidence.mining;
  const fresh = evidence.freshness ?? {};
  const trend = evidence.trend ?? {};
  const range = evidence.range;

  // Range what-if: editable category prior, recomputed locally.
  const effLow = priorLow ?? range?.priorLow ?? null;
  const effHigh = priorHigh ?? range?.priorHigh ?? null;
  const whatIf =
    v.perDay != null && effLow != null && effHigh != null
      ? {
          low: Math.round(v.perDay * 30 * effLow),
          high: Math.round(v.perDay * 30 * effHigh),
        }
      : null;

  return (
    <div className="space-y-6">
      {/* How this score works */}
      <section className="card-paper p-6 md:p-8">
        <span className="label-caps text-muted-foreground">Score anatomy</span>
        <h2 className="font-serif text-[1.75rem] font-medium leading-tight text-foreground">
          How this score works <NewBadge />
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {comp.confidenceNote ?? "Confidence note unavailable."} Components with no evidence are
          excluded from the weighted sum — they never score 0 and never get guessed. The old
          gap-based score
          {comp.legacyGapScore != null ? ` was ${Math.round(comp.legacyGapScore)}/100` : " is not available for this row"}
          ; the composite above replaces it.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          {compEntries.map((c) => (
            <div key={c.key}>
              <div className="mb-1.5 flex justify-between font-mono text-[13px]">
                <span className="text-muted-foreground">
                  {c.label}
                  {weights[c.key] != null && <span> · weight {weights[c.key]}%</span>}
                </span>
                <span className="font-bold text-foreground">
                  {c.value != null ? `${Math.round(c.value)}/100` : "no evidence"}
                </span>
              </div>
              <div className="h-1 w-full overflow-hidden bg-border">
                <div
                  className={`h-full ${barClass(c.value ?? 0)}`}
                  style={{ width: `${c.value != null ? Math.min(100, Math.max(0, c.value)) : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 font-mono text-[12px] text-muted-foreground">
          Evidence confidence: {comp.confidence ?? "Low"} · This is an opportunity to enter — never
          a predicted success.
        </p>
      </section>

      {/* Momentum + range */}
      <section className="card-paper p-6 md:p-8">
        <span className="label-caps text-muted-foreground">Momentum &amp; range</span>
        <h2 className="font-serif text-[1.75rem] font-medium leading-tight text-foreground">
          Is it moving? <NewBadge />
        </h2>
        {!v.hasHistory || v.perDay == null ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Collecting history — velocity, 7/30-day changes, and download ranges appear once this
            app has been seen on more than one day. Re-scan tomorrow.
          </p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
              <div>
                <p className="label-caps text-muted-foreground">Ratings / day</p>
                <p className="mt-1 font-mono text-lg text-foreground">{v.perDay.toFixed(1)}</p>
              </div>
              <div>
                <p className="label-caps text-muted-foreground">Δ last 30 days</p>
                <p className="mt-1 font-mono text-lg text-foreground">
                  {v.delta30 != null ? `${v.delta30 >= 0 ? "+" : ""}${v.delta30}` : "—"}
                </p>
              </div>
              <div>
                <p className="label-caps text-muted-foreground">Δ last 7 days</p>
                <p className="mt-1 font-mono text-lg text-foreground">
                  {v.delta7 != null ? `${v.delta7 >= 0 ? "+" : ""}${v.delta7}` : "—"}
                </p>
              </div>
              <div>
                <p className="label-caps text-muted-foreground">History</p>
                <p className="mt-1 font-mono text-lg text-foreground">{v.daysCovered} days</p>
              </div>
            </div>
            {whatIf && (
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-sm text-muted-foreground">
                  Estimated downloads:{" "}
                  <span className="font-mono font-bold text-foreground">
                    ≈{fmtRange(whatIf.low)}–{fmtRange(whatIf.high)}/mo
                  </span>{" "}
                  — a range from rating velocity, not a point estimate. Prior:{" "}
                  {effLow}–{effHigh} downloads per new rating
                  {range?.priorLabel ? ` (${range.priorLabel})` : ""} · as of {evidence.asOf}.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[13px]">
                  <label className="text-muted-foreground">
                    Prior low{" "}
                    <input
                      type="number"
                      min={1}
                      value={effLow}
                      onChange={(e) => setPriorLow(e.target.value ? Number(e.target.value) : null)}
                      className="w-20 rounded border border-input bg-card px-2 py-1 text-foreground"
                    />
                  </label>
                  <label className="text-muted-foreground">
                    Prior high{" "}
                    <input
                      type="number"
                      min={1}
                      value={effHigh}
                      onChange={(e) => setPriorHigh(e.target.value ? Number(e.target.value) : null)}
                      className="w-20 rounded border border-input bg-card px-2 py-1 text-foreground"
                    />
                  </label>
                  <span className="text-muted-foreground">
                    Adjust the prior to test your own assumption — the range recomputes here only.
                  </span>
                </div>
              </div>
            )}
            {v.acceleration != null && (
              <p className="mt-3 text-sm text-muted-foreground">
                Acceleration: {v.acceleration >= 0 ? "+" : ""}
                {v.acceleration} ratings vs the prior 30 days
                {v.bracketCrossings > 0 ? ` · ${v.bracketCrossings} install-bracket crossing(s) in history` : ""}
                {v.ageDays != null ? ` · first seen ${v.ageDays} days ago` : ""}.
              </p>
            )}
          </>
        )}
        {opp.isRising && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded border border-score-high/30 bg-score-high/10 px-2 py-0.5 text-[11px] font-semibold text-score-high">
            ▲ NEW &amp; RISING
          </p>
        )}
        {v.rankAlert && v.rankMove7d != null && (
          <p className="mt-3 text-sm text-score-medium">
            Category-rank alert: moved {Math.abs(v.rankMove7d)} positions in the last week
            {v.rankMove7d < 0 ? " (climbed)" : " (fell)"} — check whether a feature, update, or paid
            push explains it before reading it as organic momentum.
          </p>
        )}
      </section>

      {/* Wedge audit */}
      <section className="card-paper p-6 md:p-8">
        <span className="label-caps text-muted-foreground">Keyword wedge audit</span>
        <h2 className="font-serif text-[1.75rem] font-medium leading-tight text-foreground">
          Can a new app enter “{wedge.keyword ?? evidence.keyword}”? <NewBadge />
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <p className="label-caps text-muted-foreground">Wedge score</p>
            <p className="mt-1 font-mono text-lg text-foreground">{wedge.wedgeScore ?? "—"}/100</p>
          </div>
          <div>
            <p className="label-caps text-muted-foreground">Median ratings (top 10)</p>
            <p className="mt-1 font-mono text-lg text-foreground">
              {wedge.medianRatings != null ? wedge.medianRatings.toLocaleString() : "—"}
            </p>
          </div>
          <div>
            <p className="label-caps text-muted-foreground">Title matches</p>
            <p className="mt-1 font-mono text-lg text-foreground">{wedge.titleMatchCount ?? "—"} / {wedge.peersConsidered ?? "—"}</p>
          </div>
          <div>
            <p className="label-caps text-muted-foreground">Below 4.2★ in top 10</p>
            <p className="mt-1 font-mono text-lg text-foreground">{wedge.below42Count ?? "—"}</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {wedge.smallAppInTop5
            ? "A small app already ranks in the top 5 — the keyword is enterable. "
            : "No small app in the top 5 — incumbents hold the keyword. "}
          {wedge.branded
            ? "Warning: this looks like a branded keyword dominated by one app, not a category opening."
            : ""}
        </p>
        {Array.isArray(wedge.suggestedWedges) && wedge.suggestedWedges.length > 0 && (
          <div className="mt-4">
            <p className="label-caps text-muted-foreground">Wedge keywords to scan next</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Long-tails built from the top complaint themes. These are suggestions, not audited
              keywords — run a scan on each to measure its wedge.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {wedge.suggestedWedges.map((w: string) => (
                <span key={w} className="rounded border border-border bg-muted px-2 py-1 font-mono text-[12px] text-foreground">
                  {w}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Monetisation strip */}
      <section className="card-paper p-6 md:p-8">
        <span className="label-caps text-muted-foreground">Monetisation signals</span>
        <h2 className="font-serif text-[1.75rem] font-medium leading-tight text-foreground">
          Does anyone pay here? <NewBadge />
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{mon.line ?? "Unknown."}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[13px] text-muted-foreground">
          <span>IAP: {mon.offersIap ? `yes${mon.iapRange ? ` (${mon.iapRange})` : ""}` : "no"}</span>
          <span>Price: {mon.priceText ?? "—"}</span>
          <span>Ads: {mon.adSupported ? "yes" : "no"}</span>
          <span>Subscription language: {mon.subscriptionLanguage ? "yes" : "no"}</span>
        </div>
        <p className="mt-2 font-mono text-[12px] text-muted-foreground">
          Presence + velocity only. No revenue figure is shown because Play never publishes one.
        </p>
      </section>

      {/* Freshness */}
      <section className="card-paper p-6 md:p-8">
        <span className="label-caps text-muted-foreground">Freshness</span>
        <h2 className="font-serif text-[1.75rem] font-medium leading-tight text-foreground">
          Is the incumbent still alive? <NewBadge />
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <p className="label-caps text-muted-foreground">Days since update</p>
            <p className="mt-1 font-mono text-lg text-foreground">{fresh.daysSinceUpdate ?? "—"}</p>
          </div>
          <div>
            <p className="label-caps text-muted-foreground">Recent avg (newest ~100)</p>
            <p className="mt-1 font-mono text-lg text-foreground">{fresh.recentAvg ?? "—"}</p>
          </div>
          <div>
            <p className="label-caps text-muted-foreground">Recent − lifetime</p>
            <p className="mt-1 font-mono text-lg text-foreground">
              {fresh.recentDelta != null ? `${fresh.recentDelta >= 0 ? "+" : ""}${fresh.recentDelta}` : "—"}
            </p>
          </div>
          <div>
            <p className="label-caps text-muted-foreground">Developer reply rate</p>
            <p className="mt-1 font-mono text-lg text-foreground">
              {fresh.developerReplyRate != null ? `${Math.round(fresh.developerReplyRate * 100)}%` : "—"}
            </p>
          </div>
        </div>
        {fresh.recentDelta != null && fresh.recentDelta <= -0.3 && (
          <p className="mt-3 text-sm text-score-medium">
            Deteriorating: recent reviews average well below the lifetime rating — the headline
            rating hides a slipping incumbent.
          </p>
        )}
        {fresh.versionBreak && (
          <p className="mt-2 text-sm text-score-medium">{fresh.versionBreak}</p>
        )}
      </section>

      {/* Review themes */}
      <section className="card-paper p-6 md:p-8">
        <span className="label-caps text-muted-foreground">What users actually complain about</span>
        <h2 className="font-serif text-[1.75rem] font-medium leading-tight text-foreground">
          Complaint themes, from real 1–3★ reviews <NewBadge />
        </h2>
        {evidence.miningNote && (
          <p className="mt-2 text-sm text-muted-foreground">{evidence.miningNote}</p>
        )}
        {!mining || mining.themes.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No complaint themes found in the sampled reviews — either the niche is quiet or reviews
            could not be fetched. Themes appear once 1–3★ reviews are available.
          </p>
        ) : (
          <>
            <p className="mt-2 font-mono text-[12px] text-muted-foreground">
              Sample: {mining.fetched} newest reviews ({mining.lowStar} rated 1–3★)
              {mining.dateFrom && mining.dateTo ? ` · ${mining.dateFrom} → ${mining.dateTo}` : ""}
              {mining.appsCovered?.length ? ` · apps: ${mining.appsCovered.join(", ")}` : ""} ·
              counted per review, not per mention.
            </p>
            <div className="mt-4 space-y-4">
              {mining.themes.map((t: any) => (
                <div key={t.key} className="border-b border-border/60 pb-4 last:border-b-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-foreground">{t.label}</p>
                    <p className="font-mono text-[13px] text-muted-foreground">
                      {t.reviewCount} reviews · severity {t.severity}/3
                    </p>
                  </div>
                  {t.quotes?.map((q: any, i: number) => (
                    <p key={i} className="mt-2 border-l-2 border-primary/40 pl-3 text-sm italic leading-relaxed text-muted-foreground">
                      “{q.text}”
                      <span className="mt-0.5 block font-mono text-[12px] not-italic">
                        {q.appTitle} · {q.stars}★{q.date ? ` · ${q.date}` : ""}
                      </span>
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Trend */}
      <section className="card-paper p-6 md:p-8">
        <span className="label-caps text-muted-foreground">90-day trend</span>
        <h2 className="font-serif text-[1.75rem] font-medium leading-tight text-foreground">
          Fad or sustained demand? <NewBadge />
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Direction: <span className="font-mono font-bold text-foreground">{trend.direction ?? "unknown"}</span>
          {trend.note ? ` — ${trend.note}` : ""}
        </p>
        {Array.isArray(evidence.snapshots) && evidence.snapshots.length >= 2 && (
          <div className="mt-4">
            <RatingsSparkline points={evidence.snapshots} />
          </div>
        )}
      </section>

      {/* Cross-checks */}
      <section className="card-paper p-6 md:p-8">
        <span className="label-caps text-muted-foreground">Manual cross-checks</span>
        <h2 className="font-serif text-[1.75rem] font-medium leading-tight text-foreground">
          Verify it yourself <NewBadge />
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          These are plain links for spot-checking — The-Tool does not scrape these sites.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <a
            href={evidence.crossChecks?.appBrainUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            AppBrain page for this app
            <Icon name="open_in_new" className="text-[15px]" />
          </a>
          <a
            href={evidence.crossChecks?.appTrendKitUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            AppTrendKit keyword difficulty checker
            <Icon name="open_in_new" className="text-[15px]" />
          </a>
        </div>
        <p className="mt-2 font-mono text-[12px] text-muted-foreground">
          AppBrain link uses the app's title slug + package ID; if it lands on a search page, search
          the package ID there. AppTrendKit is iOS-focused — use it as a keyword sense-check only.
        </p>
      </section>
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
  const [history, setHistory] = useState<ScorePoint[]>([]);
  const [evidence, setEvidence] = useState<any | null>(null);
  const [evidenceNote, setEvidenceNote] = useState("");
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [error, setError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");
  const [actionError, setActionError] = useState("");
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const autoAnalyzed = useRef(false);

  const runAnalysis = useCallback(async (id: string, refresh = false) => {
    setAnalyzing(true);
    setAnalyzeError("");
    try {
      const res = await apiFetch("/api/hunter/opportunities/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, refresh }),
      });
      if (res.status === 401) return; // redirect already fired
      if (!res.ok) {
        setAnalyzeError("Analysis failed — tap to retry.");
        return;
      }
      const r = await apiFetch(`/api/hunter/opportunities/${id}`);
      if (r.status === 401) return; // redirect already fired
      if (r.ok) {
        const d = await r.json();
        setAnalyses(d.opportunity.analyses ?? []);
      }
      // Refresh the evidence packet too (it may have been rebuilt).
      try {
        const eres = await apiFetch(`/api/hunter/opportunities/${id}/evidence`);
        if (eres.ok) {
          const edata = await eres.json();
          if (edata.evidence) setEvidence(edata.evidence);
        }
      } catch {
        // evidence is a bonus section; the scorecard still stands
      }
    } catch {
      setAnalyzeError("Analysis failed — tap to retry.");
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/hunter/opportunities/${params.id}`);
      if (res.status === 401) return; // apiFetch already redirected to /login
      if (!res.ok) {
        setError("Opportunity not found.");
        return;
      }
      const data = await res.json();
      setOpp(data.opportunity);
      const list: Analysis[] = data.opportunity.analyses ?? [];
      setAnalyses(list);
      // Score history for the sparkline — best-effort, failure hides the
      // section rather than the page.
      try {
        const hres = await apiFetch(`/api/hunter/opportunities/${params.id}/history`);
        if (hres.ok) {
          const hdata = await hres.json();
          setHistory(hdata.history ?? []);
        }
      } catch {
        // leave the history empty; the section simply won't render
      }
      // Evidence packet (wedge, velocity, themes, trend) — loads in the
      // background; the page works without it.
      setEvidenceLoading(true);
      try {
        const eres = await apiFetch(`/api/hunter/opportunities/${params.id}/evidence`);
        if (eres.ok) {
          const edata = await eres.json();
          if (edata.evidence) setEvidence(edata.evidence);
          else if (edata.note) setEvidenceNote(edata.note);
        }
      } catch {
        // evidence section simply won't render
      } finally {
        setEvidenceLoading(false);
      }
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
    setActionError("");
    try {
      const res = await apiFetch(`/api/hunter/opportunities/${opp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBookmarked: !opp.isBookmarked }),
      });
      if (res.status === 401) return; // redirect already fired
      if (res.ok) {
        const data = await res.json();
        setOpp({ ...opp, isBookmarked: data.opportunity.isBookmarked });
      } else {
        setActionError("Could not update the bookmark. Please try again.");
      }
    } catch {
      setActionError("Could not update the bookmark. Please try again.");
    }
  }

  async function deleteOpp() {
    if (!opp) return;
    setActionError("");
    try {
      const res = await apiFetch(`/api/hunter/opportunities/${opp.id}`, {
        method: "DELETE",
      });
      if (res.status === 401) return; // redirect already fired
      if (res.ok) {
        router.push("/");
      } else {
        setActionError("Could not delete the opportunity. Please try again.");
      }
    } catch {
      setActionError("Could not delete the opportunity. Please try again.");
    }
  }

  async function deleteAnalysis(id: string) {
    if (!opp) return;
    setActionError("");
    try {
      const res = await apiFetch(`/api/hunter/opportunities/analyses/${id}`, {
        method: "DELETE",
      });
      if (res.status === 401) return; // redirect already fired
      if (res.ok) {
        setAnalyses([]);
        // Analysis is automatic — a fresh one starts right away.
        runAnalysis(opp.id);
      } else {
        setActionError("Could not delete the analysis. Please try again.");
      }
    } catch {
      setActionError("Could not delete the analysis. Please try again.");
    }
  }

  async function sendToBuilder() {
    if (!opp) return;
    setSending(true);
    setActionError("");
    try {
      const res = await apiFetch("/api/hunter/opportunities/send-to-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: opp.id }),
      });
      if (res.status === 401) return; // redirect already fired
      if (!res.ok) {
        setActionError("Could not send to the builder. Please try again.");
        return;
      }
      const data = await res.json();
      if (data.refineUrl) {
        router.push(data.refineUrl);
      } else {
        setActionError("Could not send to the builder. Please try again.");
      }
    } catch {
      setActionError("Could not send to the builder. Please try again.");
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
        {/* Inline action error (bookmark / delete / send-to-builder) */}
        {actionError && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <span className="inline-flex items-start gap-2">
              <Icon name="error" className="text-[18px]" />
              {actionError}
            </span>
            <button
              onClick={() => setActionError("")}
              aria-label="Dismiss error"
              className="shrink-0 text-destructive/70 transition-colors hover:text-destructive"
            >
              <Icon name="close" className="text-[18px]" />
            </button>
          </div>
        )}
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
                  {opp.velocityPerDay != null && (
                    <>
                      <span className="text-border">|</span>
                      <span className="inline-flex items-center gap-1">
                        <Icon name="trending_up" className="text-[16px]" />
                        {opp.velocityPerDay.toFixed(1)} ratings/day
                      </span>
                      <NewBadge />
                    </>
                  )}
                  {opp.isRising && (
                    <span className="inline-flex items-center gap-1 rounded border border-score-high/30 bg-score-high/10 px-2 py-0.5 text-[11px] font-semibold text-score-high">
                      ▲ NEW &amp; RISING
                    </span>
                  )}
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
              <button onClick={() => setConfirmDelete(true)} className="btn-ghost">
                <Icon name="delete" className="text-[18px]" />
                Delete Opportunity
              </button>
            </div>
          </div>

          {/* Metric strip — real data only */}
          <div className="grid grid-cols-2 gap-4 pt-6 md:grid-cols-4">
            <div className="card-paper p-3">
              <p className="label-caps text-muted-foreground">User Rating</p>
              <p className="mt-1 inline-flex items-center gap-1.5 font-mono text-lg text-foreground">
                <Icon name="star" className="text-score-medium text-[20px]" />
                {opp.rating ?? "—"}
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

        {/* Score history */}
        {history.length > 0 && (
          <section className="card-paper p-6">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="font-serif text-lg font-medium text-foreground">
                Score over time
              </h2>
              <span className="font-mono text-[13px] text-muted-foreground">
                {history.length} {history.length === 1 ? "scan" : "scans"}
              </span>
            </div>
            {history.length < 2 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Only one scan so far — the trend line appears after the next scan.
              </p>
            ) : (
              <ScoreSparkline points={history} />
            )}
          </section>
        )}

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

        {/* Evidence packet: wedge, velocity, themes, trend, cross-checks */}
        {evidenceLoading && !evidence && (
          <section className="card-paper p-6">
            <p className="text-sm text-muted-foreground">
              Building the evidence packet — wedge audit, velocity, review themes…
            </p>
          </section>
        )}
        {evidence && <EvidenceSections evidence={evidence} opp={opp} />}
        {evidenceNote && !evidence && (
          <section className="card-paper p-6">
            <p className="text-sm text-muted-foreground">{evidenceNote}</p>
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
              onClick={() => opp && runAnalysis(opp.id, true)}
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
          {analyzeError && !analyzing && (
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
                {(() => {
                  // Grounded scorecards render as verdict + criteria;
                  // legacy prose analyses keep the old card layout.
                  try {
                    const parsed = JSON.parse(a.content);
                    if (parsed?.scorecard) {
                      return <ScorecardCards content={a.content} />;
                    }
                  } catch {
                    // fall through to legacy cards
                  }
                  return <AnalysisCards content={a.content} />;
                })()}
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
            disabled={sending || analyzing}
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
      {confirmDelete && opp && (
        <ConfirmDialog
          title="Delete opportunity?"
          message={`“${opp.title}” will be permanently removed from your opportunities. This can't be undone.`}
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            deleteOpp();
          }}
        />
      )}
    </>
  );
}
