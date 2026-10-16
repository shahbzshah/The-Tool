import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** C5: ownership check — the idea's project must belong to the signed-in user. */
async function ownedIdea(userId: string, id: string) {
  return prisma.idea.findFirst({
    where: { id, project: { userId } },
    include: { project: { select: { id: true, category: true, preferences: true } } },
  });
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const idea = await ownedIdea(auth.user.id, params.id);
  if (!idea) {
    return NextResponse.json({ error: "Idea not found." }, { status: 404 });
  }
  return NextResponse.json({ idea });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  try {
    const body = await req.json();

    // C5: user-scoped lookup first so cross-user edits 404, not 403.
    const existing = await prisma.idea.findFirst({
      where: { id: params.id, project: { userId: auth.user.id } },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Idea not found." }, { status: 404 });
    }

    // Toggle favorite
    if (typeof body?.favorite === "boolean") {
      const idea = await prisma.idea.update({
        where: { id: params.id },
        data: { favorite: body.favorite },
      });
      return NextResponse.json({ idea });
    }

    const status = String(body?.status ?? "");
    if (!["draft", "approved"].includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }

    const idea = await prisma.idea.update({
      where: { id: params.id },
      data: { status },
    });
    return NextResponse.json({ idea });
  } catch {
    return NextResponse.json({ error: "Idea not found." }, { status: 404 });
  }
}
