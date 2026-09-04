"use client";

import { useState } from "react";
import { DOC_KINDS } from "@/lib/constants";

const PRESETS: { label: string; stack: string }[] = [
  {
    label: "Next.js full-stack ⭐",
    stack:
      "Next.js 14 (App Router) + TypeScript + Tailwind CSS. Prisma ORM with PostgreSQL (Neon). API via Next.js route handlers. Auth via NextAuth. State: React hooks (no Redux). Deployed on Vercel.",
  },
  {
    label: "React Native / Expo",
    stack:
      "React Native + Expo (TypeScript) + Expo Router. Supabase (Postgres + Auth + Storage). Zustand for state. Tailwind via NativeWind. EAS Build for distribution.",
  },
  {
    label: "FastAPI + React",
    stack:
      "FastAPI (Python) backend with SQLAlchemy + PostgreSQL. React 18 + Vite + TypeScript frontend. Tailwind CSS. JWT auth. Docker Compose for local dev, Railway for deploy.",
  },
  {
    label: "Node + React + MongoDB",
    stack:
      "Node.js + Express (TypeScript) API with Mongoose + MongoDB Atlas. React 18 + Vite frontend with Tailwind CSS. JWT auth with bcrypt. Deployed on Render (API) + Vercel (client).",
  },
];

/** Docs whose content depends on the locked stack. */
const ALIGN_KINDS = [
  "TECHNICAL_SPEC",
  "FOLDER_STRUCTURE",
  "RULES",
  "MASTER_PROMPT",
];

export default function StackLockPanel({
  projectId,
  ideaId,
  stackLock,
  onStackLockChange,
  docs,
  onDocsUpdated,
}: {
  projectId: string;
  ideaId: string;
  stackLock: string | null;
  onStackLockChange: (lock: string | null) => void;
  docs: Record<string, string>;
  onDocsUpdated: (updated: Record<string, string>) => void;
}) {
  const [draft, setDraft] = useState(stackLock ?? "");
  const [saving, setSaving] = useState(false);
  const [aligning, setAligning] = useState(false);
  const [alignLabel, setAlignLabel] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const locked = !!stackLock?.trim();

  async function save(lock: string | null) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stackLock: lock }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save stack lock.");
      onStackLockChange(data.project.stackLock);
      setDraft(data.project.stackLock ?? "");
      setMessage(
        data.project.stackLock
          ? "Stack locked 🔒 — every doc generated from now on will follow it."
          : "Stack lock cleared."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function align() {
    setAligning(true);
    setError(null);
    setMessage(null);
    try {
      for (let i = 0; i < ALIGN_KINDS.length; i++) {
        const meta = DOC_KINDS.find((d) => d.kind === ALIGN_KINDS[i]);
        setAlignLabel(
          `${meta?.label ?? ALIGN_KINDS[i]} (${i + 1}/${ALIGN_KINDS.length})`
        );
        const res = await fetch("/api/docs/align", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ideaId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Alignment failed.");
        if (i === ALIGN_KINDS.length - 1 && Array.isArray(data.docs)) {
          const map: Record<string, string> = {};
          for (const d of data.docs) map[d.kind] = d.content;
          onDocsUpdated(map);
        }
      }
      setMessage("Docs aligned to the locked stack ✅");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Alignment failed.");
    } finally {
      setAligning(false);
      setAlignLabel("");
    }
  }

  const alignableCount = ALIGN_KINDS.filter((k) => docs[k]).length;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          2. Stack Lock 🔒
        </h2>
        {locked && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
            locked
          </span>
        )}
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Pick one canonical tech stack. It&apos;s injected as a hard rule into
        every generated doc so PRD, tech spec, folder structure, and rules all
        agree — no more Express-vs-NestJS conflicts.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            disabled={saving || aligning}
            onClick={() => setDraft(p.stack)}
            className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          >
            {p.label}
          </button>
        ))}
      </div>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        placeholder="E.g., Next.js 14 + TypeScript + Prisma + PostgreSQL on Vercel — no other backend…"
        className="mb-3 w-full resize-none rounded border border-border bg-background p-3 font-mono text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-ring"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => save(draft.trim() || null)}
          disabled={saving || aligning}
          className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : locked ? "Update lock 🔒" : "Lock stack 🔒"}
        </button>
        {locked && (
          <button
            onClick={align}
            disabled={saving || aligning}
            className="rounded border border-primary px-4 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
          >
            {aligning
              ? `Aligning ${alignLabel}…`
              : `Align docs to stack 🔄${alignableCount > 0 ? ` (${alignableCount} docs)` : ""}`}
          </button>
        )}
        {locked && !aligning && (
          <button
            onClick={() => save(null)}
            disabled={saving}
            className="font-mono text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            clear lock
          </button>
        )}
      </div>

      {message && (
        <p className="mt-3 rounded-lg border border-secondary/40 bg-secondary/10 px-3 py-2 text-sm text-secondary-foreground">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}