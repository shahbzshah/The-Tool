import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  buildDocMessages,
  generateDocForIdea,
  snapshotDocVersion,
} from "@/lib/docgen";
import { requireUser } from "@/lib/auth";
import { checkAiQuota } from "@/lib/ai-quota";
import { estimateTokens, logAiUsage } from "@/lib/usage";
import { AIConfigError, chatStream } from "@/lib/ai";
import { DOC_KINDS } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  // Auth + quota go before everything — especially before the SSE
  // stream starts, since headers can't be re-written mid-stream.
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  if (!(await checkAiQuota(auth.user.id))) {
    return NextResponse.json(
      { error: "Daily AI quota exceeded." },
      { status: 429 }
    );
  }

  try {
    const stream = new URL(req.url).searchParams.get("stream") === "1";
    const body = await req.json();
    const ideaId = String(body?.ideaId ?? "");
    const kind = String(body?.kind ?? "");

    // Ownership check: the idea must belong to the caller's project.
    const owned = await prisma.idea.findFirst({
      where: { id: ideaId, project: { userId: auth.user.id } },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ error: "Idea not found." }, { status: 404 });
    }

    if (!stream) {
      const doc = await generateDocForIdea(ideaId, kind, {
        userId: auth.user.id,
      });
      return NextResponse.json({ doc });
    }

    // Deterministic kinds render from project data — no AI call. Stream the
    // rendered doc as a single token so the client's SSE loop works unchanged.
    const kindDef = DOC_KINDS.find((d) => d.kind === kind);
    if (kindDef?.deterministic) {
      const doc = await generateDocForIdea(ideaId, kind, {
        userId: auth.user.id,
      });
      const detEncoder = new TextEncoder();
      const detReadable = new ReadableStream({
        start(controller) {
          controller.enqueue(
            detEncoder.encode(
              `data: ${JSON.stringify({ token: doc.content })}\n\n`
            )
          );
          controller.enqueue(
            detEncoder.encode(
              `data: ${JSON.stringify({ done: true, docId: doc.id, durationMs: doc.durationMs })}\n\n`
            )
          );
          controller.close();
        },
      });
      return new Response(detReadable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    // Streaming mode: Server-Sent Events, one {token} per chunk,
    // then a final {done:true} once the doc is saved.
    const { messages } = await buildDocMessages(ideaId, kind);
    const idea = await prisma.idea.findUnique({
      where: { id: ideaId },
      select: { projectId: true },
    });
    const startedAt = Date.now();
    const encoder = new TextEncoder();
    let full = "";

    const readable = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)
          );
        try {
          for await (const token of chatStream(messages, {
            temperature: 0.7,
            maxTokens: 3500,
          })) {
            full += token;
            send({ token });
          }
          // Log usage and snapshot the outgoing content before overwriting.
          const tokensIn = estimateTokens(
            messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0)
          );
          await logAiUsage({
            userId: auth.user.id,
            projectId: idea?.projectId ?? null,
            kind: "docgen",
            tokensIn,
            tokensOut: estimateTokens(full.length),
          });
          await snapshotDocVersion(ideaId, kind);
          const doc = await prisma.document.upsert({
            where: { ideaId_kind: { ideaId, kind } },
            create: { ideaId, kind, content: full },
            update: { content: full },
          });
          send({ done: true, docId: doc.id, durationMs: Date.now() - startedAt });
        } catch (err) {
          const message =
            err instanceof AIConfigError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Generation failed.";
          send({ error: message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    if (err instanceof AIConfigError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    const message =
      err instanceof Error ? err.message : "Failed to generate document.";
    const status =
      message.includes("not found") || message.includes("Approve") ? 400 : 500;
    console.error("Doc generation failed:", err);
    return NextResponse.json({ error: message }, { status });
  }
}
