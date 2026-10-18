import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/share — create a public read-only share link for a project.
 * Body: { projectId }. The project must belong to the signed-in user.
 * Returns { token, url } where url is the public path /share/[token].
 */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const projectId = String(body?.projectId ?? "").trim();
  if (!projectId) {
    return NextResponse.json(
      { error: "projectId is required." },
      { status: 400 }
    );
  }

  // Ownership check: the project must belong to the caller.
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: auth.user.id },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const record = await prisma.shareToken.create({
    data: { projectId: project.id },
    select: { token: true },
  });
  return NextResponse.json(
    { token: record.token, url: `/share/${record.token}` },
    { status: 201 }
  );
}

/**
 * DELETE /api/share — revoke a share link.
 * Body: { token }. Only the project's owner can revoke it.
 */
export async function DELETE(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const token = String(body?.token ?? "").trim();
  if (!token) {
    return NextResponse.json({ error: "token is required." }, { status: 400 });
  }

  const record = await prisma.shareToken.findUnique({
    where: { token },
    include: { project: { select: { userId: true } } },
  });
  // Ownership check via the token's project — cross-user revokes 404.
  if (!record || record.project?.userId !== auth.user.id) {
    return NextResponse.json(
      { error: "Share link not found." },
      { status: 404 }
    );
  }

  await prisma.shareToken.delete({ where: { id: record.id } });
  return NextResponse.json({ revoked: true });
}
