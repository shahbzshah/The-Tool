import { useMeditationStore } from '../store/useMeditationStore';
import { api } from '../lib/apiClient';
import { useApi } from '../hooks/useApi';

const DURATIONS = [60, 120, 300];

export default function Meditations() {
  const start = useMeditationStore((s) => s.start);
  const { data, loading } = useApi(() => api.meditations());
  const sessions = data?.sessions ?? [];

  const begin = async (id: string) => {
    const m = sessions.find((s) => s.id === id);
    if (!m) return;
    start({ ...m, durationSeconds: m.durationSeconds });
    try {
      await api.startMeditation(id);
    } catch {
      // demo mode - best effort logging
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Micro Meditations</h1>
      {loading && <p className="animate-pulse text-on-surface-variant" role="status">Loading library…</p>}
      <ul className="grid gap-4 md:grid-cols-2" aria-label="Meditation library">
        {sessions.map((m) => (
          <li key={m.id} className="rounded-2xl border border-outline-variant bg-surface-container p-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-medium">{m.title}</h2>
                <p className="mt-1 text-sm text-on-surface-variant">{m.description}</p>
              </div>
              <span className="rounded-full bg-secondary/15 px-2 py-0.5 text-xs text-secondary">{m.type}</span>
            </div>
            <div className="mt-4 flex items-center gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => void begin(m.id)}
                  aria-label={`Start ${m.title} for ${d / 60} minutes`}
                  className="rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/25"
                >
                  {d / 60}m
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {sessions.length === 0 && !loading && (
        <p className="text-sm text-on-surface-variant">Tap the flame to begin.</p>
      )}
    </div>
  );
}
