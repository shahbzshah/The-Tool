import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseDraft, serializeIntakeJob } from "@/lib/hunter/intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/intake/:id/draft — save the user's edits to topic /
 * keywords / audience (plan §7). Research only ever runs on the edited
 * draft. Edits lock once research has run or is running.
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const job = await prisma.intakeJob.findFirst({ where: { id: params.id, userId: auth.user.id } });
  if (!job) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (job.status !== "awaiting_confirm") {
    return NextResponse.json(
      { error: "This draft is locked — research already ran or is running." },
      { status: 409 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const draft = parseDraft(job.draftJson);
  if (body.topic !== undefined) {
    if (typeof body.topic !== "string" || !body.topic.trim()) {
      return NextResponse.json({ error: "Topic can't be empty." }, { status: 400 });
    }
    draft.topic = body.topic.trim();
    // Answering the help question clears the gate.
    draft.needs_user_help = false;
    draft.help_question = null;
  }
  if (body.app_concept !== undefined) {
    draft.app_concept = typeof body.app_concept === "string" && body.app_concept.trim()
      ? body.app_concept.trim()
      : null;
  }
  if (body.audience !== undefined) {
    draft.audience = typeof body.audience === "string" && body.audience.trim()
      ? body.audience.trim()
      : null;
  }
  if (body.keywords !== undefined) {
    if (!Array.isArray(body.keywords)) {
      return NextResponse.json({ error: "Keywords must be a list." }, { status: 400 });
    }
    const kws = body.keywords
      .filter((k: unknown): k is string => typeof k === "string")
      .map((k: string) => k.trim())
      .filter(Boolean)
      .slice(0, 5);
    draft.keywords = kws;
  }
  const updated = await prisma.intakeJob.update({
    where: { id: job.id },
    data: { draftJson: JSON.stringify(draft) },
  });
  return NextResponse.json({ job: serializeIntakeJob(updated) });
}
