import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { DOC_KINDS } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KIND_META = new Map(DOC_KINDS.map((d) => [d.kind, d]));

/* ------------------------------------------------------------------ */
/* Minimal markdown renderer (headings, bold/italic, lists, code,      */
/* fenced code blocks). HTML-escaped first, so shared content can't    */
/* inject markup.                                                      */
/* ------------------------------------------------------------------ */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(s: string): string {
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(
    /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return out;
}

function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let inFence = false;
  let fence: string[] = [];
  let list: "ul" | "ol" | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (list) {
      html.push(`</${list}>`);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim().startsWith("```")) {
      if (inFence) {
        html.push(
          `<pre><code>${escapeHtml(fence.join("\n"))}</code></pre>`
        );
        fence = [];
        inFence = false;
      } else {
        flushParagraph();
        closeList();
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      fence.push(line);
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }
    const h = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushParagraph();
      closeList();
      const level = h[1].length;
      html.push(`<h${level + 1}>${renderInline(h[2])}</h${level + 1}>`);
      continue;
    }
    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      if (list !== "ul") {
        closeList();
        list = "ul";
        html.push("<ul>");
      }
      html.push(`<li>${renderInline(bullet[1])}</li>`);
      continue;
    }
    const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (numbered) {
      flushParagraph();
      if (list !== "ol") {
        closeList();
        list = "ol";
        html.push("<ol>");
      }
      html.push(`<li>${renderInline(numbered[1])}</li>`);
      continue;
    }
    paragraph.push(trimmed);
  }
  if (inFence) {
    html.push(`<pre><code>${escapeHtml(fence.join("\n"))}</code></pre>`);
  }
  flushParagraph();
  closeList();
  return html.join("\n");
}

/* ------------------------------------------------------------------ */

type ShareData = {
  projectName: string;
  idea: {
    title: string;
    pitch: string;
    features: string[];
    targetAudience: string;
    monetization: string | null;
  } | null;
  docs: { kind: string; title: string; label: string; content: string }[];
};

async function loadShare(token: string): Promise<ShareData | null> {
  const record = await prisma.shareToken.findUnique({
    where: { token },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          ideas: {
            where: { status: "approved" },
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: {
              id: true,
              title: true,
              pitch: true,
              features: true,
              targetAudience: true,
              monetization: true,
            },
          },
        },
      },
    },
  });
  if (!record || !record.project) return null;
  if (record.expiresAt && record.expiresAt < new Date()) return null;

  const idea = record.project.ideas[0] ?? null;

  let docs: ShareData["docs"] = [];
  if (idea) {
    const rows = await prisma.document.findMany({
      where: { ideaId: idea.id },
      select: { kind: true, content: true },
    });
    const order = new Map(DOC_KINDS.map((d, i) => [d.kind, i]));
    docs = rows
      .sort(
        (a, b) =>
          (order.get(a.kind) ?? 999) - (order.get(b.kind) ?? 999)
      )
      .map((r) => ({
        kind: r.kind,
        title: KIND_META.get(r.kind)?.title ?? r.kind,
        label: KIND_META.get(r.kind)?.label ?? r.kind,
        content: r.content,
      }));
  }

  let features: string[] = [];
  if (idea?.features) {
    try {
      const parsed = JSON.parse(idea.features);
      if (Array.isArray(parsed)) {
        features = parsed.filter((f) => typeof f === "string");
      }
    } catch {
      features = [];
    }
  }

  return {
    projectName: record.project.name,
    idea: idea
      ? {
          title: idea.title,
          pitch: idea.pitch,
          features,
          targetAudience: idea.targetAudience,
          monetization: idea.monetization,
        }
      : null,
    docs,
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await loadShare(token);
  if (!data) notFound();

  const { projectName, idea, docs } = data;

  return (
    <main className="mx-auto max-w-[860px] px-4 py-10 md:px-8 md:py-16">
      {/* Masthead */}
      <header className="mb-10 text-center">
        <p className="label-caps mb-3 text-primary">Shared from The-Tool</p>
        <h1 className="font-serif text-4xl tracking-tight text-foreground md:text-5xl">
          {projectName}
        </h1>
      </header>

      {/* Approved idea */}
      {idea ? (
        <section className="card-elevated mb-8 p-6 md:p-8">
          <p className="label-caps mb-2 text-muted-foreground">
            The approved idea
          </p>
          <h2 className="mb-3 font-serif text-2xl text-foreground">
            {idea.title}
          </h2>
          <p className="text-[1.05rem] leading-relaxed text-foreground/90">
            {idea.pitch}
          </p>

          {idea.features.length > 0 && (
            <div className="mt-6">
              <p className="label-caps mb-2 text-muted-foreground">
                Key features
              </p>
              <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-foreground/90">
                {idea.features.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
            <div>
              <p className="label-caps mb-1.5 text-muted-foreground">
                Target audience
              </p>
              <p className="text-sm leading-relaxed text-foreground/90">
                {idea.targetAudience}
              </p>
            </div>
            {idea.monetization && (
              <div>
                <p className="label-caps mb-1.5 text-muted-foreground">
                  Monetization
                </p>
                <p className="text-sm leading-relaxed text-foreground/90">
                  {idea.monetization}
                </p>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="card-paper mb-8 p-6 text-center md:p-8">
          <p className="text-sm text-muted-foreground">
            This project has no approved idea yet.
          </p>
        </section>
      )}

      {/* Documents */}
      <section className="mb-10">
        <p className="label-caps mb-4 text-muted-foreground">
          Generated documents ({docs.length})
        </p>
        {docs.length === 0 ? (
          <div className="card-paper p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No documents have been generated for this idea yet.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {docs.map((doc) => (
              <article key={doc.kind} className="card-paper p-6 md:p-8">
                <p className="label-caps mb-1 text-primary">{doc.label}</p>
                <h3 className="mb-4 font-serif text-xl text-foreground">
                  {doc.title}
                </h3>
                <div
                  className="share-doc-body"
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(doc.content),
                  }}
                />
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-border pt-6 text-center">
        <p className="text-sm text-muted-foreground">
          This page was generated with The-Tool — from idea to full
          documentation in one pipeline.
        </p>
        <Link
          href="/"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <span className="material-symbols text-[18px]">arrow_forward</span>
          Try it yourself
        </Link>
      </footer>
    </main>
  );
}
