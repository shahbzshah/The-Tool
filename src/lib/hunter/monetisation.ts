/**
 * Monetisation signal strip (plan item 6). Presence + velocity only —
 * NEVER an invented $/month revenue figure. Play never publishes revenue,
 * so any competitor "$/mo" would be a model stacked on a model.
 */

import type { AppDetail } from "./scoring";

const SUBSCRIPTION_RE =
  /\b(subscri(ption|be|ber)|premium|pro membership|monthly|yearly|weekly)\b/i;
const ADS_RE = /\b(ads|advertisements?)\b/i;

export interface MonetisationStrip {
  /** The opportunity app itself. */
  offersIap: boolean;
  iapRange: string | null;
  priceText: string | null;
  adSupported: boolean;
  subscriptionLanguage: boolean;
  /** "X of top 10 monetise via IAP/subscription" — null when unknown. */
  top10MonetisedCount: number | null;
  top10Count: number;
  /** Short human line, e.g. "7 of top 10 monetise via IAP/subscription". */
  line: string;
}

export function monetisationFor(detail: AppDetail): {
  offersIap: boolean;
  iapRange: string | null;
  priceText: string | null;
  adSupported: boolean;
  subscriptionLanguage: boolean;
} {
  const desc = detail.description ?? "";
  return {
    offersIap: !!detail.offersIAP,
    iapRange: detail.IAPRange ?? null,
    priceText: detail.priceText ?? null,
    adSupported: !!detail.adSupported,
    subscriptionLanguage: SUBSCRIPTION_RE.test(desc),
  };
}

export function monetisationStrip(
  self: AppDetail,
  peers: AppDetail[]
): MonetisationStrip {
  const s = monetisationFor(self);
  const top = peers.slice(0, 10);
  let monetised: number | null = null;
  if (top.length > 0) {
    monetised = top.filter((p) => {
      const m = monetisationFor(p);
      return m.offersIap || m.subscriptionLanguage;
    }).length;
  }
  const line =
    monetised == null
      ? "Monetisation of the top 10 is unknown for this scan."
      : `${monetised} of ${top.length} top apps monetise via IAP or subscription.`;
  return { ...s, top10MonetisedCount: monetised, top10Count: top.length, line };
}

/** Ads language is informational only (ads presence ≠ revenue). */
export function hasAdsLanguage(detail: AppDetail): boolean {
  return ADS_RE.test(detail.description ?? "");
}
