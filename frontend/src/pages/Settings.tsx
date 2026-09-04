import { useState } from 'react';
import { api } from '../lib/apiClient';
import { useApi } from '../hooks/useApi';
import IntegrationToggle from '../components/settings/IntegrationToggle';
import SensitivitySlider from '../components/settings/SensitivitySlider';

export default function Settings() {
  const { data, loading, error } = useApi(() => api.settings());
  const [velocity, setVelocity] = useState(8);
  const [frustration, setFrustration] = useState(5);
  const [idle, setIdle] = useState(10);
  const [saved, setSaved] = useState<string | null>(null);

  const toggleIntegration = async (provider: string, next: boolean) => {
    if (!next) {
      const confirmed = window.confirm(
        `Revoke ${provider} access? Telemetry syncing will stop and historical data will no longer update.`
      );
      if (!confirmed) return;
      await fetch(`/api/v1/settings/integrations/${provider}`, { method: 'DELETE' }).catch(() => null);
    }
    setSaved(`${provider} ${next ? 'connected' : 'disconnected'}`);
  };

  const saveSettings = async (patch: Record<string, unknown>, label: string) => {
    await api.updateSettings(patch).catch(() => null);
    setSaved(label);
  };

  const applyCalibration = async () => {
    await fetch('/api/v1/flow/triggers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        velocity_threshold: velocity,
        frustration_threshold: frustration,
        idle_timeout_minutes: idle
      })
    }).catch(() => null);
    setSaved('Calibration applied — new thresholds active');
  };

  if (loading) return <p className="animate-pulse text-on-surface-variant" role="status">Loading settings…</p>;
  if (error || !data) return <p className="text-error">Failed to load settings — {error}</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      {saved && <p className="rounded-lg bg-primary/15 px-4 py-2 text-sm text-primary" role="status" aria-live="polite">{saved}</p>}

      <section aria-label="Integrations" className="space-y-3">
        <h2 className="text-sm font-medium text-on-surface-variant">INTEGRATIONS &amp; PRIVACY</h2>
        {data.integrations.map((i) => (
          <IntegrationToggle key={i.provider} provider={i.provider} isActive={i.is_active} onToggle={(p, n) => void toggleIntegration(p, n)} />
        ))}
        <IntegrationToggle provider="google_calendar" isActive={false} onToggle={(p, n) => void toggleIntegration(p, n)} />
      </section>

      <section aria-label="IDE sync" className="rounded-xl border border-outline-variant bg-surface-container p-4">
        <IntegrationToggle
          provider="ide_sync"
          isActive={data.settings.ide_sync_enabled}
          onToggle={(_, next) => void saveSettings({ ide_sync_enabled: next }, 'IDE sync updated')}
        />
      </section>

      <section aria-label="Triggers and sensitivity" className="space-y-4 rounded-xl border border-outline-variant bg-surface-container p-5">
        <h2 className="text-sm font-medium text-on-surface-variant">TRIGGERS &amp; SENSITIVITY</h2>
        <SensitivitySlider label="Flow detection velocity threshold" value={velocity} min={1} max={30} onChange={setVelocity} />
        <SensitivitySlider label="Stress detection threshold" value={frustration} min={1} max={10} onChange={setFrustration} />
        <SensitivitySlider label="Idle timeout (minutes)" value={idle} min={1} max={60} onChange={setIdle} />
        <button
          type="button"
          onClick={() => void applyCalibration()}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-on-primary hover:bg-primary-container"
        >
          Apply Calibration
        </button>
      </section>
    </div>
  );
}
