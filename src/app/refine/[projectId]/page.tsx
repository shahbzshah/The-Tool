"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  apiFetch,
  consumeSavedState,
  locationKey,
} from "@/lib/api";
import { useEscapeClose } from "@/lib/shortcuts";
import QuotaIndicator from "@/components/QuotaIndicator";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt?: string | null;
};

type IdeaSnapshot = {
  id: string;
  title: string;
  pitch: string;
  features: string[];
  targetAudience: string;
  monetization: string | null;
};

function fmtTime(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

const STARTER_PROMPTS = [
  "Summarize the idea so far",
  "Challenge my assumptions",
  "Suggest 3 monetization models",
  "What would you cut?",
  "Who is this NOT for?",
];

type Decision = {
  createdAt?: string | null;
  keys: string[];
};

// IdeaVersion rows from GET /api/ideas/[id]/versions (list view).
type IdeaVersionRow = {
  id: string;
  title: string;
  note: string | null;
  createdAt: string;
};

// Decisions are built from each chat POST response's `appliedUpdates` —
// the server strips ```update blocks before persisting, so persisted
// messages can no longer be parsed for them.

function conversationMarkdown(msgs: ChatMessage[], ideaTitle?: string): string {
  const header = ideaTitle
    ? `# Refine conversation — ${ideaTitle}\n`
    : `# Refine conversation\n`;
  const turns = msgs
    .map(
      (m) =>
        `## ${m.role === "user" ? "You" : "Editorial Analyst"}\n\n${m.content.trim()}`
    )
    .join("\n\n---\n\n");
  return `${header}\n${turns}\n`;
}

export default function RefinePage({ params }: { params: { projectId: string } }) {
  const searchParams = useSearchParams();
  const ideaId = searchParams.get("idea");
  const { projectId } = params;

  const [idea, setIdea] = useState<IdeaSnapshot | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  // M16: draft failures render inline (above the input) and never wipe the
  // workspace.
  const [draftError, setDraftError] = useState("");
  const [briefUpdatedAt, setBriefUpdatedAt] = useState<string | null>(null);
  const [briefContent, setBriefContent] = useState<string | null>(null);
  const [analysisText, setAnalysisText] = useState<string | null>(null);
  const [ideaJustUpdated, setIdeaJustUpdated] = useState(false);
  const [showFullIdea, setShowFullIdea] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [modelName, setModelName] = useState("");
  const [copied, setCopied] = useState(false);
  const [decisionsOpen, setDecisionsOpen] = useState(true);
  // M21-client: the decisions log, built from each chat POST response's
  // `appliedUpdates` instead of parsing persisted messages.
  const [decisions, setDecisions] = useState<Decision[]>([]);
  // Item 8: the log is persisted to the project (PATCH /api/projects/[id])
  // and restored on load. decisionsRestored flips true only once a load
  // completed — before that, the persist effect below must not fire.
  const decisionsRestored = useRef(false);
  // Item 8: last decision list written to the project; the persist effect
  // skips writes that would send identical JSON back (e.g. right after a
  // restore).
  const lastPersistedDecisions = useRef("");
  // Item 7: retry for failed AI messages — the index of the failed
  // assistant bubble and the user text to resend.
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const [failedText, setFailedText] = useState<string | null>(null);
  // History (IdeaVersion snapshots): collapsible panel in the Living Idea
  // side panel. Versions load lazily on first open.
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<IdeaVersionRow[] | null>(null);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const versionsLoadedRef = useRef(false);
  // Item 9: project-wide AI token usage, shown muted in the header.
  const [tokensUsed, setTokensUsed] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // M8: localStorage key for the autosaved draft input.
  const DRAFT_KEY = `refine-draft:${projectId}`;
  // State snapshot restored after a login redirect (session expired mid-work).
  const savedStateRef = useRef<{
    messages?: ChatMessage[];
    draft?: string;
  } | null>(null);

  async function copyConversation() {
    const md = conversationMarkdown(messages, idea?.title);
    try {
      await navigator.clipboard.writeText(md);
    } catch {
      // Fallback for clipboard-restricted contexts.
      const ta = document.createElement("textarea");
      ta.value = md;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const loadIdea = useCallback(async () => {
    if (!ideaId) {
      setError("No idea selected.");
      return;
    }
    // E3: the idea, docs, and chat-history fetches are independent — fire
    // them together instead of sequentially.
    const [ideaRes, docsRes, chatRes] = await Promise.allSettled([
      apiFetch(`/api/ideas/${ideaId}`),
      apiFetch(`/api/docs?ideaId=${ideaId}`),
      apiFetch(`/api/refine/chat?projectId=${projectId}&ideaId=${ideaId}`),
    ]);
    if (
      ideaRes.status !== "fulfilled" ||
      docsRes.status !== "fulfilled" ||
      chatRes.status !== "fulfilled"
    ) {
      setError("Could not load the idea.");
      return;
    }
    const ideaResponse = ideaRes.value;
    const docsResponse = docsRes.value;
    const chatResponse = chatRes.value;
    // apiFetch redirects to /login?next=… on 401; the guards below stop
    // further work.
    if (
      ideaResponse.status === 401 ||
      docsResponse.status === 401 ||
      chatResponse.status === 401
    ) {
      return;
    }
    if (!ideaResponse.ok) {
      setError("Idea not found.");
      return;
    }
    let data: any;
    try {
      data = await ideaResponse.json();
    } catch {
      setError("Could not load the idea.");
      return;
    }
    let features: string[] = [];
    try {
      features = JSON.parse(data.idea.features ?? "[]");
    } catch {
      // ignore
    }
    setIdea({ ...data.idea, features });
    if (data.idea.project?.preferences) {
      setAnalysisText(data.idea.project.preferences);
    }

    // Check for an existing saved brief.
    try {
      const dd = await docsResponse.json();
      const brief = (dd.docs ?? []).find((x: any) => x.kind === "REFINED_BRIEF");
      if (brief) {
        setBriefUpdatedAt(brief.updatedAt);
        setBriefContent(brief.content);
      }
    } catch {
      // ignore
    }

    // Restore a conversation snapshot from a login redirect first —
    // it is newer than the DB history.
    const saved = savedStateRef.current;
    if (saved?.messages?.length) {
      setMessages(saved.messages);
      savedStateRef.current = null;
      return;
    }

    // Restore saved conversation; a refresh no longer loses anything.
    try {
      const hd = await chatResponse.json();
      if (Array.isArray(hd.messages) && hd.messages.length > 0) {
        setMessages(hd.messages);
        return;
      }
    } catch {
      // fall through to greeting
    }
    setMessages([
      {
        role: "assistant",
        content: `I've read the full analysis on “${data.idea.title}”. What do you want to dig into first — features, scope, audience, or how to beat the competition?`,
      },
    ]);
  }, [ideaId, projectId]);

  useEffect(() => {
    // Pull any snapshot saved before a login redirect and restore the draft.
    const saved = consumeSavedState(locationKey()) as {
      messages?: ChatMessage[];
      draft?: string;
    } | null;
    if (saved?.draft) setInput(saved.draft);
    if (saved?.messages?.length) savedStateRef.current = saved;
    loadIdea();
  }, [loadIdea]);

  // M8: restore an autosaved draft from before a refresh or navigation.
  // The login-redirect snapshot above is newer and wins if both exist.
  useEffect(() => {
    try {
      const autosaved = localStorage.getItem(DRAFT_KEY);
      if (autosaved) setInput((prev) => prev || autosaved);
    } catch {
      // storage blocked — nothing to restore
    }
    // DRAFT_KEY is derived from the route param; it never changes mid-page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // M8: autosave the draft input ~1s after the user stops typing.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (input.trim()) localStorage.setItem(DRAFT_KEY, input);
        else localStorage.removeItem(DRAFT_KEY);
      } catch {
        // storage blocked — the draft just won't survive a refresh
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [input, DRAFT_KEY]);

  // M8: warn before leaving with unsaved draft input.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (input.trim()) {
        e.preventDefault();
        // Chrome requires returnValue to be set for the dialog.
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [input]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Esc closes the full-idea reader.
  useEscapeClose(() => setShowFullIdea(false));

  // Item 8: persist the decisions log to the project (debounced, best-effort
  // — the panel still works in-memory if the write fails). Never fires
  // before the initial restore completes, and skips identical writes.
  useEffect(() => {
    if (!decisionsRestored.current) return;
    const json = JSON.stringify(decisions);
    if (json === lastPersistedDecisions.current) return;
    lastPersistedDecisions.current = json;
    const t = setTimeout(() => {
      apiFetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions: json }),
      }).catch(() => {
        // best-effort only
      });
    }, 800);
    return () => clearTimeout(t);
  }, [decisions, projectId]);

  async function send(e?: React.FormEvent, overrideText?: string) {
    if (e) e.preventDefault();
    const text = (overrideText ?? input).trim();
    if (!text || sending || !ideaId) return;
    setInput("");
    // The draft is now a sent message — drop the autosave.
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
    setSending(true);
    const now = new Date().toISOString();
    const next = [...messages, { role: "user" as const, content: text, createdAt: now }];
    setMessages(next);
    try {
      const res = await apiFetch(
        "/api/refine/chat",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, ideaId, message: text }),
        },
        // If the session expired, apiFetch snapshots this so login restores it.
        { snapshot: { messages: next, draft: "" } }
      );
      if (res.status === 401) return; // redirect already fired
      const data = await res.json();
      if (!res.ok) {
        setMessages([
          ...next,
          { role: "assistant", content: data.error ?? "Something went wrong. Try again.", createdAt: new Date().toISOString() },
        ]);
        // Item 7: mark the failed bubble so it gets a Retry button.
        setFailedAt(next.length);
        setFailedText(text);
        return;
      }
      if (data.model) setModelName(String(data.model).split("/").pop() ?? "");
      setMessages([...next, { role: "assistant", content: data.reply, createdAt: new Date().toISOString() }]);
      // Item 7: the retry target is resolved — clear it.
      setFailedAt(null);
      setFailedText(null);
      if (data.idea) {
        setIdea(data.idea);
        // Flash the panel so the user sees the edit land live.
        setIdeaJustUpdated(true);
        setTimeout(() => setIdeaJustUpdated(false), 2500);
        // The AI update created a new snapshot — refresh history if open.
        if (versionsLoadedRef.current) loadVersions();
      }
      if (data.briefSaved) setBriefUpdatedAt(new Date().toISOString());
      // M21-client: build the decisions log from the response's
      // `appliedUpdates` — no parsing of persisted messages.
      if (Array.isArray(data.appliedUpdates) && data.appliedUpdates.length > 0) {
        setDecisions((prev) => [
          ...prev,
          {
            createdAt: new Date().toISOString(),
            keys: data.appliedUpdates.map(String),
          },
        ]);
      }
    } catch {
      setMessages([
        ...next,
        { role: "assistant", content: "Something went wrong. Try again.", createdAt: new Date().toISOString() },
      ]);
      // Item 7: mark the failed bubble so it gets a Retry button.
      setFailedAt(next.length);
      setFailedText(text);
    } finally {
      setSending(false);
    }
  }

  // Item 7: drop the failed bubble and re-send the last user message
  // through the normal send() path.
  async function retryFailed() {
    const text = failedText;
    if (!text || sending) return;
    setMessages((prev) =>
      failedAt == null ? prev : prev.filter((_, idx) => idx !== failedAt)
    );
    setFailedAt(null);
    setFailedText(null);
    await send(undefined, text);
  }

  function saveBrief() {
    send(undefined, "Save the refined brief now — write the complete file with everything we've decided.");
  }

  async function draftFromAnalysis() {
    if (!ideaId || drafting) return;
    setDrafting(true);
    setDraftError("");
    try {
      const res = await apiFetch(
        "/api/refine/draft",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, ideaId }),
        },
        { snapshot: { messages, draft: input } }
      );
      if (res.status === 401) return; // redirect already fired
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Draft failed.");
      setIdea(data.idea);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.summary, createdAt: new Date().toISOString() },
      ]);
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Draft failed.");
    } finally {
      setDrafting(false);
    }
  }

  // History: fetch IdeaVersion snapshots (newest first), lazily on first
  // open of the panel.
  async function loadVersions() {
    if (!ideaId || versionsLoading) return;
    setVersionsLoading(true);
    setVersionsError("");
    try {
      const res = await apiFetch(`/api/ideas/${ideaId}/versions`);
      if (res.status === 401) return; // redirect already fired
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load history.");
      setVersions(data.versions ?? []);
      versionsLoadedRef.current = true;
    } catch (err) {
      setVersionsError(err instanceof Error ? err.message : "Could not load history.");
    } finally {
      setVersionsLoading(false);
    }
  }

  function toggleVersions() {
    const next = !versionsOpen;
    setVersionsOpen(next);
    if (next && !versionsLoadedRef.current) loadVersions();
  }

  // Restore a snapshot onto the idea. The server snapshots the current
  // state first, so a restore is itself undoable.
  async function restoreVersion(versionId: string) {
    if (!ideaId || restoringId) return;
    if (
      !window.confirm(
        "Restore this version? The current idea is saved to history first, so you can undo."
      )
    ) {
      return;
    }
    setRestoringId(versionId);
    setVersionsError("");
    try {
      const res = await apiFetch(
        `/api/ideas/${ideaId}/versions/${versionId}/restore`,
        { method: "POST" }
      );
      if (res.status === 401) return; // redirect already fired
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Restore failed.");
      setIdea(data.idea);
      setIdeaJustUpdated(true);
      setTimeout(() => setIdeaJustUpdated(false), 2500);
      // The restore created a new "before restore" snapshot — refresh the list.
      versionsLoadedRef.current = false;
      setVersions(null);
      await loadVersions();
    } catch (err) {
      setVersionsError(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-4 md:px-6 md:py-6">
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Back to Hunter
      </Link>
      {/* M16: page-level load errors render inline — the workspace stays. */}
      {error && (
        <div
          className="flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
          role="alert"
        >
          <span className="flex items-start gap-2">
            <span className="material-symbols text-[18px] text-destructive">error</span>
            <span>{error}</span>
          </span>
          <button
            onClick={() => setError("")}
            aria-label="Dismiss"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          >
            <span className="material-symbols text-[16px]">close</span>
          </button>
        </div>
      )}
      {/* Page header */}
      <section className="flex flex-col justify-between gap-4 border-b border-border pb-4 md:flex-row md:items-center">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Project Spec #{projectId.slice(0, 8).toUpperCase()}
            </span>
            <span className="h-1 w-1 rounded-full bg-border" />
            {briefUpdatedAt ? (
              <span className="font-mono text-[11px] text-score-medium">
                Modified {new Date(briefUpdatedAt).toLocaleString()}
              </span>
            ) : (
              <span className="font-mono text-[11px] text-muted-foreground">
                Brief not saved yet
              </span>
            )}
            {/* Item 9: project-wide AI token usage */}
            {tokensUsed && (
              <>
                <span className="h-1 w-1 rounded-full bg-border" />
                <span
                  className="font-mono text-[11px] text-muted-foreground"
                  title="Total AI tokens logged for this project"
                >
                  {tokensUsed} tokens used
                </span>
              </>
            )}
            {/* Daily AI quota pre-429 warning */}
            <QuotaIndicator />
          </div>
          <h1 className="break-words font-serif text-2xl font-medium tracking-tight md:text-4xl">
            Refine Brief: {idea?.title ?? "Loading…"}
          </h1>
        </div>
        <div className="card-elevated flex items-center gap-2 self-start px-3 py-1.5 md:self-auto">
          <span className="h-2 w-2 animate-pulse rounded-full bg-score-medium" />
          <span className="text-sm text-muted-foreground">
            Stage 2 of 5 · Refining Feature Scope &amp; Positioning
          </span>
        </div>
      </section>

      {/* Two-pane workspace */}
      <div className="grid grid-cols-1 items-start gap-6 pb-10 min-[900px]:grid-cols-12">
        {/* LEFT — chat */}
        <section className="card-paper flex h-[70dvh] flex-col overflow-hidden md:h-[72dvh] min-[900px]:col-span-7 min-[900px]:h-[calc(100dvh-140px)] min-[900px]:min-h-[600px]">
          {/* Chat topbar */}
          <div className="flex items-center justify-between border-b border-border bg-card-elevated px-5 py-3.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="material-symbols text-[19px] text-primary">neurology</span>
              <span className="text-sm font-semibold">Synthesis Co-Pilot</span>
              {modelName && (
                <span className="hidden max-w-[220px] truncate rounded bg-secondary px-2 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline" title={modelName}>
                  {modelName}
                </span>
              )}
            </div>
            <button
              onClick={copyConversation}
              title="Copy conversation as markdown"
              aria-label="Copy conversation as markdown"
              className="btn-ghost !px-3 !py-1.5"
            >
              <span className="material-symbols text-[16px]">content_copy</span>
              <span className="hidden sm:inline">Copy conversation</span>
            </button>
          </div>

          {/* Message stream */}
          <div className="flex-1 space-y-5 overflow-y-auto bg-background/70 p-5">
            {analysisText && (
              <div className="my-1 flex items-center justify-center">
                <span className="rounded border border-border/60 bg-secondary/60 px-3 py-1 font-mono text-[11px] text-muted-foreground">
                  Grounded in the market analysis
                </span>
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="ml-auto flex max-w-[92%] items-start justify-end gap-3">
                  <div className="space-y-2 rounded-md border border-primary/25 bg-primary/[0.07] p-4 shadow-sm">
                    <div className="flex items-center justify-end gap-4">
                      {fmtTime(m.createdAt) && (
                        <span className="font-mono text-[11px] text-muted-foreground">{fmtTime(m.createdAt)}</span>
                      )}
                      <span className="text-[12px] font-semibold text-primary">You</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>
                  </div>
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded border border-primary/25 bg-secondary text-primary">
                    <span className="material-symbols text-[15px]">person</span>
                  </div>
                </div>
              ) : (
                <div key={i} className="flex max-w-[92%] items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-card-elevated text-primary shadow-sm">
                    <span className="material-symbols text-[15px]">auto_awesome</span>
                  </div>
                  <div className="card-elevated space-y-2 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[12px] font-semibold">Editorial Analyst</span>
                      {fmtTime(m.createdAt) && (
                        <span className="font-mono text-[11px] text-muted-foreground">{fmtTime(m.createdAt)}</span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>
                    {/* Item 7: retry the failed AI request */}
                    {failedAt === i && failedText && (
                      <button
                        onClick={retryFailed}
                        disabled={sending}
                        className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                      >
                        <span className="material-symbols text-[15px]">refresh</span>
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              )
            )}
            {sending && (
              <div className="flex max-w-[92%] items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-card-elevated text-primary shadow-sm">
                  <span className="material-symbols text-[15px]">auto_awesome</span>
                </div>
                <div className="card-elevated px-4 py-2.5 text-sm text-muted-foreground">
                  Thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Starter prompts + pinned input */}
          <div className="border-t border-border bg-card-elevated p-4">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible md:pb-0">
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(undefined, p)}
                  disabled={sending}
                  className="min-h-[44px] shrink-0 whitespace-nowrap rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>
            {/* M16: draft failures render inline here — the workspace stays. */}
            {draftError && (
              <div
                className="mb-3 flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm"
                role="alert"
              >
                <span className="flex items-start gap-2">
                  <span className="material-symbols text-[18px] text-destructive">error</span>
                  <span>{draftError}</span>
                </span>
                <button
                  onClick={() => setDraftError("")}
                  aria-label="Dismiss"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                >
                  <span className="material-symbols text-[16px]">close</span>
                </button>
              </div>
            )}
            <form onSubmit={send} className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder="Ask AI to refine features, pricing, or target audience…"
                className="input-paper max-h-[160px] min-h-[44px] resize-none !h-auto py-2.5"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="btn-primary h-[44px] shrink-0 !px-4 !py-2.5"
              >
                <span>Send</span>
                <span className="material-symbols text-[17px]">send</span>
              </button>
            </form>
            <div className="mt-2 flex items-center justify-between px-1 font-mono text-[11px] text-muted-foreground">
              <span>Shift + Enter for multiline</span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-score-high" /> Model responsive
              </span>
            </div>
          </div>
        </section>

        {/* RIGHT — living idea specification */}
        <aside
          className={`card-elevated space-y-6 p-4 transition-shadow duration-500 md:p-6 min-[900px]:col-span-5 min-[900px]:sticky min-[900px]:top-24 ${
            ideaJustUpdated ? "shadow-[0_0_0_2px_var(--primary)]" : ""
          }`}
        >
          {ideaJustUpdated && (
            <div className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
              Idea updated from your chat — watch the changes above
            </div>
          )}
          <div className="flex items-start justify-between border-b border-border pb-4">
            <div className="space-y-1">
              <span className="label-caps block text-primary">CANONICAL ARTIFACT</span>
              <h2 className="font-serif text-xl font-semibold">Living Idea Specification</h2>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="rounded border border-border bg-background px-2 py-1 font-mono text-[11px] text-muted-foreground">
                v0.4 Auto-Synced
              </span>
              <button
                onClick={() => setShowFullIdea(true)}
                title="Read the full idea"
                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              >
                <span className="material-symbols text-[16px]">open_in_full</span>
              </button>
            </div>
          </div>

          {/* Product identity */}
          <div className="space-y-1.5 rounded-md border border-border bg-background p-4">
            <span className="label-caps block text-[10px] text-muted-foreground">PRODUCT IDENTITY</span>
            <h3 className="font-serif text-lg font-medium">{idea?.title ?? "Loading…"}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{idea?.pitch}</p>
          </div>

          {/* Draft from analysis */}
          {idea && idea.features.length === 0 && analysisText && (
            <div>
              <button
                onClick={draftFromAnalysis}
                disabled={drafting}
                className="btn-secondary w-full"
              >
                <span className="material-symbols text-[18px]">auto_awesome</span>
                <span>{drafting ? "Drafting…" : "Draft idea from analysis"}</span>
              </button>
              <p className="mt-1 text-xs text-muted-foreground">
                The AI reads the Hunter market analysis and drafts features, pitch, audience, and monetization for you.
              </p>
            </div>
          )}

          {/* Core feature scope */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="label-caps text-muted-foreground">CORE FEATURE SCOPE</span>
              {idea && (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {idea.features.length} locked
                </span>
              )}
            </div>
            {!idea ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : idea.features.length > 0 ? (
              <ul className="space-y-2.5">
                {idea.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5 rounded-md p-2 transition-colors hover:bg-background">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary text-primary-foreground shadow-sm">
                      <span className="material-symbols text-[13px]">check</span>
                    </span>
                    <span className="flex-1 text-sm">{f}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No features yet — discuss them in chat, or draft them from the analysis above.
              </p>
            )}
          </div>

          {/* Audience + monetization bento */}
          {idea && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1 rounded-md border border-border bg-background p-3.5">
                <span className="label-caps block text-[10px] text-muted-foreground">TARGET AUDIENCE</span>
                <p className="text-[13px] leading-snug">{idea.targetAudience}</p>
              </div>
              <div className="space-y-1 rounded-md border border-border bg-background p-3.5">
                <span className="label-caps block text-[10px] text-muted-foreground">MONETIZATION</span>
                <p className="text-[13px] font-medium leading-snug">
                  {idea.monetization ?? "Undecided"}
                </p>
              </div>
            </div>
          )}

          {/* Refined synthesis note */}
          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <span className="label-caps text-muted-foreground">REFINED SYNTHESIS NOTE</span>
              <button
                onClick={saveBrief}
                disabled={sending}
                className="font-mono text-[11px] text-primary hover:underline disabled:opacity-50"
              >
                {briefUpdatedAt ? "Update saved brief" : "Save refined brief"}
              </button>
            </div>
            {briefContent ? (
              <div className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
                {briefContent}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                The AI writes the full brief from your discussion — or just say “save the brief” in chat.
              </p>
            )}
            {briefUpdatedAt && (
              <p className="font-mono text-[11px] text-score-high">
                Saved {new Date(briefUpdatedAt).toLocaleString()}
              </p>
            )}
          </div>

          {/* Decisions log */}
          <div className="border-t border-border pt-4">
            <button
              onClick={() => setDecisionsOpen((v) => !v)}
              className="flex w-full items-center justify-between"
            >
              <span className="label-caps text-muted-foreground">
                Decisions{decisions.length > 0 ? ` (${decisions.length})` : ""}
              </span>
              <span className="material-symbols text-[16px] text-muted-foreground">
                {decisionsOpen ? "expand_less" : "expand_more"}
              </span>
            </button>
            {decisionsOpen &&
              (decisions.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {decisions.map((d, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 font-mono text-[11.5px] text-muted-foreground"
                    >
                      <span className="material-symbols mt-0.5 text-[13px] text-score-high">
                        done
                      </span>
                      <span>
                        {d.createdAt ? fmtTime(d.createdAt) : ""}
                        {d.createdAt ? " — " : ""}
                        Updated: {d.keys.length > 0 ? d.keys.join(", ") : "idea"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  No applied updates yet — agreed changes from the chat will appear here.
                </p>
              ))}
          </div>

          {/* History — idea snapshots before each AI update, with restore */}
          <div className="border-t border-border pt-4">
            <button
              onClick={toggleVersions}
              className="flex w-full items-center justify-between"
            >
              <span className="label-caps text-muted-foreground">
                History{versions && versions.length > 0 ? ` (${versions.length})` : ""}
              </span>
              <span className="material-symbols text-[16px] text-muted-foreground">
                {versionsOpen ? "expand_less" : "expand_more"}
              </span>
            </button>
            {versionsOpen && (
              <div className="mt-2">
                {versionsLoading ? (
                  <p className="text-xs text-muted-foreground">Loading history…</p>
                ) : versionsError ? (
                  <div className="flex items-start justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
                    <span>{versionsError}</span>
                    <button
                      onClick={() => loadVersions()}
                      className="shrink-0 font-medium text-primary hover:underline"
                    >
                      Retry
                    </button>
                  </div>
                ) : versions && versions.length > 0 ? (
                  <ul className="space-y-1.5">
                    {versions.map((v) => (
                      <li
                        key={v.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium">{v.title}</p>
                          <p className="truncate font-mono text-[11px] text-muted-foreground">
                            {new Date(v.createdAt).toLocaleString()}
                            {v.note ? ` · ${v.note}` : ""}
                          </p>
                        </div>
                        <button
                          onClick={() => restoreVersion(v.id)}
                          disabled={restoringId !== null}
                          className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                        >
                          {restoringId === v.id ? "Restoring…" : "Restore"}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No earlier versions yet — a snapshot is saved here before every AI update.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Proceed CTA */}
          {ideaId && (
            <div className="pt-2">
              <Link
                href={`/stitch/${projectId}?idea=${ideaId}`}
                className="btn-primary w-full !py-3.5"
              >
                <span className="font-medium">Proceed to Stage 3: Design</span>
                <span className="material-symbols text-[18px]">arrow_forward</span>
              </Link>
              <p className="mt-2 text-center font-mono text-[11px] text-muted-foreground">
                Continues to the Design stage with this brief
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* Full idea reader modal */}
      {showFullIdea && idea && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowFullIdea(false)}
        >
          <div
            className="card-elevated max-h-[85vh] w-full max-w-2xl overflow-y-auto p-6 md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <h2 className="font-serif text-2xl font-semibold">{idea.title}</h2>
              <button
                onClick={() => setShowFullIdea(false)}
                className="btn-ghost !px-3 !py-1"
              >
                <span className="material-symbols text-[16px]">close</span>
                <span>Close</span>
              </button>
            </div>

            <div className="space-y-6 text-sm">
              <div>
                <h3 className="label-caps text-muted-foreground">Pitch</h3>
                <p className="mt-1 leading-relaxed">{idea.pitch}</p>
              </div>

              {idea.features.length > 0 && (
                <div>
                  <h3 className="label-caps text-muted-foreground">
                    Features ({idea.features.length})
                  </h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {idea.features.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="label-caps text-muted-foreground">Target audience</h3>
                <p className="mt-1">{idea.targetAudience}</p>
              </div>

              {idea.monetization && (
                <div>
                  <h3 className="label-caps text-muted-foreground">Monetization</h3>
                  <p className="mt-1">{idea.monetization}</p>
                </div>
              )}

              {briefContent && (
                <div>
                  <h3 className="label-caps text-muted-foreground">Refined brief</h3>
                  <div className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-background p-4 text-sm leading-relaxed">
                    {briefContent}
                  </div>
                </div>
              )}

              {analysisText && (
                <div>
                  <h3 className="label-caps text-muted-foreground">Original market analysis</h3>
                  <div className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-background p-4 text-sm leading-relaxed">
                    {analysisText}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Copy-confirmation toast */}
      {copied && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="card-elevated flex items-center gap-2 px-4 py-2.5 text-sm">
            <span className="material-symbols text-[16px] text-score-high">check</span>
            <span>Conversation copied as markdown</span>
          </div>
        </div>
      )}
    </main>
  );
}
