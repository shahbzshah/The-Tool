import type { IDashboard } from '../../lib/types';

const STATE_STYLES: Record<IDashboard['flow_status'], string> = {
  'In Flow': 'bg-primary/15 text-primary border-primary/40',
  Stressed: 'bg-tertiary/15 text-tertiary border-tertiary/40',
  Idle: 'bg-secondary/15 text-secondary border-secondary/40'
};

/** Current flow status indicator with color coding (emerald=flow, amber=stressed, lavender=idle). */
export default function FlowStatusCard({ data }: { data: IDashboard }) {
  return (
    <section
      aria-label="Current flow status"
      className={`rounded-2xl border p-6 ${STATE_STYLES[data.flow_status]}`}
    >
      <p className="text-sm opacity-80">Current state</p>
      <p className="mt-1 text-3xl font-semibold" aria-live="polite">
        {data.flow_status}
      </p>
      <p className="mt-2 text-sm opacity-90">
        Confidence {data.flow_percentage}% · {data.next_suggestion}
      </p>
    </section>
  );
}
