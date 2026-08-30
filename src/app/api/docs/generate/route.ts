import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chat, AIConfigError } from "@/lib/ai";
import { DOC_KINDS } from "@/lib/constants";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const ideaId = String(body?.ideaId ?? "");
    const kind = String(body?.kind ?? "");

    const docKind = DOC_KINDS.find((d) => d.kind === kind);
    if (!docKind) {
      return NextResponse.json(
        { error: `Unknown document kind: ${kind}` },
        { status: 400 }
      );
    }

    const idea = await prisma.idea.findUnique({
      where: { id: ideaId },
      include: {
        project: { include: { stitchPrompt: true, uploads: true } },
      },
    });
    if (!idea) {
      return NextResponse.json({ error: "Idea not found." }, { status: 404 });
    }
    if (idea.status !== "approved") {
      return NextResponse.json(
        { error: "Approve this idea first (click 'I Like This! ✅')." },
        { status: 400 }
      );
    }

    // ---- Build the AI context from everything we know about the project ----
    let features: string[] = [];
    try {
      const parsed = JSON.parse(idea.features);
      if (Array.isArray(parsed)) features = parsed.map(String);
    } catch {
      // leave empty
    }

    const sp = idea.project.stitchPrompt;
    const stitchContext = sp
      ? `## Stitch Design Prompt
- App type: ${sp.appType}
- Platform: ${sp.platform}
- Color scheme: ${sp.colorScheme}
- Style: ${sp.style}
- Screens: ${sp.screens}
- Components: ${sp.components}
- Full prompt: ${sp.promptText}`
      : "## Stitch Design Prompt\nNo Stitch prompt generated yet.";

    const uploadContext =
      idea.project.uploads.length === 0
        ? "## Uploaded Stitch Exports\nNone uploaded yet — base the design system on the Stitch prompt above."
        : `## Uploaded Stitch Exports\n${idea.project.uploads
            .map(
              (u) =>
                `### ${u.filename} (${u.type})\n${u.content ?? "(binary screenshot — visual reference only, cannot be read as text)"}`
            )
            .join("\n\n")}`;

    const context = `# Project Context

## Approved App Idea
- Title: ${idea.title}
- Pitch: ${idea.pitch}
- Key features: ${features.join("; ") || "n/a"}
- Target audience: ${idea.targetAudience}
- Monetization: ${idea.monetization ?? "not defined"}
- Category: ${idea.project.category}
- User preferences: ${idea.project.preferences ?? "none"}

${stitchContext}

${uploadContext}`;

    const system = `You are a senior technical product manager, software architect, and technical writer. You produce complete, professional, immediately-usable markdown documents for software teams. Use proper markdown: headings, tables, lists, and code blocks where appropriate. Be specific to THIS project — never generic filler. Respond ONLY with the markdown document content, starting with a level-1 heading.`;

    const user = `${context}

# Task
Write the ${docKind.title} (${docKind.label}) for this project.

${docKind.instructions}`;

    const content = await chat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 0.7, maxTokens: 4000 }
    );

    const doc = await prisma.document.upsert({
      where: { ideaId_kind: { ideaId, kind } },
      create: { ideaId, kind, content },
      update: { content },
    });

    return NextResponse.json({ doc: { id: doc.id, kind: doc.kind } });
  } catch (err) {
    if (err instanceof AIConfigError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    console.error("Doc generation failed:", err);
    const message =
      err instanceof Error ? err.message : "Failed to generate document.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
