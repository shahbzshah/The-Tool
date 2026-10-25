/**
 * Upload front door — the "Understand" step (plan §3, §5).
 *
 * A vision model looks at the media and returns ONE strict JSON draft:
 * what it is about, in a form the user can edit. Understanding and
 * research are two separate jobs: this module never sees Play data and
 * never invents competitors, scores, or reviews — those come only from
 * the research step, from real sources.
 *
 * Confidence gate (plan §5): confidence < 0.55 stops the line. The draft
 * opens with help_question instead of a topic. The engine asks; it never
 * fills the gap with invention.
 */

import { chat, getVisionModel } from "@/lib/ai";

/** Confidence below this stops the line and asks the user instead. */
export const UNDERSTAND_CONFIDENCE_GATE = 0.55;

export interface UnderstandingDraft {
  topic: string;
  app_concept: string | null;
  audience: string | null;
  visible_text: string[];
  objects_and_actions: string[];
  keywords: string[];
  /** Null for non-vision drafts (typed idea, imported link): no model read. */
  confidence: number | null;
  needs_user_help: boolean;
  help_question: string | null;
  /** Video only: what changes across frames. */
  motion_summary?: string | null;
  /** Set when the vision call failed/timed out and the gate took over. */
  visual_failed?: boolean;
}

const BASE_RULES = `You are looking at media someone found and is considering as an app idea.
Describe ONLY what is literally visible. Do not invent market size, competitors,
revenue, or anything not visible. If something is unclear, say so via a low
confidence score — never guess.

Reply in exactly this JSON shape (no markdown, no extra text):
{
  "topic": "one plain sentence — what this is about",
  "app_concept": "the app someone might build from it, or null",
  "audience": "who it appears to be for, or null",
  "visible_text": ["every readable word seen, verbatim — no paraphrase"],
  "objects_and_actions": ["what is literally visible — no inference"],
  "keywords": ["3-5 Play Store search phrases for apps like this"],
  "confidence": 0.0,
  "needs_user_help": false,
  "help_question": "the single question to ask if confidence is below 0.55, or null"
}`;

const IMAGE_PROMPT = `${BASE_RULES}

This is a single image. Read any on-screen text as part of the same call.`;

const VIDEO_PROMPT = `${BASE_RULES}

These are sampled frames from one video, plus a labelled contact sheet of all
frames in order. Also return:
{
  "motion_summary": "what changes across frames — a workout being demonstrated, a before/after, a UI being scrolled, or null if nothing moves"
}
Put motion_summary alongside the fields above.`;

function stripJsonFence(text: string): string {
  return text
    .trim()
    .replace(/^```json\s*/, "")
    .replace(/^```\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim());
}

/**
 * Validate a parsed model reply against the §5 contract. Anything outside
 * the shape is discarded, not displayed. Returns null only when the reply
 * carries no usable topic at all (caller then falls back to the help gate).
 */
export function validateUnderstanding(raw: unknown): UnderstandingDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const topic = asString(r.topic) ?? "";
  let keywords = asStringArray(r.keywords).slice(0, 5);
  if (!keywords.length && topic) keywords = [topic];
  let confidence: number | null = null;
  if (typeof r.confidence === "number" && Number.isFinite(r.confidence)) {
    confidence = Math.min(1, Math.max(0, r.confidence));
  }
  const needsHelp =
    r.needs_user_help === true || confidence == null || confidence < UNDERSTAND_CONFIDENCE_GATE;
  if (!topic && !needsHelp) return null;
  return {
    topic,
    app_concept: asString(r.app_concept),
    audience: asString(r.audience),
    visible_text: asStringArray(r.visible_text).slice(0, 50),
    objects_and_actions: asStringArray(r.objects_and_actions).slice(0, 30),
    keywords,
    confidence,
    needs_user_help: needsHelp,
    help_question:
      asString(r.help_question) ??
      (needsHelp ? "What is this video or image about, in one line?" : null),
    motion_summary: asString(r.motion_summary),
  };
}

/** Draft used when the vision call fails: the gate asks, never invents. */
export function needsHelpDraft(fallbackText: string): UnderstandingDraft {
  const topic = fallbackText.trim();
  return {
    topic,
    app_concept: null,
    audience: null,
    visible_text: [],
    objects_and_actions: [],
    keywords: topic ? [topic] : [],
    confidence: 0,
    needs_user_help: true,
    help_question: topic
      ? "I couldn't read this media clearly — is this topic right? Edit it, then confirm."
      : "The visual read failed — what is this video or image about, in one line?",
    motion_summary: null,
    visual_failed: true,
  };
}

/**
 * Run one vision call over the given data-URL images (a single image, or a
 * video's contact sheet + sharpest frames). On failure or timeout (20s cap,
 * plan §4) the job does NOT die: it falls to the confirmation gate with
 * whatever text exists (filename, one-liner, pasted caption).
 */
export async function understandMedia(args: {
  images: string[];
  kind: "image" | "video";
  /** Filename / one-liner / caption — the fallback text if vision fails. */
  fallbackText: string;
}): Promise<{ draft: UnderstandingDraft; visualFailed: boolean }> {
  const prompt = args.kind === "video" ? VIDEO_PROMPT : IMAGE_PROMPT;
  const contextLine = args.fallbackText.trim()
    ? `\nContext the user gave (filename / one-liner): ${args.fallbackText.trim().slice(0, 300)}\n`
    : "";
  try {
    const model = await getVisionModel();
    const text = await chat(
      [
        {
          role: "user",
          content: [
            { type: "text", text: prompt + contextLine },
            ...args.images.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ],
        },
      ],
      { temperature: 0.1, maxTokens: 2048, model, timeoutMs: 20_000 }
    );
    const parsed = JSON.parse(stripJsonFence(text));
    const draft = validateUnderstanding(parsed);
    if (!draft) return { draft: needsHelpDraft(args.fallbackText), visualFailed: true };
    return { draft, visualFailed: false };
  } catch (err) {
    console.warn("[understanding] vision call failed, falling to help gate:", err);
    return { draft: needsHelpDraft(args.fallbackText), visualFailed: true };
  }
}
