"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type ChatMessage = { role: "user" | "assistant"; content: string };

type IdeaSnapshot = {
  id: string;
  title: string;
  pitch: string;
  features: string[];
  targetAudience: string;
  monetization: string | null;
};

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

  async function send(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || sending || !ideaId) return;
    setInput("");
    setSending(true);
    const next = [...messages, { role: "user" as const, content: text }];
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
          { role: "assistant", content: data.error ?? "Something went wrong. Try again." },
        ]);
        return;
      }
      setMessages([...next, { role: "assistant", content: data.reply }]);
      if (data.idea) setIdea(data.idea);
    } catch {
      setMessages([
        ...next,
        { role: "assistant", content: "Something went wrong. Try again." },
      ]);
    } finally {
      setSending(false);
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
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-16">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← Hunter
      </Link>
      <div className="mb-6 mt-2">
        <h1 className="font-serif text-3xl font-bold">Refine</h1>
        <p className="mt-2 text-muted-foreground">
          Discuss the analysis with the AI — add features, cut scope, sharpen the
          audience. Agreed changes update the idea automatically.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Chat */}
        <section className="flex min-h-[60vh] flex-col rounded-lg border border-border bg-card">
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            ))}
            {sending && (
              <div className="max-w-[85%] rounded-lg bg-muted px-4 py-2.5 text-sm text-muted-foreground">
                Thinking…
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <form onSubmit={send} className="flex gap-2 border-t border-border p-4">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. add offline mode, cut the social feed…"
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </section>

        {/* Idea snapshot */}
        <aside className="h-fit rounded-lg border border-border bg-card p-5 lg:sticky lg:top-4">
          <h2 className="font-serif text-lg font-semibold">The idea so far</h2>
          {!idea ? (
            <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="mt-3 space-y-3 text-sm">
              <div>
                <p className="font-medium">{idea.title}</p>
                <p className="mt-1 text-muted-foreground">{idea.pitch}</p>
              </div>
              {idea.features.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Features ({idea.features.length})
                  </h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                    {idea.features.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Audience
                </h3>
                <p className="mt-1 text-muted-foreground">{idea.targetAudience}</p>
              </div>
              {idea.monetization && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Monetization
                  </h3>
                  <p className="mt-1 text-muted-foreground">{idea.monetization}</p>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Strict pipeline: Refine → Design */}
      {ideaId && (
        <div className="mt-8 flex justify-end border-t border-border pt-6">
          <Link
            href={`/stitch/${projectId}?idea=${ideaId}`}
            className="rounded-md bg-primary px-8 py-3 font-medium text-primary-foreground"
          >
            Continue to Design →
          </Link>
        </div>
      )}
    </main>
  );
}
