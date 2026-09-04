import { api } from '../lib/apiClient';
import { useApi } from '../hooks/useApi';
import StreakBadge from '../components/streaks/StreakBadge';
import RecentSessionsList from '../components/dashboard/RecentSessionsList';

export default function Streaks() {
  const { data, loading, error } = useApi(() => api.streaks());

  if (loading) return <p className="animate-pulse text-on-surface-variant" role="status">Calculating streaks…</p>;
  if (error || !data) return <p className="text-error">Backend sync issue — {error}</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Zen Streaks</h1>
      <div className="flex gap-4">
        <section className="flex-1 rounded-2xl border border-outline-variant bg-surface-container p-6 text-center" aria-label="Current streak">
          <p className="text-4xl font-bold text-tertiary">🔥 {data.current_streak}</p>
          <p className="mt-1 text-sm text-on-surface-variant">Current streak</p>
        </section>
        <section className="flex-1 rounded-2xl border border-outline-variant bg-surface-container p-6 text-center" aria-label="Longest streak">
          <p className="text-4xl font-bold text-secondary">{data.longest_streak} 🏆</p>
          <p className="mt-1 text-sm text-on-surface-variant">Longest streak</p>
        </section>
      </div>
      <section className="rounded-2xl border border-outline-variant bg-surface-container p-5" aria-label="Session history">
        <h2 className="mb-2 text-sm font-medium text-on-surface-variant">SESSION HISTORY</h2>
        <RecentSessionsList sessions={data.recent_sessions} />
      </section>
      <div className="flex justify-center">
        <StreakBadge streak={data.current_streak} />
      </div>
    </div>
  );
}
