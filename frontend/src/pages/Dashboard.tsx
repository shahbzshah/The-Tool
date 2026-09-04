import { api } from '../lib/apiClient';
import { useApi } from '../hooks/useApi';
import FlowStatusCard from '../components/dashboard/FlowStatusCard';
import MindfulnessRing from '../components/dashboard/MindfulnessRing';
import RecentSessionsList from '../components/dashboard/RecentSessionsList';
import StreakBadge from '../components/streaks/StreakBadge';

export default function Dashboard() {
  const { data, loading, error } = useApi(() => api.dashboard());
  const streaks = useApi(() => api.streaks());

  if (loading) return <p className="animate-pulse text-on-surface-variant" role="status">Loading your flow…</p>;
  if (error || !data) return <p className="text-error">Connection lost — {error}. Reconnect and refresh.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <StreakBadge streak={data.zen_streak} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FlowStatusCard data={data} />
        <MindfulnessRing score={data.mindfulness_score} />
      </div>
      <section className="rounded-2xl border border-outline-variant bg-surface-container p-5" aria-label="Recent sessions">
        <h2 className="mb-2 text-sm font-medium text-on-surface-variant">RECENT SESSIONS</h2>
        <RecentSessionsList sessions={streaks.data?.recent_sessions ?? []} />
      </section>
    </div>
  );
}
