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
