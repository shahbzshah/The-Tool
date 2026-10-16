"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ONBOARD_EVENT } from "@/lib/shortcuts";
import { apiFetch } from "@/lib/api";

type SettingStatus = {
  key: string;
  label: string;
  hint: string;
  secret: boolean;
  multiline: boolean;
  configured: boolean;
  fromEnv: boolean;
  updatedAt: string | null;
};

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<SettingStatus[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/settings");
      const data = await res.json();
      setSettings(data.settings ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(key: string, explicit?: string) {
    setSaving(key);
    try {
      const res = await apiFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: explicit ?? values[key] ?? "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed.");
      setSettings(data.settings ?? []);
      setValues((v) => ({ ...v, [key]: "" }));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-[720px] px-4 py-8 md:px-8">
        <p className="text-muted-foreground">Loading settings…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-8 md:px-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="label-caps font-mono text-primary">Configuration</p>
          <h1 className="mt-1 font-serif text-4xl tracking-tight">Settings</h1>
        </div>
        <button
          onClick={() => {
            // Back to wherever settings was opened from (Refine, Design, …),
            // so in-progress work isn't lost. Falls back to Hunter.
            let target = "/";
            try {
              const last = sessionStorage.getItem("lastAppPath");
              if (last && last.startsWith("/") && !last.startsWith("//")) target = last;
            } catch {
              /* ignore */
            }
            router.push(target);
          }}
          aria-label="Close settings"
          title="Close settings"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <span className="material-symbols text-[22px]">close</span>
        </button>
      </div>
      <p className="mt-2 max-w-xl text-[15px] text-muted-foreground">
        API keys and secrets for the app. Values are encrypted before they touch
        the database — they&apos;re never shown back. Environment variables, when
        set, always take precedence.
      </p>

      <div className="mt-6">
        <button
          onClick={() => window.dispatchEvent(new Event(ONBOARD_EVENT))}
          className="btn-secondary min-h-[44px]"
        >
          <span className="material-symbols text-[18px]">help</span>
          <span>Take the pipeline tour</span>
        </button>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {settings.map((s) => (
          <section key={s.key} className="card-paper p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-medium">{s.label}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{s.hint}</p>
              </div>
              {s.fromEnv ? (
                <span className="pill shrink-0 bg-secondary text-secondary-foreground">
                  From env
                </span>
              ) : s.configured ? (
                <span className="pill shrink-0 bg-score-high/15 text-score-high">
                  Set
                </span>
              ) : (
                <span className="pill shrink-0 bg-muted text-muted-foreground">
                  Not set
                </span>
              )}
            </div>

            {!s.fromEnv && (
              <div className="mt-4 flex gap-2">
                <div className="relative flex-1">
                  {s.multiline ? (
                    <textarea
                      value={values[s.key] ?? ""}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [s.key]: e.target.value }))
                      }
                      placeholder={
                        s.configured ? "•••••••• (enter a new value to replace)" : `Enter ${s.label.toLowerCase()}`
                      }
                      className="input-paper min-h-[120px] font-mono text-[13px]"
                      autoComplete="off"
                      spellCheck={false}
                      rows={5}
                    />
                  ) : (
                  <input
                    type={s.secret && !show[s.key] ? "password" : "text"}
                    value={values[s.key] ?? ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [s.key]: e.target.value }))
                    }
                    placeholder={
                      s.configured ? "•••••••• (enter a new value to replace)" : `Enter ${s.label.toLowerCase()}`
                    }
                    className="input-paper pr-11 font-mono text-[13px]"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  )}
                  {s.secret && (
                    <button
                      type="button"
                      onClick={() => setShow((p) => ({ ...p, [s.key]: !p[s.key] }))}
                      aria-label={show[s.key] ? "Hide" : "Show"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                      <span className="material-symbols text-[20px]">
                        {show[s.key] ? "visibility_off" : "visibility"}
                      </span>
                    </button>
                  )}
                </div>
                <button
                  onClick={() => save(s.key)}
                  disabled={saving === s.key || !(values[s.key] ?? "").trim()}
                  className="btn-secondary shrink-0"
                >
                  {saving === s.key ? "Saving…" : s.configured ? "Replace" : "Save"}
                </button>
                {s.configured && (
                  <button
                    onClick={() => {
                      if (!confirm(`Remove ${s.label}? The app will fall back to the environment variable.`)) return;
                      setValues((v) => ({ ...v, [s.key]: "" }));
                      save(s.key, "");
                    }}
                    disabled={saving === s.key}
                    className="btn-ghost shrink-0"
                    title="Remove this key"
                  >
                    <span className="material-symbols text-[18px]">delete</span>
                  </button>
                )}
              </div>
            )}
            {s.fromEnv && (
              <p className="mt-3 font-mono text-xs text-muted-foreground">
                Managed via environment variable — remove it there to use a stored value instead.
              </p>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
