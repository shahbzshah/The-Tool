/**
 * Deterministic review mining (plan item 3, 7). No LLM is involved in the
 * counts: 1–3★ reviews are coded against a FIXED theme codebook, reviews
 * (not mentions) are counted, themes rank by count × severity, and every
 * displayed quote is a sentence taken from a fetched review and
 * substring-verified in code before it ever reaches the UI. A quote that
 * fails verification is dropped, not shown.
 *
 * Privacy: reviewer names are never stored, never displayed, never sent
 * to the LLM. The packet carries review IDs + text only as needed for
 * verification.
 */

import type { PlayReview } from "./scraper";

/** Fixed codebook — frozen so themes are comparable across opportunities. */
export interface ThemeDef {
  key: string;
  label: string;
  /** 3 = blocks work / churn, 2 = recurring friction, 1 = minor. */
  severity: 1 | 2 | 3;
  patterns: RegExp[];
}

export const THEME_CODEBOOK: ThemeDef[] = [
  { key: "bugs_crashes", label: "Bugs & crashes", severity: 3, patterns: [/\bcrash(es|ing)?\b/i, /\bbug(gy|s)?\b/i, /\bglitch/i, /\bfreez(e|es|ing|en)\b/i, /\bbroken\b/i, /\bforce ?clos(e|es|ing)\b/i, /\berror\b/i] },
  { key: "sync_data_loss", label: "Sync & data loss", severity: 3, patterns: [/\bsync/i, /\blost (my )?data\b/i, /\bdata loss\b/i, /\bdeleted\b/i, /\bdisappeared\b/i, /\bbackup\b/i, /\brestore\b/i] },
  { key: "pricing", label: "Pricing", severity: 2, patterns: [/\bexpensive\b/i, /\boverpriced\b/i, /\bpaywall\b/i, /\btoo much money\b/i, /\brip ?off\b/i, /\bprice\b/i, /\bpricing\b/i, /\bsubscription cost\b/i] },
  { key: "performance", label: "Performance & battery", severity: 2, patterns: [/\bslow\b/i, /\blag(gy|ging)?\b/i, /\bloading\b/i, /\bbattery\b/i, /\bdrain/i, /\boverheat/i, /\bmemory\b/i] },
  { key: "ads", label: "Ads", severity: 2, patterns: [/\btoo many ads\b/i, /\bad every\b/i, /\bpop-?up ads?\b/i, /\badvertisements?\b/i, /\bads\b/i] },
  { key: "missing_feature", label: "Missing feature", severity: 2, patterns: [/\bmissing\b/i, /\bdoesn'?t have\b/i, /\bdoes not have\b/i, /\blacks?\b/i, /\bwish it had\b/i, /\bneed(s)? (a )?feature\b/i, /\bcan'?t do\b/i, /\bcannot\b/i] },
  { key: "offline", label: "No offline mode", severity: 2, patterns: [/\boffline\b/i, /\bno internet\b/i, /\bwithout internet\b/i, /\bairplane mode\b/i] },
  { key: "support", label: "Support unresponsive", severity: 2, patterns: [/\bsupport\b/i, /\bcustomer service\b/i, /\bno response\b/i, /\bnever repl/i, /\bignored\b/i, /\bunhelpful/i] },
  { key: "privacy", label: "Privacy & data use", severity: 2, patterns: [/\bprivacy\b/i, /\btracking\b/i, /\bpermissions\b/i, /\bspy/i, /\bpersonal data\b/i, /\bsells (my )?data\b/i] },
  { key: "updates_regressions", label: "Update made it worse", severity: 2, patterns: [/\bupdate\b/i, /\bused to be\b/i, /\bwas better\b/i, /\bruined\b/i, /\bworse after\b/i, /\bdowngrade\b/i, /\bnew version\b/i] },
  { key: "ux_navigation", label: "Confusing UX", severity: 1, patterns: [/\bconfusing\b/i, /\bhard to use\b/i, /\bdifficult to (use|navigate)\b/i, /\bcomplicated\b/i, /\bcluttered\b/i, /\bunintuitive\b/i, /\bbad design\b/i] },
  { key: "onboarding", label: "Login / onboarding", severity: 1, patterns: [/\bsign ?up\b/i, /\blog ?in\b/i, /\baccount\b/i, /\bregistr/i, /\bcan'?t log/i, /\bonboarding\b/i] },
];

export interface VerifiedQuote {
  text: string;
  appTitle: string;
  appId: string;
  stars: number;
  date: string;
}

export interface ThemeResult {
  key: string;
  label: string;
  severity: 1 | 2 | 3;
  /** Reviews coded to this theme (reviews, not mentions). */
  reviewCount: number;
  /** reviewCount × severity — the ranking key. */
  weighted: number;
  /** Total thumbs-up across coded reviews (secondary ranking signal). */
  thumbsUp: number;
  quotes: VerifiedQuote[];
}

export interface ReviewMining {
  /** Reviews fetched (all stars, newest first). */
  fetched: number;
  /** 1–3★ reviews among them. */
  lowStar: number;
  /** Date range of fetched reviews (ISO) or null. */
  dateFrom: string | null;
  dateTo: string | null;
  /** App titles covered. */
  appsCovered: string[];
  /** Themes ranked by weighted score, top first. */
  themes: ThemeResult[];
  /** Mean stars of the newest ~100 reviews (all stars). */
  recentAvg: number | null;
  /** Lifetime Play score of the opportunity app (for the delta). */
  lifetimeScore: number | null;
  /** recentAvg − lifetimeScore (negative = deteriorating). */
  recentDelta: number | null;
  /** Developer reply rate across sampled reviews (0–1) or null. */
  developerReplyRate: number | null;
  /** Version-break flag, e.g. "Complaint spike after v2.4.1". */
  versionBreak: string | null;
}

export function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Code-verified quote check: the quote must appear verbatim (modulo
 * whitespace/case) inside a fetched review. Used for packet quotes AND
 * for anything the LLM returns — failures are dropped before display.
 */
export function verifyQuote(
  quote: string,
  reviews: { text: string }[]
): boolean {
  const q = normalizeText(quote);
  if (q.length < 10) return false;
  return reviews.some((r) => normalizeText(r.text).includes(q));
}

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    // Short punchy complaints ("Too many ads.") are real quotes too —
    // the floor is 10 chars, the same bar as quote verification.
    .filter((s) => s.length >= 10 && s.length <= 280);
}

function reviewMatchesTheme(text: string, theme: ThemeDef): boolean {
  return theme.patterns.some((p) => p.test(text));
}

/**
 * Mine reviews deterministically. `reviewsByApp` maps app title -> its
 * newest reviews; the first entry should be the opportunity app itself
 * (used for recentAvg / version-break), the rest are competitors.
 */
export function mineReviews(
  reviewsByApp: { appId: string; title: string; reviews: PlayReview[] }[],
  lifetimeScore: number | null
): ReviewMining {
  const all: (PlayReview & { appTitle: string; appId: string })[] = [];
  for (const a of reviewsByApp) {
    for (const r of a.reviews) {
      all.push({ ...r, appTitle: a.title, appId: a.appId });
    }
  }
  const low = all.filter((r) => r.score >= 1 && r.score <= 3);

  // Recent-vs-lifetime: newest ~100 reviews of the opportunity app itself
  // (first entry), all stars, newest first as fetched.
  let recentAvg: number | null = null;
  let recentDelta: number | null = null;
  const selfReviews = reviewsByApp[0]?.reviews ?? [];
  if (selfReviews.length >= 10) {
    const sample = selfReviews.slice(0, 100);
    recentAvg =
      sample.reduce((sum, r) => sum + r.score, 0) / sample.length;
    if (lifetimeScore != null) {
      recentDelta = Math.round((recentAvg - lifetimeScore) * 100) / 100;
    }
  }

  // Developer reply rate across the whole sample.
  const withReply = all.filter((r) => r.replyText).length;
  const developerReplyRate =
    all.length > 0 ? Math.round((withReply / all.length) * 100) / 100 : null;

  // Version-break: group low-star reviews by app version (opportunity app
  // only); flag when a version's complaint count is 2x the previous
  // version's and at least 5 reviews.
  let versionBreak: string | null = null;
  const byVersion = new Map<string, number>();
  for (const r of selfReviews) {
    if (r.score >= 1 && r.score <= 3 && r.version) {
      byVersion.set(r.version, (byVersion.get(r.version) ?? 0) + 1);
    }
  }
  if (byVersion.size >= 2) {
    const versions = [...byVersion.entries()];
    for (let i = 1; i < versions.length; i++) {
      const [ver, count] = versions[i];
      const [, prev] = versions[i - 1];
      if (count >= 5 && prev > 0 && count >= prev * 2) {
        versionBreak = `Complaint spike after ${ver} (${count} low-star reviews vs ${prev} before)`;
        break;
      }
    }
  }

  // Themes: count REVIEWS, not mentions — one review = one count per theme.
  const themes: ThemeResult[] = [];
  for (const theme of THEME_CODEBOOK) {
    const coded = low.filter((r) => reviewMatchesTheme(r.text, theme));
    if (coded.length === 0) continue;
    // Representative quotes: sentences containing a theme keyword, best
    // (most thumbs-up) first, from different reviews, max 2 per theme.
    const quotes: VerifiedQuote[] = [];
    const seenReviews = new Set<string>();
    const sorted = [...coded].sort((a, b) => b.thumbsUp - a.thumbsUp);
    for (const r of sorted) {
      if (quotes.length >= 2) break;
      if (seenReviews.has(r.id)) continue;
      const hit = sentencesOf(r.text).find((s) =>
        theme.patterns.some((p) => p.test(s))
      );
      if (!hit) continue;
      // The sentence came from the review text, so it verifies by
      // construction — still run the check; drop on any failure.
      if (!verifyQuote(hit, [r])) continue;
      seenReviews.add(r.id);
      quotes.push({
        text: hit,
        appTitle: r.appTitle,
        appId: r.appId,
        stars: r.score,
        date: r.date,
      });
    }
    themes.push({
      key: theme.key,
      label: theme.label,
      severity: theme.severity,
      reviewCount: coded.length,
      weighted: coded.length * theme.severity,
      thumbsUp: coded.reduce((sum, r) => sum + r.thumbsUp, 0),
      quotes,
    });
  }
  themes.sort((a, b) => b.weighted - a.weighted || b.reviewCount - a.reviewCount);

  const dates = all
    .map((r) => new Date(r.date).getTime())
    .filter((t) => Number.isFinite(t));
  return {
    fetched: all.length,
    lowStar: low.length,
    dateFrom: dates.length ? new Date(Math.min(...dates)).toISOString().slice(0, 10) : null,
    dateTo: dates.length ? new Date(Math.max(...dates)).toISOString().slice(0, 10) : null,
    appsCovered: reviewsByApp.map((a) => a.title),
    themes,
    recentAvg: recentAvg != null ? Math.round(recentAvg * 100) / 100 : null,
    lifetimeScore,
    recentDelta,
    developerReplyRate,
    versionBreak,
  };
}
