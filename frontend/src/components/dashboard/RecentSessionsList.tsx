import type { IStreaks } from '../../lib/types';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Recent meditation session log. */
export default function RecentSessionsList({ sessions }: { sessions: IStreaks['recent_sessions'] }) {
  if (sessions.length === 0) {
    return <p className="text-sm text-on-surface-variant">Your flow journey begins here — tap the flame to begin.</p>;
  }
  return (
    <ul aria-label="Recent meditation sessions" className="divide-y divide-outline-variant">
      {sessions.slice(0, 5).map((s) => (
        <li key={s.id} className="flex items-center justify-between py-3 text-sm">
          <div>
            <p className="font-medium">{s.title}</p>
            <p className="text-xs text-on-surface-variant">{fmtDate(s.started_at)}</p>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              s.completion_status === 'completed' ? 'bg-primary/15 text-primary' : 'bg-tertiary/15 text-tertiary'
            }`}
          >
            {s.completion_status} · {Math.round(s.duration_seconds / 60)}m
          </span>
        </li>
      ))}
    </ul>
  );
}
