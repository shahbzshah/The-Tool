import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/projects/[id] — project incl. stack lock. */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, stackLock: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  return NextResponse.json({ project });
}

/**
 * PATCH /api/projects/[id] — set or clear the canonical tech stack lock.
 * Body: { stackLock: string | null }
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();

    if (!("stackLock" in body)) {
      return NextResponse.json(
        { error: "stackLock field is required (string or null)." },
        { status: 400 }
      );
    }

    const raw = body.stackLock;
    const stackLock =
      raw === null
        ? null
        : String(raw).trim().slice(0, 2000) || null;

    const project = await prisma.project.update({
      where: { id: params.id },
      data: { stackLock },
      select: { id: true, stackLock: true },
    });
    return NextResponse.json({ project });
  } catch {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
}