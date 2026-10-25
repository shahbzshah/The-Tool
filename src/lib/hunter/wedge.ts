/**
 * Top-10 keyword wedge audit (plan item 4). Pure arithmetic over one
 * search call's results — the same call the scan already makes.
 *
 * A wedge answers "can a NEW app enter this keyword?", which no single
 * app's gap score can: a weak top 10 (few title matches, low-rated or
 * small incumbents, a small app already ranking top 5) is an opening even
 * when every individual app looks strong.
 */

export interface WedgePeer {
  appId: string;
  title: string;
  rating: number | null;
  reviewsCount: number | null;
  installsMin: number | null;
}

export interface WedgeAudit {
  keyword: string;
  peersConsidered: number;
  medianRatings: number | null;
  maxRatings: number | null;
  titleMatchCount: number;
  below42Count: number;
  smallAppInTop5: boolean;
  branded: boolean;
  /** 0-100 wedge strength (higher = easier to enter). */
  wedgeScore: number;
  /** Best long-tail wedge keywords to scan next (theme-derived, see
   * evidence.ts). These are suggestions, not audited keywords — the UI
   * must not present them as measured. */
  suggestedWedges: string[];
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Keyword tokens that matter: lowercase words, 3+ chars, no stopwords. */
export function keywordTokens(keyword: string): string[] {
  const stop = new Set([
    "the", "and", "for", "app", "apps", "free", "best", "top", "new",
  ]);
  return keyword
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !stop.has(t));
}

function titleMatches(title: string, tokens: string[]): boolean {
  const t = title.toLowerCase();
  return tokens.length > 0 && tokens.every((tok) => t.includes(tok));
}

export function auditWedge(
  keyword: string,
  peersIn: WedgePeer[],
  suggestedWedges: string[] = []
): WedgeAudit {
  const peers = peersIn.slice(0, 10);
  const tokens = keywordTokens(keyword);
  const ratings = peers
    .map((p) => p.reviewsCount)
    .filter((n): n is number => n != null && n > 0);
  const medianRatings = median(ratings);
  const maxRatings = ratings.length ? Math.max(...ratings) : null;

  const titleMatchCount = peers.filter((p) =>
    titleMatches(p.title, tokens)
  ).length;
  const below42Count = peers.filter(
    (p) => p.rating != null && p.rating < 4.2
  ).length;
  const smallAppInTop5 = peers.slice(0, 5).some((p) => {
    const reviews = p.reviewsCount ?? Infinity;
    const installs = p.installsMin ?? Infinity;
    return reviews < 10_000 || installs < 100_000;
  });
  // Branded: the keyword belongs to one brand, not to a category a new
  // app can enter. Two shapes: a single-token keyword matching a dominant
  // app's title ("notion", "spotify"), or a keyword that IS an app's title
  // (ignoring case/punctuation) with that app dominating the niche. A
  // generic multi-word category phrase ("habit tracker") matching a longer
  // title ("Habit Tracker Pro") is NOT branded — that is just a category
  // name doing its job.
  const normKw = keyword.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const branded =
    titleMatchCount >= 1 &&
    peers.some((p) => {
      const dominates =
        medianRatings != null && (p.reviewsCount ?? 0) > medianRatings * 5;
      if (!dominates || !titleMatches(p.title, tokens)) return false;
      const normTitle = p.title.toLowerCase().replace(/[^a-z0-9]+/g, "");
      return tokens.length === 1 || normTitle === normKw;
    });

  let wedgeScore = 0;
  if (titleMatchCount <= 1) wedgeScore += 30;
  else if (titleMatchCount <= 3) wedgeScore += 15;
  if (smallAppInTop5) wedgeScore += 25;
  if (below42Count >= 3) wedgeScore += 20;
  else if (below42Count >= 1) wedgeScore += 10;
  if (medianRatings != null && medianRatings < 10_000) wedgeScore += 15;
  if (branded) wedgeScore -= 25;
  wedgeScore = Math.max(0, Math.min(100, wedgeScore));

  return {
    keyword,
    peersConsidered: peers.length,
    medianRatings,
    maxRatings,
    titleMatchCount,
    below42Count,
    smallAppInTop5,
    branded,
    wedgeScore,
    suggestedWedges,
  };
}
