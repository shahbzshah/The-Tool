/**
 * Trend and idea sources: Hacker News app-idea stories.
 *
 * Ideas are pulled live (no API keys needed) and returned as plain objects:
 *   { title, source, hotness, url, text }
 * Callers cache the combined feed; these functions stay stateless.
 *
 * Ported from the Opportunity Hunter Python service (trends.py).
 * HN via Algolia is the primary source (fast, reliable).
 */

export interface TrendIdea {
  title: string;
  source: string;
  hotness: number;
  url: string;
  text: string;
}

const HN_QUERIES = ["app idea", "mobile app idea", "side project app"];
const REQUEST_TIMEOUT_MS = 20000;
// Only fetch stories from the last 7 days so the radar shows what's
// trending now, not evergreen archive posts.
const RECENT_DAYS = 7;

async function fetchWithTimeout(url: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(`${url}?${qs}`, { signal: controller.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

/** App-idea stories from Hacker News via the Algolia API (fast, reliable). */
export async function hackernewsIdeas(limitPerQuery = 8): Promise<TrendIdea[]> {
  const ideas: TrendIdea[] = [];
  const seen = new Set<string>();
  for (const query of HN_QUERIES) {
    try {
      const weekAgo = Math.floor(Date.now() / 1000) - RECENT_DAYS * 86400;
      const data = await fetchWithTimeout("https://hn.algolia.com/api/v1/search", {
        query,
        tags: "story",
        hitsPerPage: String(limitPerQuery),
        numericFilters: `created_at_i>${weekAgo}`,
      });
      for (const h of data.hits ?? []) {
        const title = String(h.title ?? "").trim();
        const oid = String(h.objectID ?? "");
        if (!title || seen.has(oid)) continue;
        seen.add(oid);
        ideas.push({
          title,
          source: "Hacker News",
          hotness: Number(h.points ?? 0),
          url: `https://news.ycombinator.com/item?id=${oid}`,
          text: "",
        });
      }
    } catch (err) {
      console.warn(`hacker news fetch failed for ${JSON.stringify(query)}:`, err);
    }
  }
  ideas.sort((a, b) => b.hotness - a.hotness);
  return ideas;
}

/** Combined live feed — currently HN only (fastest, most reliable). */
export async function ideasFeed(): Promise<TrendIdea[]> {
  return hackernewsIdeas();
}
