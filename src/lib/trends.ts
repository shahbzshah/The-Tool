/**
 * Trend fetching from free public APIs (no auth needed).
 * Used to inject real-world context into idea generation prompts.
 * All fetches fail soft — trends are a bonus, not a requirement.
 */

export type Trend = {
  source: "hackernews" | "reddit";
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

export async function getTrends(): Promise<Trend[]> {
  const [hn, reddit] = await Promise.allSettled([
    getHackerNewsTrends(),
    getRedditTrends(),
  ]);

  const trends: Trend[] = [];
  if (hn.status === "fulfilled") trends.push(...hn.value);
  if (reddit.status === "fulfilled") trends.push(...reddit.value);
  return trends;
}

export function formatTrendsForPrompt(trends: Trend[]): string {
  if (trends.length === 0) {
    return "No live trend data available — rely on your knowledge of current market gaps.";
  }
  const lines = trends.map((t) => `- [${t.source}] ${t.title}`);
  return `Here are currently trending topics (live data):\n${lines.join("\n")}\nUse these as inspiration for what people want right now — but don't force every idea to match a trend.`;
}
