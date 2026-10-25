/**
 * Shared intake helpers: job serialization, draft parsing, and the
 * abandoned-job purge rule (plan §7). Frames are never sent to the
 * client — the job page needs only the thumbnail; the frames exist
 * solely for the vision call and are purged when research completes.
 */

import { prisma } from "@/lib/db";
import type { UnderstandingDraft } from "./understanding";

/** Statuses whose jobs count as abandoned after 24 hours (plan §7). */
export const ABANDONED_STATUSES = [
  "queued",
  "preparing",
  "understanding",
  "awaiting_confirm",
  "researching",
] as const;

/** Server-side caps on derived media payloads (the browser enforces the
 * original-file caps first: image ≤ 15 MB, video ≤ 100 MB / 10 min). */
export const MAX_IMAGE_DATA_URL_BYTES = 2 * 1024 * 1024;
/** Under Vercel's ~4.5 MB function request limit, so oversize payloads get
 * our plain-language error instead of a platform rejection. */
export const MAX_TOTAL_MEDIA_BYTES = 4 * 1024 * 1024;

export interface SerializedIntakeJob {
  id: string;
  source: string;
  status: string;
  originalName: string | null;
  linkUrl: string | null;
  thumbnail: string | null;
  draft: UnderstandingDraft;
  opportunityId: string | null;
  scanJobId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

type JobRow = {
  id: string;
  source: string;
  status: string;
  originalName: string | null;
  linkUrl: string | null;
  mediaJson: string | null;
  draftJson: string;
  opportunityId: string | null;
  scanJobId: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function parseDraft(draftJson: string): UnderstandingDraft {
  try {
    const d = JSON.parse(draftJson) as Partial<UnderstandingDraft>;
    return {
      topic: typeof d.topic === "string" ? d.topic : "",
      app_concept: typeof d.app_concept === "string" ? d.app_concept : null,
      audience: typeof d.audience === "string" ? d.audience : null,
      visible_text: Array.isArray(d.visible_text) ? d.visible_text.filter((x): x is string => typeof x === "string") : [],
      objects_and_actions: Array.isArray(d.objects_and_actions)
        ? d.objects_and_actions.filter((x): x is string => typeof x === "string")
        : [],
      keywords: Array.isArray(d.keywords) ? d.keywords.filter((x): x is string => typeof x === "string") : [],
      confidence: typeof d.confidence === "number" ? d.confidence : null,
      needs_user_help: d.needs_user_help === true,
      help_question: typeof d.help_question === "string" ? d.help_question : null,
      motion_summary: typeof d.motion_summary === "string" ? d.motion_summary : null,
      visual_failed: d.visual_failed === true,
    };
  } catch {
    return {
      topic: "",
      app_concept: null,
      audience: null,
      visible_text: [],
      objects_and_actions: [],
      keywords: [],
      confidence: null,
      needs_user_help: true,
      help_question: "What is this about, in one line?",
    };
  }
}

export function serializeIntakeJob(job: JobRow): SerializedIntakeJob {
  let thumbnail: string | null = null;
  try {
    const m = job.mediaJson ? (JSON.parse(job.mediaJson) as { thumbnail?: unknown }) : null;
    thumbnail = typeof m?.thumbnail === "string" ? m.thumbnail : null;
  } catch {
    thumbnail = null;
  }
  return {
    id: job.id,
    source: job.source,
    status: job.status,
    originalName: job.originalName,
    linkUrl: job.linkUrl,
    thumbnail,
    draft: parseDraft(job.draftJson),
    opportunityId: job.opportunityId,
    scanJobId: job.scanJobId,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

/** Delete a user's abandoned jobs (older than 24h, never confirmed). */
export async function purgeAbandonedJobs(userId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
  const res = await prisma.intakeJob.deleteMany({
    where: {
      userId,
      status: { in: [...ABANDONED_STATUSES] },
      createdAt: { lt: cutoff },
    },
  });
  return res.count;
}

/**
 * Validate a client-supplied data-URL image. Returns its byte size.
 * Rejects anything that isn't a JPEG/PNG/WebP data URL or is over cap —
 * the server never trusts the browser's size checks alone.
 */
export function validateDataUrlImage(url: unknown): number {
  if (typeof url !== "string") throw new Error("Upload images must be data URLs.");
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if (!m) throw new Error("Upload images must be JPEG, PNG, or WebP data URLs.");
  const bytes = Math.floor((m[2].length * 3) / 4);
  if (bytes > MAX_IMAGE_DATA_URL_BYTES) {
    throw new Error("One image is over the 2 MB server cap. It was not saved.");
  }
  return bytes;
}
