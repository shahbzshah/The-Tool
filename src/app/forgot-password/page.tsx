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
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4">
      <div className="card-paper w-full space-y-4 p-8">
        <h1 className="font-serif text-xl font-semibold">Forgot password</h1>
        {sent ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
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
