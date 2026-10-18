"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function ResetPasswordPage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (password.length < 8) {
      setStatus("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setStatus("Passwords don't match.");
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      const r = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const d = await r.json();
      if (d.ok) {
        setDone(true);
      } else {
        setStatus(d.error || "Reset failed.");
      }
    } catch {
      setStatus("Reset failed — try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!token) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4">
        <div className="card-paper w-full space-y-4 p-8 text-center">
          <h1 className="font-serif text-xl font-semibold">Invalid link</h1>
          <p className="text-sm text-muted-foreground">
            This password reset link is missing its token.
          </p>
          <Link href="/login" className="btn-primary inline-block">
            Back to login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4">
      <div className="card-paper w-full space-y-4 p-8">
        <h1 className="font-serif text-xl font-semibold">Set a new password</h1>
        {done ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              Your password has been reset.
            </p>
            <button onClick={() => router.push("/login")} className="btn-primary w-full">
              Go to login
            </button>
          </div>
        ) : (
          <>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password (min 8 characters)"
              className="input-paper min-h-[44px] w-full"
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              className="input-paper min-h-[44px] w-full"
            />
            <button
              onClick={submit}
              disabled={saving}
              className="btn-primary min-h-[44px] w-full"
            >
              {saving ? "Resetting…" : "Reset password"}
            </button>
            {status && (
              <p className="text-sm text-muted-foreground">{status}</p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
