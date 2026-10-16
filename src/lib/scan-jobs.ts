import { prisma } from "@/lib/db";

/** Jobs stuck in "running" longer than this are considered dead. */
const STALE_RUNNING_MS = 30 * 60 * 1000;

/**
 * Sweep ScanJobs stuck in "running" with no update for 30+ minutes and mark
 * them "failed" with a "Timed out" error. A scan that hasn't updated in that
 * long crashed or was killed before it could write its final status (e.g. a
 * function timeout or a redeploy mid-scan), leaving the job looking
 * in-progress forever. Returns the number of jobs swept.
 *
 * Call at the start of scan entry points (manual scans POST, watchlist POST).
 */
export async function sweepStaleJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS);
  const res = await prisma.scanJob.updateMany({
    where: { status: "running", updatedAt: { lt: cutoff } },
    data: {
      status: "failed",
      error: "Timed out",
      finishedAt: new Date(),
    },
  });
  return res.count;
}
