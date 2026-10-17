import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { chatJson, AIConfigError } from "@/lib/ai";
import { estimateTokens, logAiUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

function parseFeatures(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  if (IS_BUILD) {
    return NextResponse.json({ prompt: null, building: true });
  }
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json(
      { error: "projectId query param is required." },
      { status: 400 }
    );
  }
  // C5: can't findUnique with a relation filter — findFirst on
  // { projectId, project: { userId } } instead.
  const prompt = await prisma.stitchPrompt.findFirst({
    where: { projectId, project: { userId: auth.user.id } },
  });
  // Feature list from the approved idea — the Design page uses it for the
  // feature-coverage checklist (all derived from real project data).
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: auth.user.id },
    include: {
      ideas: {
        where: { status: "approved" },
        take: 1,
        select: { features: true },
      },
    },
  });
  if (!project && !prompt) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  const features = project?.ideas[0] ? parseFeatures(project.ideas[0].features) : [];
  return NextResponse.json({ prompt, features });
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  try {
    const body = await req.json();
    const projectId = String(body?.projectId ?? "").trim();
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required." },
        { status: 400 }
      );
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: auth.user.id },
      include: { ideas: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const approvedIdea = project.ideas.find((i) => i.status === "approved");
    if (!approvedIdea) {
      return NextResponse.json(
        { error: "Approve an idea first (click 'I Like This!')." },
        { status: 400 }
      );
    }

    const features = parseFeatures(approvedIdea.features);

    const system =
      "You are a UI/UX designer who writes expert prompts for Google Stitch (Google's AI UI design tool). You respond ONLY with valid JSON — no markdown fences, no commentary.";

    const featureList =
      features.length > 0
        ? features.map((f, i) => `${i + 1}. ${f}`).join("\n")
        : "n/a";

    // Play Store opportunities are mobile apps — don't let the AI guess web.
    const platformRequirement =
      project.platform === "mobile"
        ? '- "platform": MUST be "mobile (Android + iOS native app)". This is a Play Store opportunity — a mobile app, not a website.\n'
        : '- "platform": mobile or web recommendation that best fits the idea.\n';

    const user = `Create a copy-paste-ready prompt for Google Stitch based on this approved app idea.

App: ${approvedIdea.title}
Pitch: ${approvedIdea.pitch}
Target audience: ${approvedIdea.targetAudience}

COMPLETE FEATURE LIST — every feature below MUST be reflected in the screens and components you design. Do not drop any:
${featureList}

Design direction: ${project.preferences || "none specified — choose a clean, modern direction that fits the app type and audience"}

Requirements:
- "screens": 5-7 concrete screen names for this app (e.g. "Dashboard", "Settings"). Cover ALL features above across these screens.
- "colorScheme": specific palette direction (name actual colors/mood, e.g. "dark mode with emerald green accents").
- "style": visual style direction (e.g. "minimal, clean, card-based layout with generous whitespace").
- "components": 5-8 key UI components (e.g. "bottom nav bar", "line charts", "FAB button") needed to implement the features.
${platformRequirement}- "promptText": the full Stitch prompt as ONE detailed paragraph (120-250 words) that weaves together the app type, all screens, the color scheme, style, components, and platform. It must be ready to paste directly into Stitch and produce a consistent, beautiful multi-screen design.

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

    // Track NVIDIA token consumption (estimated — the API returns no usage).
    await logAiUsage({
      userId: auth.user.id,
      projectId,
      kind: "design",
      tokensIn: estimateTokens(system.length + user.length),
      tokensOut: estimateTokens(JSON.stringify(data).length),
    });

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
