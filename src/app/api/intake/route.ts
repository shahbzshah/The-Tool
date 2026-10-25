import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { appDetails } from "@/lib/hunter/scraper";
import { understandMedia, type UnderstandingDraft } from "@/lib/hunter/understanding";
import {
  purgeAbandonedJobs,
  serializeIntakeJob,
  validateDataUrlImage,
  MAX_TOTAL_MEDIA_BYTES,
} from "@/lib/hunter/intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/intake — create an intake job from one of the three doors
 * (plan §1, §7). Auth required; type + size validated server-side too.
 *
 * Body variants:
 * - { type: "own-idea", name, whatItDoes?, audience? }
 * - { type: "link", url, caption? }
 * - { type: "upload", kind: "image"|"video", images: [dataUrl...],
 *     contactSheet?, originalName?, mimeType?, sizeBytes?, oneLiner? }
 *
 * Uploads run the vision call inline (20s cap inside understandMedia)
 * and land in awaiting_confirm — or in the help gate when vision fails.
 * Links and typed ideas skip understanding and go straight to the draft.
 */

function nonVisionDraft(partial: Partial<UnderstandingDraft>): UnderstandingDraft {
  return {
    topic: partial.topic ?? "",
    app_concept: partial.app_concept ?? null,
    audience: partial.audience ?? null,
    visible_text: partial.visible_text ?? [],
    objects_and_actions: partial.objects_and_actions ?? [],
    keywords: partial.keywords ?? [],
    confidence: null,
    needs_user_help: false,
    help_question: null,
    motion_summary: null,
  };
}

function firstSentence(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const m = /^[^.!?\n]{10,200}[.!?]?/.exec(cleaned);
  return (m ? m[0] : cleaned).slice(0, 200).trim();
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": "The-Tool intake (link preview)" },
  });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  return res.text();
}

function parseHtmlMeta(html: string): { title: string | null; description: string | null } {
  const title = /<title[^>]*>([^<]{1,300})<\/title>/i.exec(html)?.[1]?.trim() ?? null;
  const desc =
    /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']{1,500})["']/i.exec(html)?.[1]?.trim() ??
    /<meta[^>]+content=["']([^"']{1,500})["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i.exec(html)?.[1]?.trim() ??
    null;
  return { title, description: desc };
}

