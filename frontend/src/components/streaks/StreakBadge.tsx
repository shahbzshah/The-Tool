/** Flame badge showing current zen streak count. */
export default function StreakBadge({ streak }: { streak: number }) {
  return (
    <div
      className="flex items-center gap-2 rounded-full bg-tertiary/15 px-3 py-1.5"
      role="status"
      aria-label={`Current zen streak: ${streak} days`}
    >
      <span aria-hidden="true" className="text-lg">🔥</span>
      <span className="font-semibold text-tertiary">{streak} day streak</span>
    </div>
  );
}
