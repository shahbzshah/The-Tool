/**
 * AI analysis for Opportunity Hunter features.
 *
 * Uses the shared NVIDIA-backed `chat()` adapter from `@/lib/ai`.
 */

import { chat, getModel } from "@/lib/ai";
import type { TrendIdea } from "./trends";

const IDEA_PROMPT = `You are a mobile-app market analyst. Someone spotted this app idea trending
online and wants a detailed breakdown before deciding whether to build it.

Idea: {title}
Source: {source}
Context: {context}

Reply in exactly this JSON shape (no markdown, no extra text):
{
  "summary": "2-3 sentences explaining what the idea is",
  "why_trending": "2-3 sentences on why this is getting attention right now",
  "target_audience": "who would use this, in one sentence",
  "key_features": ["must-have feature 1", "must-have feature 2", "must-have feature 3"],
  "monetization": "one sentence on how this app could make money",
  "competition_angle": "2-3 sentences on what to look for when scanning the Play Store for existing competition",
  "suggested_keywords": ["keyword 1", "keyword 2", "keyword 3"]
}`;

export interface IdeaAnalysis {
  summary: string;
  why_trending: string;
  target_audience: string;
  key_features: string[];
  monetization: string;
  competition_angle: string;
  suggested_keywords: string[];
  provider: string;
  model: string;
}

/**
 * Grounded scorecard prompt (plan item 8). The LLM receives ONLY the
 * computed evidence packet — never raw metadata to riff on — and must
 * return a JSON scorecard. Numbers it returns are validated in code
 * (see lib/hunter/scorecard): anything not traceable to the packet is
 * demoted to Unknown, and quotes must match packet quotes verbatim.
 * Temperature is kept low (0.1) so the output stays an interpretation,
 * not an invention.
 */
const SCORECARD_PROMPT = `You are a senior mobile-app market analyst. Interpret ONLY the evidence packet below — do not invent numbers, quotes, or facts that are not in it. If a criterion has no evidence in the packet, score it "Unknown", never 0 and never a guess.

EVIDENCE PACKET (computed from Google Play data, snapshot history, and Hacker News counts):
{packet}

Reply in exactly this JSON shape (no markdown, no extra text):
{
  "summary": "3-4 sentences interpreting the packet: what the opening is, in plain words",
  "demand": { "value": 0-100 or "Unknown", "evidence": "which packet fields support this, in one sentence", "confidence": "High|Medium|Low" },
  "competition": { "value": 0-100 or "Unknown", "evidence": "one sentence", "confidence": "High|Medium|Low" },
  "vulnerability": { "value": 0-100 or "Unknown", "evidence": "one sentence, naming the top complaint themes", "confidence": "High|Medium|Low" },
  "monetisation": { "value": 0-100 or "Unknown", "evidence": "one sentence", "confidence": "High|Medium|Low" },
  "wedge_keyword": { "keyword": "the audited keyword or one of its suggested wedges", "value": 0-100 or "Unknown", "evidence": "one sentence", "confidence": "High|Medium|Low" },
  "verdict": "GO|CONDITIONAL|NO-GO",
  "kill_criteria": ["concrete facts that would kill this idea, from the packet"],
  "unknowns": ["what the packet cannot answer — retention, DAU/MAU, CAC/LTV, real revenue"],
  "verified_quotes": ["copy at most 3 quotes EXACTLY as they appear in the packet's themes, or leave empty"]
}`;

export interface OpportunityAnalysis {
  summary: string;
  scorecard: import("./scorecard").Scorecard;
  /** Small echo of the packet facts the scorecard rests on. */
  packetFacts: {
    keyword: string;
    wedgeScore: number;
    velocityPerDay: number | null;
    delta30: number | null;
    topThemes: { label: string; reviewCount: number }[];
    monetisationLine: string;
    rangeLine: string | null;
    compositeScore: number;
    confidence: string;
    asOf: string;
  };
  provider: string;
  model: string;
}

/**
 * Grounded AI analysis of a scanned Play Store opportunity. The LLM only
 * interprets the computed evidence packet and returns a structured
 * go/no-go scorecard; code validates the output before it is stored.
 */
export async function analyzeOpportunity(
  packet: import("./evidence").EvidencePacket
): Promise<OpportunityAnalysis> {
  const prompt = SCORECARD_PROMPT.replace("{packet}", JSON.stringify(packet));
  const text = await chat(
    [{ role: "user", content: prompt }],
    { temperature: 0.1, maxTokens: 2048 }
  );
  const parsed = JSON.parse(stripJsonFence(text));
  const { validateScorecard } = await import("./scorecard");
  const scorecard = validateScorecard(parsed, packet);
  return {
    summary: scorecard.summary,
    scorecard,
    packetFacts: {
      keyword: packet.keyword,
      wedgeScore: packet.wedge.wedgeScore,
      velocityPerDay: packet.velocity.perDay,
      delta30: packet.velocity.delta30,
      topThemes: (packet.mining?.themes ?? [])
        .slice(0, 3)
        .map((t) => ({ label: t.label, reviewCount: t.reviewCount })),
      monetisationLine: packet.monetisation.line,
      rangeLine: packet.range ? packet.range.line : null,
      compositeScore: packet.composite.score,
      confidence: packet.composite.confidence,
      asOf: packet.asOf,
    },
    provider: "nvidia",
    model: await getModel(),
  };
}
function stripJsonFence(text: string): string {
  return text
    .trim()
    .replace(/^```json\s*/, "")
    .replace(/^```\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
}

/**
 * Deep-dive AI analysis of a trending idea. Returns the structured
 * analysis shape used by the "Send to Builder" flow.
 */
export async function analyzeIdea(idea: TrendIdea): Promise<IdeaAnalysis> {
  const prompt = IDEA_PROMPT.replace("{title}", idea.title)
    .replace("{source}", idea.source)
    .replace("{context}", (idea.text || "").slice(0, 800));

  const text = await chat(
    [{ role: "user", content: prompt }],
    { temperature: 0.4, maxTokens: 2048 }
  );
  const parsed = JSON.parse(stripJsonFence(text));
  return {
    ...parsed,
    provider: "nvidia",
    model: process.env.NVIDIA_MODEL || "meta/llama-3.2-11b-vision-instruct",
  };
}
