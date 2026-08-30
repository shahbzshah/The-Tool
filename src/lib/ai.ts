/**
 * Provider-agnostic AI adapter.
 * Currently wired to DeepSeek (OpenAI-compatible chat completions API).
 * To switch providers later, only this file needs to change.
 */

const BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export class AIConfigError extends Error {}

export async function chat(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || apiKey === "paste-your-key-here") {
    throw new AIConfigError(
      "DEEPSEEK_API_KEY is not set. Add your key to .env.local (get one at https://platform.deepseek.com)."
    );
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: opts.temperature ?? 1.0,
      max_tokens: opts.maxTokens ?? 2000,
      stream: false,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `DeepSeek API error ${res.status}: ${body.slice(0, 500) || res.statusText}`
    );
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("DeepSeek API returned an empty response.");
  }
  return content;
}

/**
 * Chat helper that expects the model to return JSON.
 * Tolerates markdown code fences and stray prose around the JSON.
 */
export async function chatJson<T>(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<T> {
  const raw = await chat(messages, opts);
  return parseJsonLoose<T>(raw);
}

export function parseJsonLoose<T>(raw: string): T {
  // Strip markdown code fences like ```json ... ```
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let text = fence ? fence[1] : raw;

  // Trim to the outermost JSON object/array if there's stray prose
  const firstObj = text.indexOf("{");
  const firstArr = text.indexOf("[");
  const start =
    firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)
      ? firstArr
      : firstObj;
  if (start > 0) text = text.slice(start);
  const lastObj = text.lastIndexOf("}");
  const lastArr = text.lastIndexOf("]");
  const end = Math.max(lastObj, lastArr);
  if (end !== -1) text = text.slice(0, end + 1);

  return JSON.parse(text) as T;
}
