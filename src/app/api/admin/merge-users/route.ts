import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/merge-users — one-shot account consolidation.
 * Moves ALL user-scoped rows to the keeper account, then deletes every
 * other user. Auth: Ed25519 cron signature (same key as the watchlist job).
 * Body: { keepEmail: string, confirm: true }
 *
 * This exists because user rows cascade-delete their data (onDelete: Cascade),
 * so rows must be reassigned BEFORE the old users are removed.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!(await verifyCronAuth(req, rawBody))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { keepEmail?: string; confirm?: boolean };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (body.confirm !== true || !body.keepEmail) {
    return NextResponse.json(
      { error: "Pass { keepEmail, confirm: true } to run the merge." },
      { status: 400 }
    );
  }

  const keeper = await prisma.user.findFirst({
    where: { email: { equals: body.keepEmail.trim(), mode: "insensitive" } },
  });
  if (!keeper) {
    return NextResponse.json(
      { error: `Keeper account ${body.keepEmail} not found — register it first.` },
      { status: 400 }
    );
  }

  const others = await prisma.user.findMany({
    where: { id: { not: keeper.id } },
    select: { id: true, email: true },
  });

  const moved: Record<string, number> = {};
  if (others.length > 0) {
    const otherIds = others.map((u) => u.id);
    // Reassign every user-scoped table BEFORE deleting (relations cascade).
    moved.refineMessages = (
      await prisma.refineMessage.updateMany({
        where: { userId: { in: otherIds } },
        data: { userId: keeper.id },
      })
    ).count;
    moved.projects = (
      await prisma.project.updateMany({
        where: { userId: { in: otherIds } },
        data: { userId: keeper.id },
      })
    ).count;
    moved.aiUsage = (
      await prisma.aiUsage.updateMany({
        where: { userId: { in: otherIds } },
        data: { userId: keeper.id },
      })
    ).count;
    moved.scanJobs = (
      await prisma.scanJob.updateMany({
        where: { userId: { in: otherIds } },
        data: { userId: keeper.id },
      })
    ).count;
    moved.scoreHistories = (
      await prisma.opportunityScoreHistory.updateMany({
        where: { userId: { in: otherIds } },
        data: { userId: keeper.id },
      })
    ).count;
    moved.resetTokens = (
      await prisma.passwordResetToken.updateMany({
        where: { userId: { in: otherIds } },
        data: { userId: keeper.id },
      })
    ).count;

    await prisma.user.deleteMany({ where: { id: { in: otherIds } } });
  }

  const remaining = await prisma.user.findMany({
    select: { email: true, isAdmin: true },
  });

  return NextResponse.json({
    ok: true,
    keeper: keeper.email,
    deleted: others.map((u) => u.email),
    moved,
    remaining,
  });
}
