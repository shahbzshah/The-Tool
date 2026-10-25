import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseDraft, serializeIntakeJob } from "@/lib/hunter/intake";
import { runIntakeResearch } from "@/lib/hunter/intakeResearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Three keyword scans + the evidence build can take minutes; same window
// the scans route already uses.
export const maxDuration = 300;

/**
 * POST /api/intake/:id/research — confirm and run the §6 wiring
 * (plan §7). Idempotent: a done job returns its opportunity, a
 * researching job returns its status, so a double-tap cannot double-scan
 * and exactly one opportunity is ever created per job.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const job = await prisma.intakeJob.findFirst({ where: { id: params.id, userId: auth.user.id } });
  if (!job) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (job.status === "done" && job.opportunityId) {
    return NextResponse.json({ job: serializeIntakeJob(job), opportunityId: job.opportunityId });
  }
  if (job.status === "researching") {
    return NextResponse.json({ job: serializeIntakeJob(job) });
  }
  if (job.status !== "awaiting_confirm" && job.status !== "failed") {
    return NextResponse.json(
      { error: "This job isn't ready for research yet." },
      { status: 409 }
    );
  }

  const draft = parseDraft(job.draftJson);
  if (!draft.topic.trim()) {
    return NextResponse.json(
      { error: "Add a topic first — the engine never researches a blank draft." },
      { status: 400 }
    );
  }
  const keywords = draft.keywords.map((k) => k.trim()).filter(Boolean);
  if (!keywords.length) {
    return NextResponse.json(
      { error: "Add at least one keyword first." },
      { status: 400 }
    );
  }

  let thumbnail: string | null = null;
  try {
    const m = job.mediaJson ? (JSON.parse(job.mediaJson) as { thumbnail?: unknown }) : null;
    thumbnail = typeof m?.thumbnail === "string" ? m.thumbnail : null;
  } catch {
    thumbnail = null;
  }

  await prisma.intakeJob.update({
    where: { id: job.id },
    data: { status: "researching", error: null },
  });

  try {
    const { opportunityId, scanJobId } = await runIntakeResearch({
      jobId: job.id,
      userId: auth.user.id,
      source: job.source,
      linkUrl: job.linkUrl,
      thumbnail,
      draft,
    });
    // Purge the originals (plan §7): the thumbnail now lives on the
    // opportunity; frames and derived media are gone from the job.
    const done = await prisma.intakeJob.update({
      where: { id: job.id },
      data: { status: "done", opportunityId, scanJobId, mediaJson: null, error: null },
    });
    return NextResponse.json({ job: serializeIntakeJob(done), opportunityId });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Research failed. Try again.";
    const failed = await prisma.intakeJob.update({
      where: { id: job.id },
      data: { status: "failed", error: message },
    });
    return NextResponse.json(
      { job: serializeIntakeJob(failed), error: message },
      { status: 500 }
    );
  }
}
