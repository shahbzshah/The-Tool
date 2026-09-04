/**
 * Trend fetching from free public APIs (no auth needed).
 * Used to inject real-world context into idea generation prompts.
 * All fetches fail soft — trends are a bonus, not a requirement.
 */

export type Trend = {
  source: "hackernews" | "reddit" | "lobsters" | "showhn";
  title: string;
  url?: string;
};

async function fetchWithTimeout(url: string, ms = 6000): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": "ideas-app/0.1 (trend fetcher)" },
    signal: AbortSignal.timeout(ms),
  });
}

async function getHackerNewsTrends(limit = 8): Promise<Trend[]> {
  const res = await fetchWithTimeout(
    "https://hacker-news.firebaseio.com/v0/topstories.json"
  );
  const ids = (await res.json()) as number[];
  const slices = ids.slice(0, limit);

  const items = await Promise.all(
    slices.map(async (id) => {
      const r = await fetchWithTimeout(
        `https://hacker-news.firebaseio.com/v0/item/${id}.json`
      );
      return r.json();
    })
  );

  return items
    .filter(
      (i): i is { title: string; url?: string } =>
        !!i && typeof i.title === "string"
    )
    .map((i) => ({ source: "hackernews" as const, title: i.title, url: i.url }));
}

type RedditChild = { data: { title: string; url?: string; stickied?: boolean } };

async function getRedditTrends(limit = 8): Promise<Trend[]> {
  const subreddits = ["AppIdeas", "SomebodyMakeThis"];
  const results = await Promise.all(
    subreddits.map(async (sub) => {
      const res = await fetchWithTimeout(
        `https://www.reddit.com/r/${sub}/hot.json?limit=${limit}`
      );
      const json = await res.json();
      const children = (json?.data?.children ?? []) as RedditChild[];
      return children
        .filter((c) => c?.data?.title && !c.data.stickied)
        .map((c) => ({
          source: "reddit" as const,
          title: c.data.title,
          url: c.data.url,
        }));
    })
  );
  return results.flat();
}

type LobstersItem = { score?: number; title?: string; url?: string };

async function getLobstersTrends(limit = 6): Promise<Trend[]> {
  const res = await fetchWithTimeout("https://lobste.rs/hottest.json");
  const json = (await res.json()) as LobstersItem[];
  return json
    .filter((i) => !!i && typeof i.title === "string")
    .slice(0, limit)
    .map((i) => ({ source: "lobsters" as const, title: i.title!, url: i.url }));
}

/**
 * Recent "Show HN" launches (last 7 days, ranked by points) via the free
 * HN Algolia API — captures what people are actually building & shipping now.
 */
async function getShowHNTrends(limit = 6): Promise<Trend[]> {
  const weekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  const res = await fetchWithTimeout(
    `https://hn.algolia.com/api/v1/search?tags=show_hn&hitsPerPage=${limit}&numericFilters=created_at_i>${weekAgo}`
  );
  const json = (await res.json()) as {
    hits?: { title?: string; url?: string }[];
  };
  return (json.hits ?? [])
    .filter((h) => typeof h.title === "string")
    .map((h) => ({
      source: "showhn" as const,
      title: h.title!,
      url: h.url,
    }));
}

export async function getTrends(): Promise<Trend[]> {
  const [hn, reddit, lobsters, showhn] = await Promise.allSettled([
    getHackerNewsTrends(),
    getRedditTrends(),
    getLobstersTrends(),
    getShowHNTrends(),
  ]);

  const trends: Trend[] = [];
  if (hn.status === "fulfilled") trends.push(...hn.value);
  if (reddit.status === "fulfilled") trends.push(...reddit.value);
  if (lobsters.status === "fulfilled") trends.push(...lobsters.value);
  if (showhn.status === "fulfilled") trends.push(...showhn.value);
  return trends;
}

export function formatTrendsForPrompt(trends: Trend[]): string {
  if (trends.length === 0) {
    return "No live trend data available — rely on your knowledge of current market gaps.";
  }
  const lines = trends.map((t) => `- [${t.source}] ${t.title}`);
  return `Here are currently trending topics (live data):\n${lines.join("\n")}\nUse these as inspiration for what people want right now — but don't force every idea to match a trend.`;
}

/**
 * Trend cache — trends change slowly, and generation shouldn't pay ~6s of
 * upstream fetches on every request. 30-minute in-memory TTL.
 */
const TREND_CACHE_TTL_MS = 30 * 60 * 1000;
let trendCache: { at: number; trends: Trend[] } | null = null;

export async function getCachedTrends(): Promise<Trend[]> {
  if (trendCache && Date.now() - trendCache.at < TREND_CACHE_TTL_MS) {
    return trendCache.trends;
  }
  const trends = await getTrends();
  trendCache = { at: Date.now(), trends };
  return trends;
}

/**
 * Fetch a user-supplied inspiration source. Accepts a URL (fetches and
 * extracts readable text) or plain text (used as-is, truncated).
 * Fails soft — returns null if a URL can't be fetched.
 */
export async function fetchCustomSource(
  input: string
): Promise<string | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const isUrl = /^https?:\/\/\S+$/i.test(trimmed);
  if (!isUrl) {
    return trimmed.slice(0, 1500);
  }

  try {
    const res = await fetchWithTimeout(trimmed, 8000);
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return JSON.stringify(await res.json()).slice(0, 1500);
    }
    const html = await res.text();
    // Strip scripts/styles/tags and collapse whitespace for a readable digest
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 1500);
  } catch {
    return null;
  }
}
