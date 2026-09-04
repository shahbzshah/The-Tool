import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid
} from 'recharts';
import { api } from '../lib/apiClient';
import { useApi } from '../hooks/useApi';
import type { IWeeklyScore } from '../lib/types';

export default function Score() {
  const { data, loading, error } = useApi<{ scores: IWeeklyScore[] }>(() => api.weeklyScores());

  const exportCsv = () => {
    const rows = data?.scores ?? [];
    const csv = 'week_start_date,score,velocity_ratio\n' + rows.map((r) => `${r.week_start_date},${r.score},${r.velocity_ratio}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'codezen-telemetry-audit.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const chartData = (data?.scores ?? []).map((s) => ({ ...s, week: new Date(s.week_start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Mindfulness Score</h1>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-lg border border-outline px-4 py-1.5 text-sm text-on-surface-variant hover:border-primary hover:text-primary"
        >
          Export Telemetry Audit
        </button>
      </div>

      {loading && <p className="animate-pulse text-on-surface-variant" role="status">Computing metrics…</p>}
      {error && <p className="text-error">Correlation engine down — {error}</p>}
      {chartData.length === 0 && !loading && (
        <p className="text-sm text-on-surface-variant">Score will appear after 7 days.</p>
      )}

      {chartData.length > 0 && (
        <section className="rounded-2xl border border-outline-variant bg-surface-container p-4" aria-label="Mindfulness vs output correlation">
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData}>
              <CartesianGrid stroke="#222a3d" strokeDasharray="3 3" />
              <XAxis dataKey="week" stroke="#bbcabf" fontSize={11} />
              <YAxis yAxisId="score" domain={[0, 100]} stroke="#4edea3" fontSize={11} />
              <YAxis yAxisId="ratio" orientation="right" stroke="#ffb95f" fontSize={11} domain={[0, 2]} />
              <Tooltip contentStyle={{ backgroundColor: '#171f33', border: '1px solid #3c4a42', borderRadius: 8 }} />
              <Legend />
              <Bar yAxisId="score" dataKey="score" name="Mindfulness score" fill="#4edea3" opacity={0.6} radius={[4, 4, 0, 0]} />
              <Line yAxisId="ratio" type="monotone" dataKey="velocity_ratio" name="Velocity ratio" stroke="#ffb95f" strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="mt-3 text-xs text-on-surface-variant">
            Positive trend: mindfulness practices correlate with higher commit velocity.
          </p>
        </section>
      )}
    </div>
  );
}
