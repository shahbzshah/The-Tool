"use client";

import { useEffect, useState } from "react";

/**
 * Compact AI quota indicator ("AI: 45/200 today"). Fetches /api/usage on
 * mount; hides silently if the fetch fails so it can never break the page.
 * Turns amber past 150/200 and rust-red past 180/200 as a pre-429 warning.
 */
export default function QuotaIndicator() {
  const [used, setUsed] = useState<number | null>(null);
  const [quota, setQuota] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/usage", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (cancelled) return;
        if (typeof data?.used === "number" && typeof data?.quota === "number") {
          setUsed(data.used);
          setQuota(data.quota);
        }
      })
      .catch(() => {
        /* hide silently on failure */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (used === null || quota === null) return null;

  const overRed = used >= 180;
  const overAmber = used >= 150;
  const tone = overRed
    ? "text-score-low"
    : overAmber
      ? "text-score-medium"
      : "text-muted-foreground";

  return (
    <>
      <span className="h-1 w-1 rounded-full bg-border" aria-hidden="true" />
      <span
        className={`font-mono text-[11px] ${tone}`}
        title="Daily AI quota"
        role="status"
        aria-label={`AI quota used today: ${used} of ${quota}`}
      >
        AI: {used}/{quota} today
      </span>
    </>
  );
}
