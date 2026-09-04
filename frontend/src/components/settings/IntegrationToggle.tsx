interface IIntegrationToggleProps {
  provider: string;
  isActive: boolean;
  onToggle: (provider: string, next: boolean) => void;
}

/** Toggle switch for third-party integration sync (US-017). */
export default function IntegrationToggle({ provider, isActive, onToggle }: IIntegrationToggleProps) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-outline-variant bg-surface-container p-4">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="text-xl">{provider === 'github' ? '🐙' : provider === 'gitlab' ? '🦊' : '📅'}</span>
        <div>
          <p className="text-sm font-medium capitalize">{provider.replace('_', ' ')}</p>
          <p className="text-xs text-on-surface-variant">{isActive ? 'Syncing telemetry' : 'Disconnected'}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isActive}
        aria-label={`${provider} sync`}
        onClick={() => onToggle(provider, !isActive)}
        className={`relative h-6 w-11 rounded-full transition-colors ${isActive ? 'bg-primary' : 'bg-surface-highest'}`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${isActive ? 'translate-x-5' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  );
}
