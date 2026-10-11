/** Score tier for opportunity cards — ported from the original Hunter. */
export function scoreTier(score: number | null | undefined): {
  color: string;
  label: string;
  score: number;
} {
  const s = Math.round(score ?? 0);
  if (s >= 71) return { color: "#4ade80", label: "High Opportunity", score: s };
  if (s >= 41) return { color: "#f59e0b", label: "Medium Score", score: s };
  return { color: "#ef4444", label: "Low Score", score: s };
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
