/**
 * Range estimates (plan item 9). Every download figure is a RANGE built
 * from rating velocity × a stated category prior — never a point
 * estimate, never a revenue figure.
 *
 * Priors are downloads-per-new-rating (DPR) ranges from the public
 * review-rate literature summarised in the plan report: only a small
 * fraction of installs ever leave a rating, and the fraction varies by
 * category. A user who knows their own app's real DPR should override
 * the prior — the UI exposes low/high as editable what-if inputs.
 */

export interface CategoryPrior {
  low: number;
  high: number;
  label: string;
}

/** DPR (downloads per new rating) ranges by Play genre. */
const PRIORS: Record<string, CategoryPrior> = {
  GAME: { low: 40, high: 200, label: "Games 40–200" },
  SOCIAL: { low: 333, high: 2000, label: "Social 333–2,000" },
  COMMUNICATION: { low: 200, high: 1000, label: "Communication 200–1,000" },
  ENTERTAINMENT: { low: 100, high: 500, label: "Entertainment 100–500" },
  DEFAULT: { low: 50, high: 150, label: "Utility/productivity 50–150" },
};

export function categoryPrior(genreId: string | null | undefined): CategoryPrior {
  if (!genreId) return PRIORS.DEFAULT;
  const g = genreId.toUpperCase();
  if (g.startsWith("GAME")) return PRIORS.GAME;
  if (g === "SOCIAL") return PRIORS.SOCIAL;
  if (g === "COMMUNICATION") return PRIORS.COMMUNICATION;
  if (g === "ENTERTAINMENT") return PRIORS.ENTERTAINMENT;
  return PRIORS.DEFAULT;
}

export interface DownloadRange {
  /** Monthly downloads, low end of the range. */
  low: number;
  /** Monthly downloads, high end of the range. */
  high: number;
  priorLow: number;
  priorHigh: number;
  priorLabel: string;
  /** Ratings/day the range was computed from. */
  velocityPerDay: number;
  /** ISO date the estimate is as of. */
  asOf: string;
  /** Display string, e.g. "≈9K–27K/mo". */
  line: string;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(Math.round(n));
}

/**
 * Monthly download RANGE from rating velocity. Returns null when there is
 * no velocity yet — the UI must show "collecting history", not a range
 * built from a single snapshot.
 */
export function estimateDownloads(
  velocityPerDay: number | null,
  genreId: string | null | undefined,
  override?: { low: number; high: number } | null
): DownloadRange | null {
  if (velocityPerDay == null || velocityPerDay <= 0) return null;
  const prior = categoryPrior(genreId);
  const lowPrior = override?.low ?? prior.low;
  const highPrior = override?.high ?? prior.high;
  const monthly = velocityPerDay * 30;
  const low = Math.round(monthly * lowPrior);
  const high = Math.round(monthly * highPrior);
  return {
    low,
    high,
    priorLow: lowPrior,
    priorHigh: highPrior,
    priorLabel: override ? `Custom ${lowPrior}–${highPrior}` : prior.label,
    velocityPerDay,
    asOf: new Date().toISOString().slice(0, 10),
    line: `≈${fmt(low)}–${fmt(high)}/mo`,
  };
}
