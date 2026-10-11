/**
 * AI adapter — NVIDIA Build only (OpenAI-compatible chat completions API).
 */

const BASE_URL = "https://integrate.api.nvidia.com/v1";
const MODEL =
  process.env.NVIDIA_MODEL || "meta/llama-3.2-11b-vision-instruct";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export class AIConfigError extends Error {}

export async function chat(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new AIConfigError(
      "NVIDIA_API_KEY is not set. Add your key to .env.local."
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
      `nvidia API error ${res.status}: ${body.slice(0, 500) || res.statusText}`
    );
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("nvidia API returned an empty response.");
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

  try {
    return JSON.parse(text) as T;
  } catch {
    // Model output may be malformed (trailing commas) or truncated
    // mid-JSON (hit max_tokens). Sanitize, then repair.
    console.error(
      "[ai] JSON parse failed — raw model output:\n",
      text.slice(0, 2000)
    );
    const sanitized = text.replace(/,\s*([}\]])/g, "$1");
    const repaired = repairTruncatedJson(sanitized);
    return JSON.parse(repaired) as T;
  }
}

/**
 * Best-effort repair of JSON truncated mid-stream: tracks string state and
 * brace/bracket nesting, then closes everything in reverse order. Drops a
 * trailing incomplete value (e.g. a half-written object) first.
 */
function repairTruncatedJson(text: string): string {
  // Drop a trailing incomplete segment after the last complete top-level element
  let cut = text;
  const lastComplete = Math.max(
    cut.lastIndexOf("},"),
    cut.lastIndexOf("}, ") > -1 ? cut.lastIndexOf("}, ") : -1,
    cut.lastIndexOf("}\n"),
    cut.lastIndexOf("}")
  );
  if (cut.trimEnd().endsWith(",")) {
    cut = cut.trimEnd().slice(0, -1);
  } else if (lastComplete > -1 && !cut.slice(0, lastComplete + 1).includes("]")) {
    // keep as-is; the closing logic below handles the rest
  }

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of cut) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      if (inString) escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }

  let repaired = cut.trimEnd();
  if (repaired.endsWith(",")) repaired = repaired.slice(0, -1);
  if (inString) repaired += '"';
  while (stack.length > 0) {
    repaired += stack.pop() === "{" ? "}" : "]";
  }
  return repaired;
}
