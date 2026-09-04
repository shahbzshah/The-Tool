import { useState } from 'react';
import { api } from '../../lib/apiClient';

const PULSES = [
  { tag: 'Laser', emoji: '⚡' },
  { tag: 'Calm', emoji: '🌊' },
  { tag: 'Drained', emoji: '☕' },
  { tag: 'Friction', emoji: '🔥' }
];

/** Emoji-based quick daily pulse recording (MASTER_PROMPT feature 4). */
export default function PulseRecorder({ onRecorded }: { onRecorded?: () => void }) {
  const [recorded, setRecorded] = useState<string | null>(null);

  const record = async (tag: string) => {
    setRecorded(tag);
    await api.addCheckIn(tag);
    onRecorded?.();
  };

  return (
    <div role="group" aria-label="Record your daily pulse">
      <p className="mb-2 text-sm text-on-surface-variant">How is your pulse right now?</p>
      <div className="flex gap-2">
        {PULSES.map((p) => (
          <button
            key={p.tag}
            type="button"
            onClick={() => void record(p.tag)}
            aria-label={`Record mood: ${p.tag}`}
            aria-pressed={recorded === p.tag}
            className={`flex flex-1 flex-col items-center gap-1 rounded-xl border p-3 transition-colors ${
              recorded === p.tag
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-outline-variant bg-surface-container hover:border-outline'
            }`}
          >
            <span aria-hidden="true" className="text-2xl">{p.emoji}</span>
            <span className="text-xs">{p.tag}</span>
          </button>
        ))}
      </div>
      {recorded && <p className="mt-2 text-xs text-primary" aria-live="polite">Pulse recorded: {recorded}</p>}
    </div>
  );
}
