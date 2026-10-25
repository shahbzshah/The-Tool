"use client";

import { useEffect, useState } from "react";

// Flags features from the Power & Accuracy release, which went live
// (Vercel READY) 13:31 EAT, 25 Oct 2026. The flag shows for 24 hours from
// launch, then disappears on its own — no redeploy needed to remove it.
// Checked on the client after mount so a cached page can never show a
// stale flag past the cutoff.
const CUTOFF_MS = Date.parse("2026-10-26T10:31:00Z");

export default function NewBadge() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(Date.now() < CUTOFF_MS);
  }, []);
  if (!show) return null;
  return (
    <span className="ml-2 inline-flex shrink-0 items-center rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 align-middle font-mono text-[10px] font-bold tracking-wider text-primary">
      ★ NEW
    </span>
  );
}
