/**
 * Modelled competitor revenue — a labelled estimate, never a fact.
 *
 * Play never publishes revenue, so there is no real competitor $/mo anywhere
 * in this app, and this module never produces one. What it does produce, from
 * public Play fields Hunter already scrapes:
 *
 *   paid price x min installs = modelled LIFETIME gross from paid downloads
 *
 * The installs figure Play shows ("100,000,000+") is a floor, so the product
 * is a modelled floor too — and only under the assumption every install paid.
 * Real revenue is lower: Google takes ~30%, refunds and free/promotional
 * installs pay nothing, and price changes over time are invisible. IAP
 * revenue cannot be modelled at all (the scraper's IAP price field comes
 * back empty), so free apps report "$0 from paid downloads" with IAP unknown.
 *
 * CAC / LTV are deliberately absent: no spend, retention, or payer-rate data
 * exists in Play data, so any number there would be invented.
 */

export interface RevenueEstimate {
  /** Short display value, e.g. "$699M+" or "$0 from paid downloads". */
  label: string;
  /** One-line caveat shown next to the label. */
  detail: string;
}

/** "$2.99" -> 2.99, "Free" / "$0" -> 0, null / unparseable -> null. */
export function parsePriceText(priceText: string | null | undefined): number | null {
  if (priceText == null) return null;
  const t = String(priceText).trim();
  if (!t) return null;
  if (/^free$/i.test(t)) return 0;
  const m = t.match(/[\d,.]+/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function formatCompactUsd(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `$${v >= 100 ? Math.round(v).toString() : v.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (n >= 1_000) {
    const v = n / 1_000;
    return `$${v >= 100 ? Math.round(v).toString() : v.toFixed(1).replace(/\.0$/, "")}K`;
  }
  return `$${Math.round(n)}`;
}

/**
 * Modelled revenue from the public Play fields stored on an Opportunity row.
 * installsMin may arrive as a number, a numeric string (BigInt serialised
 * by the API), or null. Returns null when the model cannot be computed.
 */
export function estimatedRevenue(input: {
  priceText: string | null | undefined;
  installsMin: number | string | null | undefined;
  offersIap?: boolean | null;
}): RevenueEstimate | null {
  const price = parsePriceText(input.priceText);
  const installsMin =
    input.installsMin == null ? null : Number(input.installsMin);
  if (price == null || installsMin == null || !Number.isFinite(installsMin) || installsMin <= 0) {
    return null;
  }
  if (price > 0) {
    return {
      label: `${formatCompactUsd(price * installsMin)}+`,
      detail:
        "Modelled lifetime gross from paid downloads (price × min installs). Assumes every install paid; Google's ~30% cut, refunds and free installs make the real number lower. Not monthly, not net.",
    };
  }
  return {
    label: "$0 from paid downloads",
    detail: input.offersIap
      ? "Free app — IAP revenue unknown, Play never publishes it."
      : "Free app with no IAP.",
  };
}
