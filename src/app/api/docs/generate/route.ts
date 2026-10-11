import { NextResponse } from "next/server";
import { generateDocForIdea } from "@/lib/docgen";
import { AIConfigError } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const ideaId = String(body?.ideaId ?? "");
    const kind = String(body?.kind ?? "");

    const doc = await generateDocForIdea(ideaId, kind);
    return NextResponse.json({ doc });
  } catch (err) {
    if (err instanceof AIConfigError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    const message =
      err instanceof Error ? err.message : "Failed to generate document.";
    const status = message.includes("not found") || message.includes("Approve") ? 400 : 500;
    console.error("Doc generation failed:", err);
    return NextResponse.json({ error: message }, { status });
  }
}

