import { prisma } from "@/lib/db";

/**
 * Daily per-user cap on AI-generation calls, to bound NVIDIA quota burn.
 * Counts AiUsage rows for the user in the last 24 hours.
 */
export const AI_DAILY_QUOTA = 200;

/**
 * Returns true if the user is under their daily AI quota, false if they
 * have already made >= AI_DAILY_QUOTA AI calls in the last 24 hours.
 *
 * Fails open (returns true) if the count itself cannot be read: quota
 * enforcement must never 429 a user because of a transient DB error.
 */
export async function checkAiQuota(userId: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  try {
    const count = await prisma.aiUsage.count({
      where: { userId, createdAt: { gte: since } },
    });
    return count < AI_DAILY_QUOTA;
  } catch (err) {
    console.error("[ai-quota] failed to check quota:", err);
    return true;
  }
}
