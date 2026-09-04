import { useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid
} from 'recharts';
import { api } from '../lib/apiClient';
import { useApi } from '../hooks/useApi';
import type { IFlowTracker } from '../lib/types';

const RANGES = ['today', '7days', '30days'] as const;

export default function FlowTracker() {
  const [range, setRange] = useState<(typeof RANGES)[number]>('7days');
  const { data, loading, error } = useApi<IFlowTracker>(() => api.flowTracker(range), [range]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Flow State Tracker</h1>

      <div role="group" aria-label="Time range" className="flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            aria-pressed={range === r}
            className={`rounded-lg px-4 py-1.5 text-sm capitalize ${
              range === r ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-high'
            }`}
          >
            {r.replace('days', ' days')}
          </button>
        ))}
      </div>

      {loading && <p className="animate-pulse text-on-surface-variant" role="status">Rendering charts…</p>}
      {error && <p className="text-error">Chart rendering failure — {error}</p>}

      {data && (
        <>
          <section className="rounded-2xl border border-outline-variant bg-surface-container p-4" aria-label="Velocity and frustration chart">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={data.data}>
                <CartesianGrid stroke="#222a3d" strokeDasharray="3 3" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(t: string) => new Date(t).getHours() + ':00'}
                  stroke="#bbcabf"
                  fontSize={11}
                />
                <YAxis yAxisId="left" stroke="#4edea3" fontSize={11} />
                <YAxis yAxisId="right" orientation="right" stroke="#d0bcff" fontSize={11} domain={[0, 10]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#171f33', border: '1px solid #3c4a42', borderRadius: 8 }}
                  labelFormatter={(t) => new Date(t).toLocaleTimeString()}
                />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="velocity" name="Commit velocity" stroke="#4edea3" dot={false} strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="frustration" name="Frustration" stroke="#d0bcff" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </section>

          <dl className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Tracker summary">
            {[
              ['Avg velocity', data.summary.avg_velocity.toFixed(1)],
              ['Peak frustration', data.summary.peak_frustration],
              ['Total commits', data.summary.total_commits],
              ['Optimal blocks', data.summary.optimal_blocks]
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-outline-variant bg-surface-container p-4">
                <dt className="text-xs text-on-surface-variant">{label}</dt>
                <dd className="mt-1 text-xl font-semibold text-primary">{value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}
