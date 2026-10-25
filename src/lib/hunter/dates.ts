/**
 * Play date parsing. The scraper returns `updated` as a timestamp in this
 * lib version and as a date string in others — handle both. The old
 * year-regex approach ("year >= 2024") silently misread epoch timestamps
 * and is gone; every freshness calculation goes through here.
 */

export function parsePlayDate(
  value: string | number | null | undefined
): Date | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    // Seconds since epoch (10 digits) vs milliseconds (13 digits).
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole days between a date and now (negative = in the future). */
export function daysSince(date: Date | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

/** UTC day key for snapshot rows: "2026-10-25". */
export function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Add (or subtract) whole days from a YYYY-MM-DD day key. */
export function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
