/**
 * AI analysis for Opportunity Hunter features.
 *
 * Uses the shared NVIDIA-backed `chat()` adapter from `@/lib/ai`.
 */

import { chat } from "@/lib/ai";
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

export interface OpportunityInput {
  title: string;
  rating?: number | null;
  installs?: string | null;
  reviewsCount?: number | null;
  score?: number | null;
  category?: string | null;
  breakdown?: string | null;
  url?: string | null;
}

const OPPORTUNITY_PROMPT = `You are a senior mobile-app market analyst doing a deep competitive teardown. Someone found this underrated app on the Google Play Store and wants a detailed breakdown before building a better competing version. Be specific and concrete — name real things, avoid generic advice like "conduct market research" or "build a user-friendly interface".

App: {title}
Rating: {rating} stars
Installs: {installs}
Reviews: {reviews}
Opportunity score: {score}/100 (high rating, low installs = hidden gem)
Category: {category}
Play Store: {url}

Reply in exactly this JSON shape (no markdown, no extra text):
{
  "summary": "3-4 sentences: what the app does, who uses it, and its position in the niche",
  "strengths": ["4-5 specific things this app does well"],
  "weaknesses": ["4-5 specific weaknesses, missing features, or likely user frustrations a competitor could exploit"],
  "user_pain_points": ["3-4 pain points users of this kind of app typically complain about in reviews"],
  "competition": "2-3 sentences on the competitive landscape: who else serves this niche and where they are weak",
  "differentiation": ["3-4 concrete ways a new competing app could clearly stand out"],
  "opportunity": "3-4 sentences on the market opening this app reveals, with specifics",
  "mvp_scope": {
    "must_have": ["4-6 features the v1 must ship with"],
    "later": ["3-4 features to deliberately postpone after launch"]
  },
  "build_plan": ["5-7 concrete ordered build steps, specific to this app idea"],
  "monetization": "2-3 sentences: the primary revenue model plus one secondary",
  "risks": ["2-3 honest risks of building this"],
  "go_to_market": "2-3 sentences on how to get the first 1,000 users"
}`;

export interface OpportunityAnalysis {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  user_pain_points: string[];
  competition: string;
  differentiation: string[];
  opportunity: string;
  mvp_scope: { must_have: string[]; later: string[] };
  build_plan: string[];
  monetization: string;
  risks: string[];
  go_to_market: string;
  provider: string;
  model: string;
}

/**
 * Deep-dive AI analysis of a scanned Play Store opportunity — the same
 * breakdown the old Hunter detail page showed: what the app does well,
 * where it's weak, and how to beat it.
 */
export async function analyzeOpportunity(
  opp: OpportunityInput
): Promise<OpportunityAnalysis> {
  const prompt = OPPORTUNITY_PROMPT.replace("{title}", opp.title)
    .replace("{rating}", String(opp.rating ?? "unknown"))
    .replace("{installs}", opp.installs ?? "unknown")
    .replace("{reviews}", String(opp.reviewsCount ?? "unknown"))
    .replace("{score}", String(opp.score ?? "unknown"))
    .replace("{category}", opp.category ?? "unknown")
    .replace("{url}", opp.url ?? "unknown");

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
