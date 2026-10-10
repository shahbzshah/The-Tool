/**
 * Play Store scraping layer.
 *
 * Thin, polite wrapper around the `google-play-scraper` npm package
 * (same library as the Python service used). Every network call goes
 * through here so rate-limiting and retries live in one place.
 *
 * Ported from the Opportunity Hunter Python service (scraper.py).
 */

import gplay from "google-play-scraper";
import type { AppDetail } from "./scoring";

// Be polite to Google: pause between detail fetches.
const DETAIL_DELAY_MS = 800;
const LANG = "en";
const COUNTRY = "us";

function parseInstalls(raw: unknown): number {
  // '5,000,000+' -> 5000000. Unknown -> 0.
  if (!raw) return 0;
  const n = parseInt(String(raw).replace(/,/g, "").replace(/\+/g, "").trim(), 10);
  return Number.isNaN(n) ? 0 : n;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Keyword search. Returns raw result dicts (appId, title, score...). */
export async function searchApps(keyword: string, nHits = 30): Promise<any[]> {
  try {
    return await gplay.search({
      term: keyword,
      num: nHits,
      lang: LANG,
      country: COUNTRY,
    });
  } catch (err) {
    console.warn(`search failed for ${JSON.stringify(keyword)}:`, err);
    return [];
  }
}

/** Full detail dict for one app, or null on failure. */
export async function appDetails(appId: string): Promise<AppDetail | null> {
  try {
    const d: any = await gplay.app({ appId, lang: LANG, country: COUNTRY });
    return {
      appId: d.appId,
      title: d.title,
      score: d.score,
      reviews: d.reviews,
      updated: d.updated,
      installs: d.installs,
      installs_num: parseInstalls(d.installs),
      genre: d.genre,
      genreId: d.genreId,
    };
  } catch (err) {
    console.warn(`detail fetch failed for ${appId}:`, err);
    return null;
  }
}

function isGame(detail: AppDetail): boolean {
  // genreId like GAME_ACTION — we only deal with apps, never games.
  return String(detail.genreId ?? "").toUpperCase().startsWith("GAME_");
}

/**
 * Search a keyword and enrich the top results with full details.
 * Detail fetching is the slow part, so it is capped at maxDetails.
 * Games are skipped.
 */
export async function scanKeyword(
  keyword: string,
  nHits = 30,
  maxDetails = 20
): Promise<AppDetail[]> {
  const results = await searchApps(keyword, nHits);
  const enriched: AppDetail[] = [];
  for (const r of results.slice(0, maxDetails)) {
    const d = await appDetails(r.appId);
    if (d && !isGame(d)) enriched.push(d);
    await sleep(DETAIL_DELAY_MS);
  }
  return enriched;
}
