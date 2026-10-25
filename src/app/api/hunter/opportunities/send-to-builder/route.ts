import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/**
 * POST /api/hunter/opportunities/send-to-builder — push a scanned Play Store
 * opportunity into the build pipeline. Creates a Project with an approved
 * Idea, landing the user on the Design step.
 * Body: { id: string } (Opportunity id).
 *
 * Arrival-data rule: every brief field carries ONLY data already present on
 * the opportunity, its latest analysis, or its scan job. Nothing is
 * invented here — no personas, no feature lists, no monetisation claims
 * that the source data does not support. Where the source data has no
 * answer, the field stays empty (or null) and Refine's "Draft idea from
 * analysis" step fills it from the market analysis carried in preferences.
 */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const { id } = await req.json().catch(() => ({}));
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Missing opportunity id." }, { status: 400 });
  }

  const opp = await prisma.opportunity.findFirst({
    where: { id, scanJob: { userId: auth.user.id } },
    include: {
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
      scanJob: { select: { keyword: true } },
    },
  });
  if (!opp) {
    return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
  }

  const breakdown: Record<string, any> = (() => {
    try {
      return opp.breakdown ? JSON.parse(opp.breakdown) : {};
    } catch {
      return {};
    }
  })();

  // Intake rows (upload / link / own-idea) are ideas, not Play apps:
  // their pitch must not cite a rating/installs they don't have. The
  // Hunter path below is untouched.
  const isIntake = !!opp.source && opp.source !== "hunter";
  const intakeDraft = (breakdown as Record<string, any>).draft as
    | { topic?: string; app_concept?: string | null; audience?: string | null }
    | undefined;
  const sourceLabel = isIntake
    ? opp.source === "own-idea"
      ? "your own idea"
      : opp.source === "link"
        ? "a pasted link"
        : "an upload"
    : "Play Store scan";

  // The latest analysis can be one of two stored shapes:
  //  - legacy prose analysis: summary, strengths, weaknesses,
  //    user_pain_points, competition, differentiation, opportunity,
  //    mvp_scope { must_have, later }, build_plan, monetization, risks,
  //    go_to_market
  //  - grounded scorecard: summary, scorecard { demand, competition,
  //    vulnerability, monetisation, wedge_keyword, verdict, kill_criteria,
  //    unknowns, verified_quotes }, packetFacts { keyword, wedgeScore,
  //    velocityPerDay, delta30, topThemes, monetisationLine, rangeLine,
  //    compositeScore, confidence, asOf }
  // Both are parsed tolerantly; only fields actually present are used.
  const parsed: any = (() => {
    try {
      return opp.analyses[0] ? JSON.parse(opp.analyses[0].content) : null;
    } catch {
      return null;
    }
  })();
  const scorecard = parsed?.scorecard ?? null;
  const packetFacts = parsed?.packetFacts ?? null;
  const legacy = parsed && !scorecard ? parsed : null;

  // The analyzed doc travels with the project so the builder has the full
  // breakdown, and so Refine's "Draft idea from analysis" step (which reads
  // project.preferences as its input) drafts from real evidence.
  let analysisText = "";
  if (parsed) {
    const lines: string[] = [];
    if (parsed.summary) lines.push(`Summary: ${parsed.summary}`);
    if (scorecard) {
      if (scorecard.verdict) lines.push(`Verdict: ${scorecard.verdict}`);
      const criteria: Array<[string, any]> = [
        ["Demand", scorecard.demand],
        ["Competition", scorecard.competition],
        ["Vulnerability", scorecard.vulnerability],
        ["Monetisation", scorecard.monetisation],
      ];
      for (const [label, crit] of criteria) {
        if (crit && crit.value !== undefined && crit.value !== null) {
          lines.push(`${label}: ${crit.value}${crit.evidence ? ` — ${crit.evidence}` : ""}`);
        }
      }
      if (scorecard.wedge_keyword?.keyword) {
        lines.push(
          `Wedge keyword: ${scorecard.wedge_keyword.keyword}${scorecard.wedge_keyword.value !== undefined && scorecard.wedge_keyword.value !== null ? ` (${scorecard.wedge_keyword.value})` : ""}`
        );
      }
      if (Array.isArray(scorecard.kill_criteria) && scorecard.kill_criteria.length > 0) {
        lines.push(`Kill criteria: ${scorecard.kill_criteria.join("; ")}`);
      }
      if (Array.isArray(scorecard.unknowns) && scorecard.unknowns.length > 0) {
        lines.push(`Unknowns: ${scorecard.unknowns.join("; ")}`);
      }
      if (Array.isArray(scorecard.verified_quotes) && scorecard.verified_quotes.length > 0) {
        lines.push(`Verified reviewer quotes: ${scorecard.verified_quotes.join(" | ")}`);
      }
    } else {
      if (Array.isArray(parsed.strengths)) lines.push(`Strengths: ${parsed.strengths.join("; ")}`);
      if (Array.isArray(parsed.weaknesses)) lines.push(`Weaknesses: ${parsed.weaknesses.join("; ")}`);
      if (Array.isArray(parsed.user_pain_points)) lines.push(`User pain points: ${parsed.user_pain_points.join("; ")}`);
      if (parsed.competition) lines.push(`Competition: ${parsed.competition}`);
      if (Array.isArray(parsed.differentiation)) lines.push(`Differentiation: ${parsed.differentiation.join("; ")}`);
      if (parsed.opportunity) lines.push(`Opportunity: ${parsed.opportunity}`);
      if (parsed.mvp_scope) {
        if (Array.isArray(parsed.mvp_scope.must_have)) lines.push(`MVP must-haves: ${parsed.mvp_scope.must_have.join("; ")}`);
        if (Array.isArray(parsed.mvp_scope.later)) lines.push(`Postpone until later: ${parsed.mvp_scope.later.join("; ")}`);
      }
      if (Array.isArray(parsed.build_plan)) lines.push(`Build plan: ${parsed.build_plan.join("; ")}`);
      if (parsed.monetization) lines.push(`Monetization: ${parsed.monetization}`);
      if (Array.isArray(parsed.risks)) lines.push(`Risks: ${parsed.risks.join("; ")}`);
      if (parsed.go_to_market) lines.push(`Go to market: ${parsed.go_to_market}`);
    }
    if (packetFacts) {
      if (packetFacts.monetisationLine) lines.push(`Monetisation evidence: ${packetFacts.monetisationLine}`);
      if (Array.isArray(packetFacts.topThemes) && packetFacts.topThemes.length > 0) {
        lines.push(
          `Top complaint themes: ${packetFacts.topThemes.map((t: any) => `${t.label} (${t.reviewCount} reviews)`).join("; ")}`
        );
      }
      if (packetFacts.velocityPerDay != null) lines.push(`Momentum: ${packetFacts.velocityPerDay} new ratings/day`);
      if (packetFacts.rangeLine) lines.push(`Download range: ${packetFacts.rangeLine}`);
    }
    analysisText = lines.join("\n");
  }

  // --- Hunter brief fields, each sourced from real data only. ---
  // Scan keyword: the most specific audience signal the data holds — the
  // demand the opportunity was scored on. Falls back to the scan job's
  // keyword; with neither, the audience stays honestly empty.
  const hunterKeyword: string | null =
    (typeof packetFacts?.keyword === "string" && packetFacts.keyword) ||
    opp.scanJob?.keyword ||
    null;
  const hunterAudience = hunterKeyword
    ? `People searching for "${hunterKeyword}" apps on the Play Store`
    : "";

  // Monetisation: grounded scorecard line first, then the legacy analysis'
  // monetization suggestion, then the opportunity's own Play flags
  // (price, IAP, ads). Nothing beyond those sources.
  let hunterMonetization: string | null = null;
  if (typeof packetFacts?.monetisationLine === "string" && packetFacts.monetisationLine) {
    hunterMonetization = packetFacts.monetisationLine;
  } else if (typeof legacy?.monetization === "string" && legacy.monetization.trim()) {
    hunterMonetization = legacy.monetization.trim();
  } else {
    const price = opp.priceText?.trim() || null;
    const extras: string[] = [];
    if (opp.offersIap) extras.push("in-app purchases");
    if (opp.containsAds) extras.push("ad-supported");
    if (price || extras.length > 0) {
      const base = price
        ? price.toLowerCase().includes("free")
          ? "Free"
          : `Paid (${price})`
        : null;
      if (base && extras.length > 0) {
        hunterMonetization = `${base} with ${extras.join(" and ")}`;
      } else if (base) {
        hunterMonetization = base;
      } else {
        hunterMonetization = extras
          .map((e) => e.charAt(0).toUpperCase() + e.slice(1))
          .join(", ");
      }
    }
  }

  // Features: only the legacy analysis' MVP must-haves are a genuine
  // feature list. The scorecard shape carries no features, so in that case
  // features stay empty — which keeps Refine's "Draft idea from analysis"
  // button available (it only shows for empty briefs) instead of
  // fabricating a list.
  const legacyMustHaves: string[] =
    Array.isArray(legacy?.mvp_scope?.must_have)
      ? legacy.mvp_scope.must_have.filter(
          (x: unknown): x is string => typeof x === "string" && x.trim().length > 0
        ).map((x: string) => x.trim())
      : [];
  const hunterFeatures = legacyMustHaves;

  // Pitch: the Hunter thesis (opportunity summary) where it exists — the
  // scored why-it-scores narrative — not a generated generic summary.
  // Without a thesis, facts only: title, score, rating/installs if known.
  const hunterPitch = opp.summary?.trim()
    ? opp.summary.trim()
    : `${opp.title} — Opportunity score ${opp.score}/100 from a Play Store scan${opp.rating != null ? `, rated ${opp.rating}★` : ""}${opp.installs ? ` with ${opp.installs} installs` : ""}.`;

  const project = await prisma.project.create({
    data: {
      userId: auth.user.id,
      name: opp.title,
      category: isIntake ? "from-intake" : "from-play-store-scan",
      platform: "mobile", // Play Store opportunity → Android + iOS native app, web optional
      preferences: [
        `Source: ${sourceLabel} (opportunity score ${opp.score}/100)`,
        opp.url ? `Original link: ${opp.url}` : "",
        isIntake
          ? ""
          : `Rating: ${opp.rating ?? "n/a"} · Installs: ${opp.installs ?? "n/a"} · Reviews: ${opp.reviewsCount?.toString() ?? "n/a"}`,
        breakdown.quality !== undefined
          ? `Score breakdown — quality ${breakdown.quality}, gap ${breakdown.gap}, market ${breakdown.market}, competition ${breakdown.competition}`
          : "",
        !isIntake && hunterKeyword ? `Scan keyword: ${hunterKeyword}` : "",
        !isIntake && scorecard?.verdict ? `Scorecard verdict: ${scorecard.verdict}` : "",
        !isIntake && packetFacts?.compositeScore != null
          ? `Composite score: ${packetFacts.compositeScore}/100 (${packetFacts.confidence} confidence)`
          : "",
        analysisText ? `\nAI analysis:\n${analysisText}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      ideas: {
        create: {
          title: opp.title,
          pitch: isIntake
            ? `${opp.title} — ${opp.summary ?? "Researched app idea"}. Opportunity score ${opp.score}/100 from ${sourceLabel} research.`
            : hunterPitch,
          features: isIntake ? JSON.stringify([]) : JSON.stringify(hunterFeatures),
          targetAudience: isIntake
            ? (intakeDraft?.audience && intakeDraft.audience.toLowerCase() !== "null"
                ? intakeDraft.audience
                : `Users interested in "${opp.title}"`)
            : hunterAudience,
          monetization: isIntake ? null : hunterMonetization,
          status: "approved",
        },
      },
    },
    include: { ideas: true },
  });

  const idea = project.ideas[0];
  return NextResponse.json({
    projectId: project.id,
    ideaId: idea.id,
    refineUrl: `/refine/${project.id}?idea=${idea.id}`,
  });
}
