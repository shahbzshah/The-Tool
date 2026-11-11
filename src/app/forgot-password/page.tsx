"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!email.trim()) return;
    setSending(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
    } catch {
      // ignore — always show the confirmation
    } finally {
      setSent(true);
      setSending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-8">
      <p className="label-caps mb-3 text-center text-primary">
        Ideas App // Telemetry OS
      </p>
      <div className="card-elevated w-full space-y-4 p-8">
        <div className="flex items-start justify-between gap-3 border-b border-border pb-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-md border border-primary-hover bg-primary text-primary-foreground">
            <span className="material-symbols text-[24px]">lock_reset</span>
          </div>
          <span className="pill border border-border bg-muted text-muted-foreground">
            Password reset
          </span>
        </div>
        <h1 className="font-serif text-xl font-semibold">Forgot password</h1>
        {sent ? (
          <div className="space-y-4">
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="material-symbols mt-0.5 shrink-0 text-[18px] text-score-high">
                check_circle
              </span>
              If an account exists for that email, a reset link is on its way.
              Check your inbox (and spam).
            </p>
            <Link href="/login" className="btn-secondary inline-block w-full text-center">
              Back to login
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Enter your account email and we&apos;ll send you a reset link.
            </p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="input-paper min-h-[44px] w-full"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <button
              onClick={submit}
              disabled={sending || !email.trim()}
              className="btn-primary min-h-[44px] w-full"
            >
              {sending ? "Sending…" : "Send reset link"}
            </button>
            <Link
              href="/login"
              className="block text-center text-sm text-muted-foreground hover:text-foreground"
            >
              Back to login
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