async function buildLinkDraft(
  url: string,
  caption: string | null
): Promise<{ draft: UnderstandingDraft; thumbnail: string | null; linkUrl: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("That doesn't look like a link. Paste a full URL starting with https://");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) links can be imported.");
  }
  const host = parsed.hostname.toLowerCase();

  // Play Store: full import — the app's own title, rating, installs and
  // description, straight from Play. No keyword scan happens here; the
  // draft still goes through the same confirm → research path.
  if (host === "play.google.com" || host.endsWith(".play.google.com")) {
    const pkg = parsed.searchParams.get("id");
    if (!pkg) throw new Error("That Play Store link has no app in it (no id= parameter).");
    const detail = await appDetails(pkg);
    if (!detail) throw new Error("Couldn't read that Play Store app — check the link and try again.");
    return {
      draft: nonVisionDraft({
        topic: detail.title,
        app_concept: detail.description ? detail.description.slice(0, 500) : null,
        keywords: [detail.title],
      }),
      thumbnail: detail.icon ?? null,
      linkUrl: url,
    };
  }

  // Walled links (plan §8): one honest attempt is pointless — these
  // domains need a login to read. The caption IS the topic source.
  if (/(^|\.)(facebook\.com|instagram\.com)$/.test(host)) {
    if (!caption || !caption.trim()) {
      throw new Error(
        "Facebook and Instagram block automatic reads. Paste the caption text along with the link and I'll research from that instead."
      );
    }
    const topic = firstSentence(caption);
    return {
      draft: nonVisionDraft({
        topic,
        app_concept: caption.trim().slice(0, 500),
        keywords: [topic],
      }),
      thumbnail: null,
      linkUrl: url,
    };
  }

  // YouTube: oEmbed needs no API key and returns the real title/author.
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) {
    try {
      const raw = await fetchText(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
        5000
      );
      const o = JSON.parse(raw) as { title?: unknown; author_name?: unknown; thumbnail_url?: unknown };
      if (typeof o.title !== "string" || !o.title.trim()) throw new Error("empty oEmbed");
      return {
        draft: nonVisionDraft({
          topic: o.title.trim(),
          app_concept:
            typeof o.author_name === "string" ? `Video by ${o.author_name}` : null,
          keywords: [o.title.trim()],
        }),
        thumbnail: typeof o.thumbnail_url === "string" ? o.thumbnail_url : null,
        linkUrl: url,
      };
    } catch {
      throw new Error(
        "Couldn't read that YouTube link. Paste the video title and a line about it, or upload the video itself."
      );
    }
  }

  // Generic page: title + meta description, one attempt.
  try {
    const html = await fetchText(url, 5000);
    const { title, description } = parseHtmlMeta(html);
    if (!title) throw new Error("no title");
    return {
      draft: nonVisionDraft({
        topic: title,
        app_concept: description,
        keywords: [title],
      }),
      thumbnail: null,
      linkUrl: url,
    };
  } catch {
    throw new Error(
      "Couldn't read that page. Paste its title, or type the idea directly instead."
    );
  }
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  // Opportunistic 24h purge (plan §7) — no scheduler needed for the rule
  // to hold; the cron-signed /api/intake/purge endpoint exists for it too.
  try {
    await purgeAbandonedJobs(user.id);
  } catch (err) {
    console.warn("[intake] opportunistic purge failed:", err);
  }

  const body = await req.json().catch(() => ({}));
  const type = body?.type;

  try {
    if (type === "own-idea") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) return NextResponse.json({ error: "Give the idea a name first." }, { status: 400 });
      const draft = nonVisionDraft({
        topic: name,
        app_concept: typeof body.whatItDoes === "string" ? body.whatItDoes.trim() || null : null,
        audience: typeof body.audience === "string" ? body.audience.trim() || null : null,
        keywords: [name],
      });
      const job = await prisma.intakeJob.create({
        data: { userId: user.id, source: "own-idea", status: "awaiting_confirm", draftJson: JSON.stringify(draft) },
      });
      return NextResponse.json({ job: serializeIntakeJob(job) }, { status: 201 });
    }

    if (type === "link") {
      const url = typeof body.url === "string" ? body.url.trim() : "";
      if (!url) return NextResponse.json({ error: "Paste a link first." }, { status: 400 });
      const caption = typeof body.caption === "string" ? body.caption : null;
      const { draft, thumbnail, linkUrl } = await buildLinkDraft(url, caption);
      const job = await prisma.intakeJob.create({
        data: {
          userId: user.id,
          source: "link",
          status: "awaiting_confirm",
          linkUrl,
          caption: caption?.trim() ? caption.trim().slice(0, 2000) : null,
          mediaJson: thumbnail ? JSON.stringify({ thumbnail, frames: [] }) : null,
          draftJson: JSON.stringify(draft),
        },
      });
      return NextResponse.json({ job: serializeIntakeJob(job) }, { status: 201 });
    }

    if (type === "upload") {
      const kind = body.kind === "video" ? "video" : "image";
      const images = Array.isArray(body.images) ? body.images : [];
      const contactSheet = typeof body.contactSheet === "string" ? body.contactSheet : null;
      if (kind === "image" && images.length !== 1) {
        return NextResponse.json({ error: "Upload one image." }, { status: 400 });
      }
      if (kind === "video" && (!contactSheet || images.length < 1)) {
        return NextResponse.json({ error: "Upload a video's contact sheet and frames." }, { status: 400 });
      }
      // Server-side size validation (the browser enforces the original
      // file caps first; these guard the derived payloads).
      let total = 0;
      const visionImages: string[] = [];
      if (kind === "video" && contactSheet) {
        total += validateDataUrlImage(contactSheet);
        visionImages.push(contactSheet);
      }
      for (const img of images) {
        total += validateDataUrlImage(img);
        visionImages.push(img);
      }
      if (total > MAX_TOTAL_MEDIA_BYTES) {
        return NextResponse.json({ error: "Those images are too large to process. Try fewer frames." }, { status: 400 });
      }
      const originalName = typeof body.originalName === "string" ? body.originalName.slice(0, 200) : null;
      const oneLiner = typeof body.oneLiner === "string" ? body.oneLiner.trim() : "";
      const fallbackText = oneLiner || originalName || "";
      const { draft } = await understandMedia({
        images: visionImages,
        kind,
        fallbackText,
      });
      const thumbnail = kind === "video" ? contactSheet : images[0];
      const job = await prisma.intakeJob.create({
        data: {
          userId: user.id,
          source: "upload",
          status: "awaiting_confirm",
          originalName,
          mimeType: typeof body.mimeType === "string" ? body.mimeType.slice(0, 100) : null,
          sizeBytes: typeof body.sizeBytes === "number" ? Math.floor(body.sizeBytes) : null,
          mediaJson: JSON.stringify({
            thumbnail,
            frames: kind === "video" ? images : [],
          }),
          draftJson: JSON.stringify(draft),
        },
      });
      return NextResponse.json({ job: serializeIntakeJob(job) }, { status: 201 });
    }

    return NextResponse.json({ error: "Unknown intake type." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Intake failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
