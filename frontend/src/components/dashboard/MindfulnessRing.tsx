/** Circular progress ring for the weekly mindfulness score. */
export default function MindfulnessRing({ score }: { score: number | null }) {
  const value = score ?? 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);

  return (
    <section
      aria-label="Weekly mindfulness score"
      className="flex flex-col items-center rounded-2xl border border-outline-variant bg-surface-container p-6"
    >
      <div className="relative h-32 w-32" role="img" aria-label={`Mindfulness score ${value} of 100`}>
        <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
          <circle cx="64" cy="64" r={radius} fill="none" stroke="#222a3d" strokeWidth="10" />
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            stroke="#4edea3"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-primary">{score === null ? '--' : value}</span>
          <span className="text-xs text-on-surface-variant">/ 100</span>
        </div>
      </div>
      <p className="mt-3 text-sm font-medium">Mindfulness Score</p>
    </section>
  );
}
