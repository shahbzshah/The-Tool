import { useState } from 'react';
import { api } from '../lib/apiClient';
import { useApi } from '../hooks/useApi';
import PulseRecorder from '../components/mood/PulseRecorder';
import SentimentTags from '../components/mood/SentimentTags';

export default function MoodCheckin() {
  const [refreshKey, setRefreshKey] = useState(0);
  const sentiments = useApi(() => api.sentiments(), [refreshKey]);
  const checkIns = useApi(() => api.checkIns(), [refreshKey]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Mood &amp; Sentiment</h1>

      <section className="rounded-2xl border border-outline-variant bg-surface-container p-5" aria-label="Daily pulse">
        <PulseRecorder onRecorded={() => setRefreshKey((k) => k + 1)} />
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Recent check-ins">
          {(checkIns.data?.check_ins ?? []).slice(0, 7).map((c) => (
            <li key={c.id} className="rounded-full bg-surface-high px-3 py-1 text-xs text-on-surface-variant">
              {c.tag} · {new Date(c.timestamp).toLocaleDateString()}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-outline-variant bg-surface-container p-5" aria-label="Commit sentiment analysis">
        <h2 className="mb-3 text-sm font-medium text-on-surface-variant">7-DAY COMMIT RESONANCE</h2>
        {sentiments.loading ? (
          <p className="animate-pulse text-on-surface-variant" role="status">Fetching commits…</p>
        ) : sentiments.data ? (
          <SentimentTags data={sentiments.data} />
        ) : (
          <p className="text-error">{sentiments.error}</p>
        )}
      </section>
    </div>
  );
}
