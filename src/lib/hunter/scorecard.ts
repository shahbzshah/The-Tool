/**
 * Scorecard validation (plan item 8). The LLM interprets ONLY the
 * computed packet; this module makes sure its output stays inside the
 * packet's facts:
 *
 *  - verdict must be GO / CONDITIONAL / NO-GO (anything else -> CONDITIONAL)
 *  - every criterion is a number 0–100 OR "Unknown" — Unknown is never
 *    coerced to 0, and a number with no evidence behind it is demoted
 *    to Unknown
 *  - wedge_keyword must be the audited keyword or one of the packet's
 *    suggested wedges, else it falls back to the audited keyword
 *  - quotes in the output must substring-match a packet quote, else they
 *    are dropped (code-verified quotes only, never LLM-invented)
 */

import type { EvidencePacket } from "./evidence";
import { verifyQuote } from "./reviewMining";

export type CriterionValue = number | "Unknown";

export interface ScorecardCriterion {
  value: CriterionValue;
  evidence: string;
  confidence: "High" | "Medium" | "Low";
}

export interface Scorecard {
  demand: ScorecardCriterion;
  competition: ScorecardCriterion;
  vulnerability: ScorecardCriterion;
  monetisation: ScorecardCriterion;
  wedge_keyword: ScorecardCriterion & { keyword: string };
  verdict: "GO" | "CONDITIONAL" | "NO-GO";
  kill_criteria: string[];
  unknowns: string[];
  summary: string;
  /** Quotes that survived verification against packet quotes. */
  verified_quotes: { text: string; appTitle: string; stars: number }[];
}

function cleanCriterion(
  raw: unknown,
  hasEvidence: boolean
): ScorecardCriterion {
  const r = (raw ?? {}) as Record<string, unknown>;
  let value: CriterionValue = "Unknown";
  if (typeof r.value === "number" && Number.isFinite(r.value)) {
    value = Math.max(0, Math.min(100, Math.round(r.value)));
  }
  // A number with no evidence behind it is a guess: demote to Unknown.
  if (value !== "Unknown" && !hasEvidence) value = "Unknown";
  const confidence =
    r.confidence === "High" || r.confidence === "Medium" || r.confidence === "Low"
      ? r.confidence
      : "Low";
  return {
    value,
    evidence: typeof r.evidence === "string" ? r.evidence.slice(0, 500) : "",
    confidence,
  };
}

function strList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string").slice(0, 12);
}

export function validateScorecard(
  raw: unknown,
  packet: EvidencePacket
): Scorecard {
  const r = (raw ?? {}) as Record<string, unknown>;
  const packetQuotes = (packet.mining?.themes ?? []).flatMap((t) => t.quotes);

  const hasVelocity = packet.velocity.hasHistory && packet.velocity.perDay != null;
  const hasWedge = packet.wedge.peersConsidered > 0;
  const hasThemes = (packet.mining?.lowStar ?? 0) >= 10;
  const hasMonetisation = packet.monetisation.top10MonetisedCount != null;

  const wedgeRaw = (r.wedge_keyword ?? {}) as Record<string, unknown>;
  const candidateKeywords = [packet.keyword, ...packet.wedge.suggestedWedges].filter(Boolean);
  let wedgeKeyword =
    typeof wedgeRaw.keyword === "string" ? wedgeRaw.keyword : packet.keyword;
  if (!candidateKeywords.includes(wedgeKeyword)) wedgeKeyword = packet.keyword;

  // Quotes: only packet quotes survive. The LLM may quote packet quotes
  // back; anything else is dropped before display.
  const outQuotes = strList(r.verified_quotes).slice(0, 6);
  const verified_quotes: Scorecard["verified_quotes"] = [];
  for (const q of outQuotes) {
    const match = packetQuotes.find(
      (pq) => pq.text === q || verifyQuote(q, [{ text: pq.text }])
    );
    if (match) {
      verified_quotes.push({
        text: match.text,
        appTitle: match.appTitle,
        stars: match.stars,
      });
    }
  }
  // If the model quoted nothing, surface the top packet quotes directly —
  // the UI always shows code-verified quotes, never model prose as quotes.
  if (verified_quotes.length === 0 && packetQuotes.length > 0) {
    for (const pq of packetQuotes.slice(0, 3)) {
      verified_quotes.push({ text: pq.text, appTitle: pq.appTitle, stars: pq.stars });
    }
  }

  const verdictRaw = String(r.verdict ?? "").toUpperCase();
  const verdict: Scorecard["verdict"] =
    verdictRaw === "GO" || verdictRaw === "NO-GO" ? (verdictRaw as Scorecard["verdict"]) : "CONDITIONAL";

  // Verdict guard: a verdict of GO with any Unknown core criterion is
  // downgraded — GO requires evidence on all four core criteria.
  const core = [
    cleanCriterion(r.demand, hasVelocity || packet.wedge.medianRatings != null),
    cleanCriterion(r.competition, hasWedge),
    cleanCriterion(r.vulnerability, hasThemes),
    cleanCriterion(r.monetisation, hasMonetisation),
  ];
  let finalVerdict = verdict;
  if (verdict === "GO" && core.some((c) => c.value === "Unknown")) {
    finalVerdict = "CONDITIONAL";
  }

  const unknowns = [...new Set([...strList(r.unknowns), ...packet.unknowns])];

  return {
    demand: core[0],
    competition: core[1],
    vulnerability: core[2],
    monetisation: core[3],
    wedge_keyword: {
      ...cleanCriterion(r.wedge_keyword, hasWedge),
      keyword: wedgeKeyword,
    },
    verdict: finalVerdict,
    kill_criteria: strList(r.kill_criteria),
    unknowns,
    summary: typeof r.summary === "string" ? r.summary.slice(0, 1000) : "",
    verified_quotes,
  };
}
