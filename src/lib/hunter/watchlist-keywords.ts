import { getSetting } from "@/lib/settings";

/**
 * Watchlist keywords: the seed terms the daily automatic watchlist scans.
 *
 * Custom keywords are stored as a JSON array string in the AppSetting
 * "WATCHLIST_KEYWORDS" (plain JSON via getSetting/setSetting — not an
 * encrypted admin key in SETTING_DEFS, just a user-editable list).
 * When nothing custom is saved, the hardcoded default set is used.
 */

export const DEFAULT_WATCHLIST_KEYWORDS = [
  "habit tracker",
  "to-do list",
  "pomodoro timer",
  "budget tracker",
  "workout planner",
  "meal planner",
  "sleep tracker",
  "meditation",
  "note taking",
  "water reminder",
  "language learning",
  "expense tracker",
];

/** The effective keyword list: custom setting if set, else the defaults. */
export async function loadWatchlistKeywords(): Promise<string[]> {
  try {
    const raw = await getSetting("WATCHLIST_KEYWORDS");
    if (!raw) return DEFAULT_WATCHLIST_KEYWORDS;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_WATCHLIST_KEYWORDS;
    const cleaned = parsed
      .filter((k): k is string => typeof k === "string")
      .map((k) => k.trim())
      .filter(Boolean);
    return cleaned.length > 0 ? cleaned : DEFAULT_WATCHLIST_KEYWORDS;
  } catch {
    return DEFAULT_WATCHLIST_KEYWORDS;
  }
}
