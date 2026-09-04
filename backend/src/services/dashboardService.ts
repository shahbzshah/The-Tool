import { prisma } from '../config/db';
import { detectFlowState, DEFAULT_THRESHOLDS, IFlowThresholds, computeFrustrationScore } from './flowDetector';
import { generateHourlyBuckets } from './mockData';

export async function getUserTriggers(userId: string): Promise<IFlowThresholds> {
  const settings = await prisma.setting.findUnique({ where: { userId } });
  if (!settings?.triggersJson) return DEFAULT_THRESHOLDS;
  try {
    return { ...DEFAULT_THRESHOLDS, ...JSON.parse(settings.triggersJson) };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

export async function computeDashboard(userId: string) {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [commits, openIssues, lastSession, streak, scores, triggers] = await Promise.all([
    prisma.commit.findMany({ where: { userId, committedAt: { gte: since } }, orderBy: { committedAt: 'asc' } }),
    prisma.issue.count({ where: { userId, status: 'open' } }),
    prisma.meditationSession.findFirst({ where: { userId }, orderBy: { startedAt: 'desc' } }),
    prisma.zenStreak.findFirst({ where: { userId } }),
    prisma.mindfulnessScore.findFirst({ where: { userId }, orderBy: { weekStartDate: 'desc' } }),
    getUserTriggers(userId)
  ]);

  const intervals = commits.slice(1).map(
    (c, i) => (c.committedAt.getTime() - commits[i].committedAt.getTime()) / 60000
  );
  const avgInterval = intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 999;
  const variance = intervals.length
    ? Math.sqrt(intervals.reduce((sum, v) => sum + (v - avgInterval) ** 2, 0) / intervals.length)
    : 0;
  const minutesSinceLastActivity = commits.length
    ? (Date.now() - commits[commits.length - 1].committedAt.getTime()) / 60000
    : 999;

  const flow = detectFlowState(
    {
      commitsLastHour: commits.filter((c) => Date.now() - c.committedAt.getTime() < 3600 * 1000).length,
      avgIntervalMinutes: avgInterval,
      intervalVarianceMinutes: variance,
      openIssues,
      minutesSinceLastActivity
    },
    triggers
  );

  return {
    flow_status: flow.state,
    flow_percentage: flow.confidence,
    mindfulness_score: scores?.score ?? null,
    zen_streak: streak?.currentStreak ?? 0,
    last_meditation: lastSession?.startedAt?.toISOString() ?? null,
    next_suggestion:
      flow.state === 'Stressed'
        ? 'High stress detected - take a 2-minute Quick Breathe session now'
        : flow.state === 'In Flow'
          ? 'You are in flow - protect this window, hydration check in 25 minutes'
          : 'Low activity - try a 5-minute Deep Rhythm Reset'
  };
}

export async function computeFlowTracker(userId: string, range: string) {
  const hours = range === 'today' ? 24 : range === '30days' ? 24 : 24;
  const since = new Date(Date.now() - hours * 3600 * 1000);
  const [commits, triggers] = await Promise.all([
    prisma.commit.findMany({ where: { userId, committedAt: { gte: since } }, orderBy: { committedAt: 'asc' } }),
    getUserTriggers(userId)
  ]);
  const openIssues = await prisma.issue.count({ where: { userId, status: 'open' } });
  const buckets = generateHourlyBuckets(commits, hours);
  const optimalBlocks = buckets.filter((b) => b.flow_state === 'High Flow').length;
  return {
    data: buckets,
    summary: {
      avg_velocity: buckets.reduce((s, b) => s + b.velocity, 0) / Math.max(1, buckets.length),
      peak_frustration: Math.max(0, ...buckets.map((b) => b.frustration)),
      total_commits: commits.length,
      optimal_blocks: optimalBlocks
    },
    thresholds: triggers,
    open_issues: openIssues,
    frustration_score: computeFrustrationScore(openIssues, 10, 0.2)
  };
}
