import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chatJson, AIConfigError } from "@/lib/ai";
import {
  getCachedTrends,
  fetchCustomSource,
  formatTrendsForPrompt,
} from "@/lib/trends";
import type { GeneratedIdea } from "@/lib/constants";

export const runtime = "nodejs";
export const maxDuration = 60;

const IDEAS_PER_REQUEST = 3;

export async function POST(req: Request) {
  let body: {
    category?: string;
    preferences?: string;
    customSource?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const category = String(body?.category ?? "").trim();
  const preferences = String(body?.preferences ?? "").trim();
  const customSourceRaw = String(body?.customSource ?? "").trim();

  if (!category) {
    return NextResponse.json({ error: "Category is required." }, { status: 400 });
  }

  // SSE stream so the UI can show live progress instead of a dead spinner
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );

      try {
        // 1) Trends (cached — usually instant after first call)
        send("status", { message: "Fetching live trends (HN, Reddit, Lobsters, Show HN)…" });
        const trends = await getCachedTrends();
        send("status", {
          message: `${trends.length} trend signals loaded — generating ideas…`,
        });

        // 2) User-supplied inspiration source (URL or free text), fails soft
        let customContext = "";
        if (customSourceRaw) {
          const source = await fetchCustomSource(customSourceRaw);
          if (source) {
            customContext = `\nUser-provided inspiration source:\n"""\n${source}\n"""\nDraw on this material as extra context — it reflects something the user is specifically interested in.`;
          }
        }

        // 3) Duplicate detection — seed the prompt with recent idea titles
        const recentIdeas = await prisma.idea.findMany({
          orderBy: { createdAt: "desc" },
          select: { title: true, project: { select: { category: true } } },
          take: 30,
        });
        const existing =
          recentIdeas.length > 0
            ? `\n\nThe user has ALREADY seen these ideas — do not repeat them or close variations of them:\n${recentIdeas
                .map((i) => `- (${i.project.category}) ${i.title}`)
                .join("\n")}`
            : "";

        // 4) Generate with scoring
        const system =
          "You are a startup idea generator. You respond ONLY with valid JSON — no markdown fences, no commentary.";

        const user = `Generate ${IDEAS_PER_REQUEST} distinct, realistic, buildable app ideas.

Category: ${category}
${preferences ? `User preferences/constraints: ${preferences}` : ""}

${formatTrendsForPrompt(trends)}${customContext}${existing}

Rules:
- Each idea must be specific and concrete (no generic "Uber for X" fluff).
- Each must be buildable by a solo developer in weeks, not years.
- 4-6 features per idea.
- Vary the ideas: different angles within the category.
- Score every idea honestly (calibrate: 5 = average, 10 = exceptional) on novelty, feasibility, and marketDemand.

Respond with a JSON array of exactly ${IDEAS_PER_REQUEST} objects:
[{"title": string, "pitch": string (2-3 sentences), "features": string[], "targetAudience": string, "monetization": string, "scores": {"novelty": number (1-10), "feasibility": number (1-10), "marketDemand": number (1-10)}}]`;

        const ideas = await chatJson<GeneratedIdea[]>(
          [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          { temperature: 1.1, maxTokens: 4000 }
        );

        if (!Array.isArray(ideas) || ideas.length === 0) {
          throw new Error("AI returned no ideas.");
        }

        send("status", { message: "Saving ideas…" });

        const project = await prisma.project.create({
          data: {
            name: `${category} — ${new Date().toLocaleDateString()}`,
            category,
            preferences: preferences || null,
            ideas: {
              create: ideas.slice(0, IDEAS_PER_REQUEST).map((idea) => ({
                title: String(idea.title ?? "Untitled idea"),
                pitch: String(idea.pitch ?? ""),
                features: JSON.stringify(
                  Array.isArray(idea.features) ? idea.features.map(String) : []
                ),
                targetAudience: String(idea.targetAudience ?? ""),
                monetization: idea.monetization ? String(idea.monetization) : null,
                scores: idea.scores
                  ? JSON.stringify({
                      novelty: Number(idea.scores.novelty) || 5,
                      feasibility: Number(idea.scores.feasibility) || 5,
                      marketDemand: Number(idea.scores.marketDemand) || 5,
                    })
                  : null,
              })),
            },
          },
          include: { ideas: true },
        });

        send("done", { project });
      } catch (err) {
        console.error("Idea generation failed:", err);
        const message =
          err instanceof AIConfigError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to generate ideas.";
        send("error", { error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
