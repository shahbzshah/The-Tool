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
      offersIAP: d.offersIAP ?? null,
      IAPRange: d.IAPRange ?? null,
      adSupported: d.adSupported ?? null,
      price: d.price ?? null,
      priceText: d.priceText ?? null,
      description: typeof d.description === "string" ? d.description : null,
      released: d.released ?? null,
      version: d.version ?? null,
    };
  } catch (err) {
    console.warn(`detail fetch failed for ${appId}:`, err);
    return null;
  }
}

/** One written review, stripped of everything personal. userName is never
 * stored or displayed anywhere in the app (Play ToS: no harvesting of
 * account names). */
export interface PlayReview {
  id: string;
  date: string;
  score: number;
  text: string;
  version: string | null;
  thumbsUp: number;
  replyText: string | null;
}

/** Fetch newest reviews for one app. Capped, best-effort: returns [] on
 * any failure (including 429) — callers must degrade to cached data, never
 * retry aggressively through a block. */
export async function fetchReviews(
  appId: string,
  num = 100
): Promise<PlayReview[]> {
  try {
    const res: any = await gplay.reviews({
      appId,
      sort: (gplay as any).sort?.NEWEST ?? 2,
      num: Math.min(num, 200),
      lang: LANG,
      country: COUNTRY,
    });
    const data: any[] = Array.isArray(res?.data) ? res.data : [];
    return data
      .filter((r) => typeof r?.text === "string" && r.text.trim())
      .map((r) => ({
        id: String(r.id ?? ""),
        date: String(r.date ?? ""),
        score: Number(r.score ?? 0),
        text: String(r.text),
        version: r.version ? String(r.version) : null,
        thumbsUp: Number(r.thumbsUp ?? 0),
        replyText: r.replyText ? String(r.replyText) : null,
      }));
  } catch (err) {
    // 429/blocks included: log once, degrade, never hammer.
    console.warn(`reviews fetch failed for ${appId}:`, err);
    return [];
  }
}

/**
 * Best-effort category top-free chart: returns a map appId -> 1-based rank
 * for apps found in the chart, or null when the chart can't be fetched.
 * One call per category per scan at most; callers cache the result.
 */
export async function fetchCategoryRanks(
  genreId: string | null | undefined,
  num = 200
): Promise<Map<string, number> | null> {
  if (!genreId) return null;
  try {
    const list: any = await gplay.list({
      collection: (gplay as any).collection?.TOP_FREE ?? "TOP_FREE",
      // genreId values ("PRODUCTIVITY", ...) are the lib's category enum
      // members; cast because the lib types the field as its enum.
      category: genreId as any,
      num: Math.min(num, 500),
      lang: LANG,
      country: COUNTRY,
    });
    const ranks = new Map<string, number>();
    (Array.isArray(list) ? list : []).forEach((item: any, i: number) => {
      if (item?.appId) ranks.set(String(item.appId), i + 1);
    });
    return ranks;
  } catch (err) {
    console.warn(`category chart fetch failed for ${genreId}:`, err);
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
  const ids = results.slice(0, maxDetails).map((r) => r.appId);
  // Bounded-parallel detail fetching (concurrency 5) instead of sequential
  // with 800ms sleeps — cuts ~16s of pure delay per keyword.
  const enriched: AppDetail[] = [];
  const CONCURRENCY = 5;
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const details = await Promise.all(batch.map((id) => appDetails(id)));
    for (const d of details) {
      if (d && !isGame(d)) enriched.push(d);
    }
    // Small pause between waves to stay polite to Google.
    if (i + CONCURRENCY < ids.length) await sleep(400);
  }
  return enriched;
}
