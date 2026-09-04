import { useMeditationStore } from '../../store/useMeditationStore';
import { mockMeditations } from '../../lib/mockData';

/** AI-suggested focus blocks based on low-commit history (demo suggestion engine). */
export default function CalendarWidget() {
  const start = useMeditationStore((s) => s.start);
  const suggestions = [
    { day: 'Tomorrow', time: '09:00 – 10:30', reason: 'Low commit volume window' },
    { day: 'Tomorrow', time: '14:00 – 15:00', reason: 'Recurring post-lunch idle period' },
    { day: 'Thursday', time: '10:00 – 12:00', reason: 'Historically high flow state' }
  ];

  const accept = () => {
    const quickBreathe = mockMeditations.find((m) => m.title === 'Quick Breathe') ?? mockMeditations[1];
    start(quickBreathe);
  };

  return (
    <div className="space-y-3" aria-label="Focus time suggestions">
      {suggestions.map((s) => (
        <div
          key={`${s.day}-${s.time}`}
          className="flex items-center justify-between rounded-xl border border-outline-variant bg-surface-container p-4"
        >
          <div>
            <p className="text-sm font-medium">{s.day} · {s.time}</p>
            <p className="text-xs text-on-surface-variant">{s.reason}</p>
          </div>
          <button
            type="button"
            onClick={accept}
            className="rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/25"
          >
            + Add block
          </button>
        </div>
      ))}
    </div>
  );
}
