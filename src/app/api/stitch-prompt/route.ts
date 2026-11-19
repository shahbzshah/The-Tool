import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { chatJson, AIConfigError } from "@/lib/ai";
import { estimateTokens, logAiUsage } from "@/lib/usage";
import {
  parseStoryTitles,
  requiredScreensFromStories,
} from "@/lib/story-screens";

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

// The opportunity score is not a stored Idea field — it lives inside the
// pitch text ("Opportunity score 51.7/100 from your own idea research.").
// Extract it so it can be carried to Design instead of paraphrased away.
function extractOpportunityScore(pitch: string): string | null {
  const m = pitch.match(/Opportunity score\s*([\d.]+)\/100/i);
  return m ? m[1] : null;
}

// Significant words (4+ chars) of a value — used to check whether the AI
// prompt actually names that value, case-insensitively.
function significantWords(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);
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
  // The Design page also shows the Refine fields themselves ("From Refine"),
  // so return the approved idea's identity fields too — never invented,
  // only what Refine stored. The opportunity score lives inside the pitch.
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: auth.user.id },
    include: {
      ideas: {
        where: { status: "approved" },
        take: 1,
        select: {
          features: true,
          title: true,
          pitch: true,
          targetAudience: true,
          monetization: true,
        },
      },
    },
  });
  if (!project && !prompt) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  const approved = project?.ideas[0];
  const features = approved ? parseFeatures(approved.features) : [];
  const idea = approved
    ? {
        title: approved.title,
        pitch: approved.pitch,
        targetAudience: approved.targetAudience,
        monetization: approved.monetization ?? null,
        opportunityScore: extractOpportunityScore(approved.pitch),
      }
    : null;
  return NextResponse.json({ prompt, features, idea });
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
    // Monetisation and the opportunity score were never passed to the
    // prompt before, so the AI could not carry them to Design.
    const monetization = (approvedIdea.monetization ?? "").trim();
    const opportunityScore = extractOpportunityScore(approvedIdea.pitch);

    // User stories define the flows — and flows are what need screens.
    // Without them, designs ship without sign-up, login, or edit screens.
    const storiesDoc = await prisma.document.findUnique({
      where: { ideaId_kind: { ideaId: approvedIdea.id, kind: "USER_STORIES" } },
      select: { content: true },
    });
    const storyTitles = storiesDoc
      ? parseStoryTitles(storiesDoc.content)
      : [];
    const requiredScreens = requiredScreensFromStories(storyTitles);
    const storyList =
      storyTitles.length > 0
        ? storyTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")
        : "n/a — no USER_STORIES document yet; generate it from the Docs page for a complete screen list.";

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

    const requiredScreensBlock =
      requiredScreens.length > 0
        ? `REQUIRED SCREENS — derived from the user stories below. Every screen listed here MUST appear in "screens" and in "promptText". These are not optional: auth screens, create/edit forms, and settings screens come from the stories, not from the feature list:
${requiredScreens.map((s, i) => `${i + 1}. ${s}`).join("\n")}

USER STORIES — every story must have a corresponding screen:
${storyList}`
        : "";

    const user = `Create a copy-paste-ready prompt for Google Stitch based on this approved app idea.

App: ${approvedIdea.title}
Pitch: ${approvedIdea.pitch}
Target audience: ${approvedIdea.targetAudience}
Monetisation: ${monetization || "n/a"}
Opportunity score: ${opportunityScore ? `${opportunityScore}/100` : "n/a"}

COMPLETE FEATURE LIST — every feature below MUST be reflected in the screens and components you design. Do not drop any:
${featureList}

${requiredScreensBlock}

Design direction: ${project.preferences || "none specified — choose a clean, modern direction that fits the app type and audience"}

Requirements:
- "screens": ${requiredScreens.length > 0 ? "7-10" : "5-7"} concrete screen names for this app (e.g. "Dashboard", "Settings"). Cover ALL features above across these screens.${requiredScreens.length > 0 ? " The \"screens\" array MUST include every REQUIRED SCREEN listed above." : ""}
- "colorScheme": specific palette direction (name actual colors/mood, e.g. "dark mode with emerald green accents").
- "style": visual style direction (e.g. "minimal, clean, card-based layout with generous whitespace").
- "components": 5-8 key UI components (e.g. "bottom nav bar", "line charts", "FAB button") needed to implement the features.
${platformRequirement}- "promptText": the full Stitch prompt as ONE detailed paragraph (120-250 words) that weaves together the app type, all screens, the color scheme, style, components, and platform. It must be ready to paste directly into Stitch and produce a consistent, beautiful multi-screen design. The paragraph MUST name the target audience, the monetisation model, and EVERY feature in the list above — do not drop any feature, including security/privacy features. When an opportunity score is given above, the paragraph MUST state it.${requiredScreens.length > 0 ? " The paragraph MUST name every REQUIRED SCREEN." : ""}

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

    // Enforce the required screens even if the AI drops one: the recorded
    // screen list is what coverage checks against.
    const screens = asStringArr(data.screens);
    for (const required of requiredScreens) {
      if (!screens.some((s) => s.toLowerCase() === required.toLowerCase())) {
        screens.push(required);
      }
    }

    // Deterministic guard — the AI paraphrases and drops fields (verified:
    // audience, monetisation, opportunity score, and the security feature
    // never reached Design). Check the returned promptText for each one and
    // append a short sentence carrying it when missing. Only values that
    // actually exist are appended — "n/a" is never written into the prompt.
    let promptText = String(data.promptText);
    const lower = promptText.toLowerCase();
    const hasAnyWord = (text: string, words: string[]) =>
      words.some((w) => text.includes(w));
    // Strip trailing periods so an appended sentence never ends "backup.."
    // when the source value already ends with a full stop.
    const clean = (s: string) => s.trim().replace(/\.+$/, "");
    const additions: string[] = [];
    if (
      approvedIdea.targetAudience.trim() &&
      !hasAnyWord(lower, significantWords(approvedIdea.targetAudience))
    ) {
      additions.push(`Design for ${clean(approvedIdea.targetAudience)}.`);
    }
    // Monetisation: one matching word ("freemium") is not enough — the
    // free-tier terms are the point. Append the full model unless at
    // least half its significant words are already in the prompt — and
    // always append when a number in the model (e.g. "20 trades") is
    // missing, since a paraphrase can cover the words while dropping
    // the actual free-tier limit.
    if (monetization) {
      const monWords = significantWords(monetization);
      const monCovered = monWords.filter((w) => lower.includes(w)).length;
      const monNumbers = monetization.match(/\d[\d,.]*/g) ?? [];
      const numbersMissing = monNumbers.some((n) => !lower.includes(n));
      if (
        (monWords.length > 0 && monCovered < Math.ceil(monWords.length / 2)) ||
        numbersMissing
      ) {
        additions.push(`Monetisation: ${clean(monetization)}.`);
      }
    }
    const securityFeature = features.find((f) =>
      /secur|encrypt|privacy/i.test(f)
    );
    // Security: "encrypted" alone is not enough — both words "security"
    // AND "privacy" must be in the prompt. The matched feature text
    // itself may not contain them (live: it only said "encrypted cloud
    // backup"), so the appended sentence states them explicitly.
    if (
      securityFeature &&
      (!lower.includes("security") || !lower.includes("privacy"))
    ) {
      additions.push(
        `Also include this feature: ${clean(securityFeature)} — with data security and privacy controls for sensitive financial information.`
      );
    }
    if (opportunityScore && !lower.includes(opportunityScore)) {
      additions.push(`Opportunity score: ${opportunityScore}/100.`);
    }
    if (additions.length > 0) {
      promptText = `${promptText.trim()} ${additions.join(" ")}`;
    }

    const prompt = await prisma.stitchPrompt.upsert({
      where: { projectId },
      create: {
        projectId,
        promptText,
        appType: String(data.appType ?? ""),
        screens: JSON.stringify(screens),
        colorScheme: String(data.colorScheme ?? ""),
        style: String(data.style ?? ""),
        components: JSON.stringify(asStringArr(data.components)),
        platform: String(data.platform ?? ""),
      },
      update: {
        promptText,
        appType: String(data.appType ?? ""),
        screens: JSON.stringify(screens),
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
