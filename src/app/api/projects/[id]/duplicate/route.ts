import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/projects/[id]/duplicate — deep-copy a project.
 *
 * Creates a new Project row ("<name> (copy)", never archived), copies its
 * Idea rows with their Documents (+ versions), and copies Upload records
 * pointing at the same stored files (file blobs are NOT duplicated).
 * AiUsage history is not copied. StitchPrompt is intentionally not copied —
 * the duplicate re-enters the pipeline as a fresh design candidate.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const src = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      ideas: {
        orderBy: { createdAt: "asc" },
        include: { documents: { include: { versions: true } } },
      },
      uploads: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!src) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const copy = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        name: `${src.name} (copy)`,
        category: src.category,
        platform: src.platform,
        preferences: src.preferences,
        stackLock: src.stackLock,
        status: src.status,
        notes: src.notes,
      },
      select: { id: true, name: true },
    });

    for (const idea of src.ideas) {
      const newIdea = await tx.idea.create({
        data: {
          projectId: project.id,
          title: idea.title,
          pitch: idea.pitch,
          features: idea.features,
          targetAudience: idea.targetAudience,
          monetization: idea.monetization,
          scores: idea.scores,
          validation: idea.validation,
          favorite: idea.favorite,
          status: idea.status,
        },
        select: { id: true },
      });

      for (const doc of idea.documents) {
        await tx.document.create({
          data: {
            ideaId: newIdea.id,
            kind: doc.kind,
            content: doc.content,
            versions: {
              create: doc.versions.map((v) => ({
                version: v.version,
                content: v.content,
              })),
            },
          },
        });
      }
    }

    for (const upload of src.uploads) {
      await tx.upload.create({
        data: {
          projectId: project.id,
          type: upload.type,
          filename: upload.filename,
          path: upload.path,
          batchId: upload.batchId,
          content: upload.content,
        },
      });
    }

    return project;
  });

  return NextResponse.json({ project: copy }, { status: 201 });
}
