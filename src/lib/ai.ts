/**
 * AI adapter — NVIDIA Build only (OpenAI-compatible chat completions API).
 */

const BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_MODEL = "meta/llama-3.2-11b-vision-instruct";

/** API key: env var first, then encrypted DB setting (see lib/settings). */
async function apiKey(): Promise<string> {
  const { getSetting } = await import("@/lib/settings");
  const key = await getSetting("NVIDIA_API_KEY");
  if (!key) {
    throw new AIConfigError(
      "NVIDIA_API_KEY is not set. Add it in Settings or as an env var."
    );
  }
  return key;
}

/** Model: env var first, then DB setting, then default. */
export async function getModel(): Promise<string> {
  const { getSetting } = await import("@/lib/settings");
  return (await getSetting("NVIDIA_MODEL")) || DEFAULT_MODEL;
}

/**
 * Vision model for the upload front door (plan §4): the VISION_MODEL
 * override when set, otherwise the same model the analysis already uses.
 * Switching models is a Settings change, never a code change.
 */
export async function getVisionModel(): Promise<string> {
  const { getSetting } = await import("@/lib/settings");
  return (await getSetting("VISION_MODEL")) || (await getModel());
}

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  // String for text-only calls (existing behaviour); parts for vision
  // calls, where image parts carry data-URL frames.
  content: string | ChatContentPart[];
};

export class AIConfigError extends Error {}

/**
 * Turn a chat() failure into a short, user-facing diagnosis. The NVIDIA
 * error carries its HTTP status ("nvidia API error 401: ..."), which is
 * the difference between a rejected key and a dead model — the two things
 * the user can actually fix in Settings. Returns a plain message, never
 * the raw upstream body.
 */
export function aiErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (msg.includes("NVIDIA_API_KEY is not set")) {
    return "No NVIDIA API key is set. Add one in Settings → NVIDIA API Key.";
  }
  const m = msg.match(/nvidia API error (\d+)/);
  if (m) {
    const status = m[1];
    if (status === "401")
      return "NVIDIA rejected the API key (401). The key in Settings is wrong or revoked — paste a fresh key from build.nvidia.com.";
    if (status === "404") {
      // Name the model the server actually tried: it tells us whether the
      // Settings save is being ignored (still the dead default) or the
      // account itself lacks the model.
      const tried = msg.match(/\(model ([^)]+)\)/)?.[1];
      if (tried === "minimax-m3.1-flash")
        return "NVIDIA doesn't offer 'minimax-m3.1-flash' on this API key (404). Try another model in Settings, e.g. meta/llama-3.1-8b-instruct.";
      return `NVIDIA doesn't have that model (404 — tried '${tried ?? "unknown"}'). The model in Settings is dead — set NVIDIA Model to minimax-m3.1-flash.`;
    }
    if (status === "429")
      return "NVIDIA rate limit (429). Wait a minute and try again.";
    return `NVIDIA returned an error (${status}). Try again, and check the key and model in Settings if it keeps failing.`;
  }
  return "The AI is unavailable right now — the AI service is down. Check the NVIDIA API key in Settings.";
}

export async function chat(
  messages: ChatMessage[],
  opts: {
    temperature?: number;
    maxTokens?: number;
    /** Override the model for this call (vision calls use getVisionModel). */
    model?: string;
    /** Abort timeout in ms (vision calls use a 20s cap per plan §4). */
    timeoutMs?: number;
  } = {}
): Promise<string> {
  const key = await apiKey();
  const mdl = opts.model ?? (await getModel());

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: mdl,
      messages,
      temperature: opts.temperature ?? 1.0,
      max_tokens: opts.maxTokens ?? 2000,
      stream: false,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `nvidia API error ${res.status} (model ${mdl}): ${body.slice(0, 500) || res.statusText}`
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
 * Streaming chat helper — yields content tokens as they arrive (SSE).
 */
export async function* chatStream(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {}
): AsyncGenerator<string> {
  const key = await apiKey();
  const mdl = await getModel();

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: mdl,
      messages,
      temperature: opts.temperature ?? 1.0,
      max_tokens: opts.maxTokens ?? 2000,
      stream: true,
    }),
    signal: AbortSignal.timeout(300_000),
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `nvidia API error ${res.status}: ${body.slice(0, 500) || res.statusText}`
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const token = json?.choices?.[0]?.delta?.content;
        if (typeof token === "string" && token) yield token;
      } catch {
        // skip malformed SSE lines
      }
    }
  }
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
