import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const idea = await prisma.idea.findUnique({
    where: { id: params.id },
    include: { project: { select: { id: true, category: true, preferences: true } } },
  });
  if (!idea) {
    return NextResponse.json({ error: "Idea not found." }, { status: 404 });
  }
  return NextResponse.json({ idea });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();

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
