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

function UsageCard() {
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  useEffect(() => {
    apiFetch("/api/usage")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.used === "number" && typeof d.quota === "number") {
          setUsage({ used: d.used, quota: d.quota });
        }
      })
      .catch(() => {});
  }, []);
  if (!usage) return null;
  const pct = Math.min(100, Math.round((usage.used / usage.quota) * 100));
  const left = usage.quota - usage.used;
  // Donut geometry (real percentage only).
  const R = 52;
  const C = 2 * Math.PI * R;
  return (
    <div className="card-elevated p-5 md:p-6">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <span className="label-caps text-muted-foreground">AI Usage Telemetry</span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-score-high" />
          <span className="label-caps text-score-high">Live</span>
        </span>
      </div>
      <div className="mt-5 flex items-center justify-between gap-4">
        <div>
          <p className="flex items-baseline gap-1.5">
            <span className="font-serif text-5xl font-medium leading-none text-foreground">
              {usage.used}
            </span>
            <span className="font-mono text-sm text-muted-foreground">
              / {usage.quota}
            </span>
          </p>
          <p className="label-caps mt-2 text-muted-foreground">
            AI calls used · last 24 hours
          </p>
          <p className="mt-2 text-sm font-medium text-score-high">
            {left} calls remaining
          </p>
        </div>
        <div className="relative h-[120px] w-[120px] shrink-0">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              strokeWidth="10"
              stroke="var(--border)"
            />
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              stroke="var(--primary)"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - pct / 100)}
            />
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-xl font-semibold text-foreground">
              {pct}%
            </span>
            <span className="label-caps text-muted-foreground">used</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function AdminPasswordReset() {
  const [users, setUsers] = useState<{ id: string; email: string; isAdmin: boolean }[]>([]);
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch("/api/admin/reset-password")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.users)) setUsers(d.users);
      })
      .catch(() => {});
  }, []);

  // Not an admin (or endpoint unavailable) — hide the section.
  if (users.length === 0) return null;

  async function reset() {
    if (!email || newPassword.length < 8) {
      setStatus("Select a user and enter a password (min 10 characters).");
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      const r = await apiFetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, newPassword }),
      });
      const d = await r.json();
      if (d.ok) {
        setStatus(`Password reset for ${d.email}.`);
        setNewPassword("");
      } else {
        setStatus(d.error || "Reset failed.");
      }
    } catch {
      setStatus("Reset failed — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card-paper flex flex-col p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <span className="label-caps text-muted-foreground">Admin</span>
        <span className="label-caps text-score-high">Role: root admin</span>
      </div>
      <h3 className="mt-2 font-serif text-xl font-medium text-foreground">
        Reset user password
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Admin only. Use this if someone (including you) is locked out — no email needed.
      </p>
      <div className="mt-4 grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label-caps mb-1.5 block text-muted-foreground">
            Select user
          </label>
          <select
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-paper min-h-[44px] flex-1"
          >
            <option value="">Select user…</option>
            {users.map((u) => (
              <option key={u.id} value={u.email}>
                {u.email}{u.isAdmin ? " (admin)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label-caps mb-1.5 block text-muted-foreground">
            New password
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (min 10 chars)"
            className="input-paper min-h-[44px] flex-1"
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button onClick={reset} disabled={saving} className="btn-primary min-h-[44px] shrink-0">
          {saving ? "Resetting…" : "Reset"}
        </button>
      </div>
      {status && <p className="mt-3 text-sm text-muted-foreground">{status}</p>}
    </div>
  );
}

function EmailTest() {
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!to.trim()) {
      setStatus("Enter an email address.");
      return;
    }
    setSending(true);
    setStatus("");
    try {
      const r = await apiFetch("/api/admin/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim() }),
      });
      const d = await r.json();
      if (d.ok) {
        setStatus("Test email sent — check the inbox (and spam).");
      } else {
        setStatus(`Failed: ${d.error || "unknown error"}`);
      }
    } catch {
      setStatus("Failed — try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card-paper flex flex-col p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <span className="label-caps text-muted-foreground">Admin</span>
        <span className="label-caps text-muted-foreground">Email delivery</span>
      </div>
      <h3 className="mt-2 font-serif text-xl font-medium text-foreground">
        Test email delivery
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Verify your Resend setup. Note: the default sender only delivers to your
        Resend account&apos;s own email — use a verified domain for anything else.
      </p>
      <div className="mt-4 flex flex-1 flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label className="label-caps mb-1.5 block text-muted-foreground">
            Recipient
          </label>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="you@example.com"
            className="input-paper min-h-[44px] flex-1"
          />
        </div>
        <div className="flex items-end">
          <button onClick={send} disabled={sending} className="btn-primary min-h-[44px] shrink-0">
            {sending ? "Sending…" : "Send test"}
          </button>
        </div>
      </div>
      {status && <p className="mt-3 text-sm text-muted-foreground">{status}</p>}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<SettingStatus[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/settings");
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error || "Could not load settings.");
        setSettings([]);
      } else {
        setLoadError("");
        setSettings(data.settings ?? []);
      }
    } catch {
      setLoadError("Could not load settings. Check your connection and try again.");
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
      <main className="mx-auto w-full max-w-[1280px] px-4 py-8 md:px-8">
        <p className="text-muted-foreground">Loading settings…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1280px] px-4 py-8 md:px-8">
      {/* Eyebrow row + return control */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="label-caps text-primary">SYS_CONFIG</span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-score-high" />
            <span className="label-caps text-score-high">Encrypted at rest</span>
          </span>
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

      {/* Hero: title + intro + tour, beside the usage telemetry panel */}
      <div className="mt-4 grid items-start gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <h1 className="font-serif text-4xl font-medium tracking-tight text-foreground md:text-5xl">
            System Settings &amp; Encryption Vault
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            API keys and secrets for the app. Values are encrypted before they touch
            the database — they&apos;re never shown back. Environment variables, when
            set, always take precedence.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={() => window.dispatchEvent(new Event(ONBOARD_EVENT))}
              className="btn-primary min-h-[44px]"
            >
              <span className="material-symbols text-[18px]">help</span>
              <span>Take the pipeline tour</span>
            </button>
          </div>
        </div>
        <div className="lg:col-span-2">
          <UsageCard />
        </div>
      </div>

      {/* 01 — Key vault */}
      <div className="mt-10 flex items-baseline justify-between gap-3 border-b border-border pb-3">
        <h2 className="font-serif text-2xl font-medium text-foreground">
          <span className="mr-2 font-mono text-sm text-primary">01 //</span>
          Cryptographic Key Vault
        </h2>
      </div>

      {loadError && (
        <div className="mt-5 rounded-md border border-score-low/40 bg-score-low/10 p-4 text-sm text-foreground">
          <p className="font-medium">Could not load settings</p>
          <p className="mt-1 text-muted-foreground">{loadError}</p>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {settings.map((s) => (
          <section key={s.key} className="card-paper flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <span className="label-caps break-all text-muted-foreground">{s.key}</span>
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
            <h3 className="mt-2 font-serif text-xl font-medium text-foreground">
              {s.label}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.hint}</p>

            <div className="mt-4 flex-1">
              {s.fromEnv && !s.configured && (
                <p className="mb-2 text-xs text-muted-foreground">
                  Currently from env var — save a value here to override it.
                </p>
              )}
              <div className="relative">
                {s.multiline ? (
                  <textarea
                    value={values[s.key] ?? ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [s.key]: e.target.value }))
                    }
                    placeholder={
                      s.configured ? "•••••••• (enter new value)" : `Enter ${s.label.toLowerCase()}`
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
                      s.configured ? "•••••••• (enter new value)" : `Enter ${s.label.toLowerCase()}`
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
            </div>

            <div className="mt-4 flex justify-end gap-2">
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
            {s.fromEnv && !s.configured && (
              <p className="mt-3 font-mono text-xs text-muted-foreground">
                Managed via environment variable — save a value above to override it.
              </p>
            )}
          </section>
        ))}
      </div>

      {/* 02 — Security administration & diagnostics */}
      <div className="mt-10 flex items-baseline justify-between gap-3 border-b border-border pb-3">
        <h2 className="font-serif text-2xl font-medium text-foreground">
          <span className="mr-2 font-mono text-sm text-primary">02 //</span>
          Security Administration &amp; Diagnostics
        </h2>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AdminPasswordReset />
        <EmailTest />
      </div>
    </main>
  );
}
