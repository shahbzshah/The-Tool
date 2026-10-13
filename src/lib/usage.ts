import { prisma } from "@/lib/db";

/**
 * Estimates token counts from character lengths when the NVIDIA API response
 * carries no usage block (it usually does not).
 */
export function estimateTokens(chars: number): number {
  return Math.max(0, Math.ceil(chars / 4));
}

/**
 * Records one NVIDIA call's token consumption for a user/project.
 * kind: "docgen" | "refine". Skips silently if no userId is available.
 */
export async function logAiUsage(args: {
  userId?: string | null;
  projectId?: string | null;
  kind: string;
  tokensIn: number;
  tokensOut: number;
}): Promise<void> {
  if (!args.userId) return;
  try {
    await prisma.aiUsage.create({
      data: {
        userId: args.userId,
        projectId: args.projectId ?? null,
        kind: args.kind,
        tokensIn: args.tokensIn,
        tokensOut: args.tokensOut,
      },
    });
  } catch (err) {
    // Usage tracking must never break the request it measures.
    console.error("[usage] failed to log AI usage:", err);
  }
}

/** Sums all tokens (in + out) logged for one project. */
export async function getProjectTokenTotal(projectId: string): Promise<number> {
  const agg = await prisma.aiUsage.aggregate({
    where: { projectId },
    _sum: { tokensIn: true, tokensOut: true },
  });
  return (agg._sum.tokensIn ?? 0) + (agg._sum.tokensOut ?? 0);
}
