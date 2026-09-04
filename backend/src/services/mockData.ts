// Mock data generator for development/testing (per MASTER_PROMPT instructions)

export interface IMockCommit {
  hash: string;
  message: string;
  linesChanged: number;
  committedAt: Date;
}

export const MEDITATION_LIBRARY = [
  {
    id: 'med_001',
    title: 'Build Break Zen',
    durationSeconds: 60,
    type: 'breathwork',
    description: 'A 60-second reset to clear friction between builds.',
    recommendedFor: ['friction', 'overload']
  },
  {
    id: 'med_002',
    title: 'Quick Breathe',
    durationSeconds: 120,
    type: 'breathwork',
    description: 'Two minutes of guided box breathing to lower stress.',
    recommendedFor: ['stress', 'overload']
  },
  {
    id: 'med_003',
    title: 'Deep Rhythm Reset',
    durationSeconds: 300,
    type: 'meditation',
    description: 'Five-minute body scan for drained, low-energy periods.',
    recommendedFor: ['drained', 'idle']
  },
  {
    id: 'med_004',
    title: "Engineer's Contemplative Toolkit",
    durationSeconds: 120,
    type: 'meditation',
    description: 'Micro-reflection prompts between coding sessions.',
    recommendedFor: ['focus', 'planning']
  }
] as const;

const SAMPLE_MESSAGES = [
  'feat(dashboard): add flow status card with confidence ring',
  'fix(auth): hotfix broken token refresh loop',
  'refactor(flow-detector): extract velocity calc into pure function',
  'wip: temporary workaround for race condition',
  'test(mood): add sentiment analyzer coverage',
  'ugh revert broken chart dependency',
  'docs: update API spec for streaks endpoint',
  'feat(meditations): ship quick breathe timer',
  'fix(fix): finally resolve failing build again',
  'chore: upgrade prisma and regenerate client'
];

export function generateMockCommits(count: number, startDate: Date): IMockCommit[] {
  const commits: IMockCommit[] = [];
  let cursor = new Date(startDate);
  for (let i = 0; i < count; i++) {
    cursor = new Date(cursor.getTime() + (20 + Math.floor(Math.random() * 60)) * 60 * 1000);
    commits.push({
      hash: `mock${i.toString(16).padStart(7, '0')}`,
      message: SAMPLE_MESSAGES[i % SAMPLE_MESSAGES.length],
      linesChanged: 5 + Math.floor(Math.random() * 200),
      committedAt: new Date(cursor)
    });
  }
  return commits;
}

export function generateHourlyBuckets(commits: { committedAt: Date; linesChanged: number; message: string }[], hours: number) {
  const now = Date.now();
  const buckets: {
    timestamp: string;
    velocity: number;
    frustration: number;
    commits: number;
    issues_opened: number;
    flow_state: string;
  }[] = [];
  for (let h = hours - 1; h >= 0; h--) {
    const bucketStart = now - h * 3600 * 1000;
    const inBucket = commits.filter(
      (c) => c.committedAt.getTime() >= bucketStart - 3600 * 1000 && c.committedAt.getTime() < bucketStart + 3600 * 1000
    );
    const lines = inBucket.reduce((sum, c) => sum + c.linesChanged, 0);
    const velocity = Math.round(inBucket.length * 6 + lines / 100);
    const frustration = Math.min(10, Math.round(inBucket.filter((c) => /fix|revert|wip|ugh/i.test(c.message)).length * 2));
    buckets.push({
      timestamp: new Date(bucketStart).toISOString(),
      velocity,
      frustration,
      commits: inBucket.length,
      issues_opened: Math.floor(Math.random() * 2),
      flow_state: velocity > 40 ? 'High Flow' : velocity > 15 ? 'In Flow' : frustration > 4 ? 'Stressed' : 'Idle'
    });
  }
  return buckets;
}
