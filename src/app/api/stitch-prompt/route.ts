import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chatJson, AIConfigError } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 120;

function parseFeatures(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json(
      { error: "projectId query param is required." },
      { status: 400 }
    );
  }
  const prompt = await prisma.stitchPrompt.findUnique({ where: { projectId } });
  return NextResponse.json({ prompt });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const projectId = String(body?.projectId ?? "").trim();
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required." },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { ideas: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const approvedIdea = project.ideas.find((i) => i.status === "approved");
    if (!approvedIdea) {
      return NextResponse.json(
        { error: "Approve an idea first (click 'I Like This! ✅')." },
        { status: 400 }
      );
    }

    const features = parseFeatures(approvedIdea.features);

    const system =
      "You are a UI/UX designer who writes expert prompts for Google Stitch (Google's AI UI design tool). You respond ONLY with valid JSON — no markdown fences, no commentary.";

    const user = `Create a copy-paste-ready prompt for Google Stitch based on this approved app idea.

App idea: ${approvedIdea.title}
Pitch: ${approvedIdea.pitch}
Key features: ${features.join("; ") || "n/a"}
Target audience: ${approvedIdea.targetAudience}
User preferences: ${project.preferences || "none"}

Requirements:
- "screens": 5-7 concrete screen names for this app (e.g. "Dashboard", "Settings").
- "colorScheme": specific palette direction (name actual colors/mood, e.g. "dark mode with emerald green accents").
- "style": visual style direction (e.g. "minimal, clean, card-based layout with generous whitespace").
- "components": 5-8 key UI components (e.g. "bottom nav bar", "line charts", "FAB button").
- "platform": mobile or web recommendation that best fits the idea.
- "promptText": the full Stitch prompt as ONE detailed paragraph (120-250 words) that weaves together the app type, all screens, the color scheme, style, components, and platform. It must be ready to paste directly into Stitch and produce a consistent, beautiful multi-screen design.

Respond with JSON:
{"appType": string, "screens": string[], "colorScheme": string, "style": string, "components": string[], "platform": string, "promptText": string}`;

    const data = await chatJson<{
      appType: string;
      screens: string[];
      colorScheme: string;
      style: string;
      components: string[];
      platform: string;
      promptText: string;
    }>(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 0.9, maxTokens: 1500 }
    );

    if (!data?.promptText || !Array.isArray(data?.screens)) {
      throw new Error("AI returned an invalid Stitch prompt structure.");
    }

    const asStringArr = (v: unknown) =>
      Array.isArray(v) ? v.map(String) : [];

    const prompt = await prisma.stitchPrompt.upsert({
      where: { projectId },
      create: {
        projectId,
        promptText: String(data.promptText),
        appType: String(data.appType ?? ""),
        screens: JSON.stringify(asStringArr(data.screens)),
        colorScheme: String(data.colorScheme ?? ""),
        style: String(data.style ?? ""),
        components: JSON.stringify(asStringArr(data.components)),
        platform: String(data.platform ?? ""),
      },
      update: {
        promptText: String(data.promptText),
        appType: String(data.appType ?? ""),
        screens: JSON.stringify(asStringArr(data.screens)),
        colorScheme: String(data.colorScheme ?? ""),
        style: String(data.style ?? ""),
        components: JSON.stringify(asStringArr(data.components)),
        platform: String(data.platform ?? ""),
      },
    });

    return NextResponse.json({ prompt });
  } catch (err) {
    if (err instanceof AIConfigError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    console.error("Stitch prompt generation failed:", err);
    const message =
      err instanceof Error ? err.message : "Failed to generate Stitch prompt.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
