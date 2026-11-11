"use client";

import { useEffect, useState } from "react";

/**
 * Compact AI quota pill ("NVIDIA NIM · used/quota" with a usage bar).
 * Fetches /api/usage on mount; hides silently if the fetch fails so it can
 * never break the page. Turns amber past 150/200 and rust-red past 180/200
 * as a pre-429 warning. Used in the header and inline on Refine/Docs.
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

  if (used === null || quota === null || quota <= 0) return null;

  const overRed = used >= 180;
  const overAmber = used >= 150;
  const tone = overRed
    ? "text-score-low"
    : overAmber
      ? "text-score-medium"
      : "text-muted-foreground";
  const barTone = overRed
    ? "bg-score-low"
    : overAmber
      ? "bg-score-medium"
      : "bg-score-high";
  const pct = Math.min(100, Math.round((used / quota) * 100));

  return (
    <span
      className="hidden items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 sm:inline-flex"
      title="Daily AI quota"
      role="status"
      aria-label={`AI quota used today: ${used} of ${quota}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${overRed ? "bg-score-low" : "bg-score-high"}`}
        aria-hidden="true"
      />
      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        NVIDIA NIM
      </span>
      <span className="h-1 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span className={`block h-full ${barTone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className={`font-mono text-[11px] font-semibold ${tone}`}>
        {used}/{quota}
      </span>
    </span>
  );
}
