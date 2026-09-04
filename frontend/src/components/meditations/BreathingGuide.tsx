import { useMeditationStore } from '../../store/useMeditationStore';
import { api } from '../../lib/apiClient';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Timer-driven modal overlay with guided breathing animation (DESIGN_SYSTEM 7.13). */
export default function BreathingGuide() {
  const { active, elapsed, running, pause, resume, tick, stop } = useMeditationStore();

  if (!active) return null;
  const total = active.durationSeconds;
  const done = elapsed >= total;
  const phase = Math.floor((elapsed % 10) / 2.5);
  const phaseLabel = ['Inhale', 'Hold', 'Exhale', 'Hold'][phase];

  const finish = async () => {
    try {
      await api.startMeditation(active.id);
    } catch {
      // demo mode - session logging is best-effort
    }
    stop();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${active.title} session`}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-8 bg-surface/95"
    >
      <h2 className="text-lg font-medium text-on-surface">{active.title}</h2>

      <div className="relative flex h-56 w-56 items-center justify-center">
        <div
          aria-hidden="true"
          className={`breathe-circle h-48 w-48 rounded-full bg-primary/80 ${running && !done ? '' : '[animation-play-state:paused]'}`}
        />
        <div className="absolute font-mono text-2xl text-on-primary">{fmt(done ? total : elapsed)}</div>
      </div>

      {!done && (
        <>
          <p className="text-sm uppercase tracking-widest text-secondary" aria-live="polite">
            {running ? phaseLabel : 'Paused'}
          </p>
          <div className="flex gap-3">
            {running ? (
              <button type="button" onClick={pause} className="rounded-lg bg-surface-high px-5 py-2 text-sm hover:bg-surface-highest">
                Pause
              </button>
            ) : (
              <button type="button" onClick={resume} className="rounded-lg bg-surface-high px-5 py-2 text-sm hover:bg-surface-highest">
                Resume
              </button>
            )}
            <button type="button" onClick={() => { tick(); }} className="hidden" aria-hidden="true" tabIndex={-1} />
            <button
              type="button"
              onClick={finish}
              className="rounded-lg bg-tertiary px-5 py-2 text-sm font-medium text-on-tertiary hover:bg-tertiary-container"
            >
              End Session
            </button>
          </div>
        </>
      )}

      {done && (
        <div className="flex flex-col items-center gap-4">
          <p className="text-primary" aria-live="polite">Session complete. Well done. 🌿</p>
          <button
            type="button"
            onClick={finish}
            className="rounded-lg bg-primary px-6 py-2 font-medium text-on-primary hover:bg-primary-container"
          >
            Return to IDE in Flow
          </button>
        </div>
      )}
    </div>
  );
}
