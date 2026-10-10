import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeIdea } from "@/lib/hunter/ai";

/**
 * POST /api/hunter/ideas/analyze — AI deep-dive on a trending idea.
 * Body: { id: string } (TrendIdea id). Result is cached on the idea.
 */
export async function POST(req: Request) {
  const { id } = await req.json().catch(() => ({}));
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Missing idea id." }, { status: 400 });
  }

  const idea = await prisma.trendIdea.findUnique({ where: { id } });
  if (!idea) {
    return NextResponse.json({ error: "Idea not found." }, { status: 404 });
  }

  // Return cached analysis if present.
  if (idea.analysis) {
    return NextResponse.json({ analysis: JSON.parse(idea.analysis), cached: true });
  }

  try {
    const analysis = await analyzeIdea({
      title: idea.title,
      source: idea.source,
      hotness: idea.hotness,
      url: idea.url ?? "",
      text: idea.text ?? "",
    });
    await prisma.trendIdea.update({
      where: { id },
      data: { analysis: JSON.stringify(analysis) },
    });
    return NextResponse.json({ analysis, cached: false });
  } catch (err) {
    console.error("idea analysis failed:", err);
    return NextResponse.json(
      { error: "AI analysis failed. Check your API key configuration." },
      { status: 502 }
    );
  }
}
