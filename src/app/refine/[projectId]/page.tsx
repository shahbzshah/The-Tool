"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

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

export default function RefinePage({ params }: { params: { projectId: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ideaId = searchParams.get("idea");
  const { projectId } = params;

  const [idea, setIdea] = useState<IdeaSnapshot | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [briefUpdatedAt, setBriefUpdatedAt] = useState<string | null>(null);
  const [briefContent, setBriefContent] = useState<string | null>(null);
  const [analysisText, setAnalysisText] = useState<string | null>(null);
  const [showFullIdea, setShowFullIdea] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [modelName, setModelName] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadIdea = useCallback(async () => {
    if (!ideaId) {
      setError("No idea selected.");
      return;
    }
    try {
      const res = await fetch(`/api/ideas/${ideaId}`);
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        setError("Idea not found.");
        return;
      }
      const data = await res.json();
      let features: string[] = [];
      try {
        features = JSON.parse(data.idea.features ?? "[]");
      } catch {
        // ignore
      }
      setIdea({ ...data.idea, features });

      // Check for an existing saved brief and the market analysis.
      try {
        const d = await fetch(`/api/docs?ideaId=${ideaId}`);
        const dd = await d.json();
        const brief = (dd.docs ?? []).find((x: any) => x.kind === "REFINED_BRIEF");
        if (brief) {
          setBriefUpdatedAt(brief.updatedAt);
          setBriefContent(brief.content);
        }
      } catch {
        // ignore
      }
      if (data.idea.project?.preferences) {
        setAnalysisText(data.idea.project.preferences);
      }

      // Restore saved conversation; a refresh no longer loses anything.
      try {
        const h = await fetch(
          `/api/refine/chat?projectId=${projectId}&ideaId=${ideaId}`
        );
        const hd = await h.json();
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
    } catch {
      setError("Could not load the idea.");
    }
  }, [ideaId, projectId, router]);

  useEffect(() => {
    loadIdea();
  }, [loadIdea]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e?: React.FormEvent, overrideText?: string) {
    if (e) e.preventDefault();
    const text = (overrideText ?? input).trim();
    if (!text || sending || !ideaId) return;
    setInput("");
    setSending(true);
    const now = new Date().toISOString();
    const next = [...messages, { role: "user" as const, content: text, createdAt: now }];
    setMessages(next);
    try {
      const res = await fetch("/api/refine/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ideaId, message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages([
          ...next,
          { role: "assistant", content: data.error ?? "Something went wrong. Try again.", createdAt: new Date().toISOString() },
        ]);
        return;
      }
      if (data.model) setModelName(String(data.model).split("/").pop() ?? "");
      setMessages([...next, { role: "assistant", content: data.reply, createdAt: new Date().toISOString() }]);
      if (data.idea) setIdea(data.idea);
      if (data.briefSaved) setBriefUpdatedAt(new Date().toISOString());
    } catch {
      setMessages([
        ...next,
        { role: "assistant", content: "Something went wrong. Try again.", createdAt: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
    }
  }

  function saveBrief() {
    send(undefined, "Save the refined brief now — write the complete file with everything we've decided.");
  }

  async function draftFromAnalysis() {
    if (!ideaId || drafting) return;
    setDrafting(true);
    setError("");
    try {
      const res = await fetch("/api/refine/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ideaId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Draft failed.");
      setIdea(data.idea);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.summary, createdAt: new Date().toISOString() },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Draft failed.");
    } finally {
      setDrafting(false);
    }
  }

  if (error) {
    return (
      <main className="mx-auto w-full max-w-[1200px] px-4 py-8">
        <p className="text-muted-foreground">{error}</p>
        <Link href="/" className="mt-2 inline-block text-sm underline">
          ← Back to Hunter
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 py-6">
      {/* Page header */}
      <section className="flex flex-col justify-between gap-4 border-b border-border pb-4 md:flex-row md:items-center">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
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
          </div>
          <h1 className="font-serif text-3xl font-medium tracking-tight md:text-4xl">
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
        <section className="card-paper flex h-[60vh] flex-col overflow-hidden min-[900px]:col-span-7 min-[900px]:h-[760px]">
          {/* Chat topbar */}
          <div className="flex items-center justify-between border-b border-border bg-card-elevated px-5 py-3.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="material-symbols text-[19px] text-primary">neurology</span>
              <span className="text-sm font-semibold">Synthesis Co-Pilot</span>
              {modelName && (
                <span className="max-w-[220px] truncate rounded bg-secondary px-2 py-0.5 font-mono text-[11px] text-muted-foreground" title={modelName}>
                  {modelName}
                </span>
              )}
            </div>
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
                  <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/[0.07] p-4 shadow-sm">
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

          {/* Pinned input */}
          <div className="border-t border-border bg-card-elevated p-4">
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
        <aside className="card-elevated space-y-6 p-6 min-[900px]:col-span-5 min-[900px]:sticky min-[900px]:top-24">
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
    </main>
  );
}
