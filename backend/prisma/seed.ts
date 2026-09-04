// Seed script: creates a demo user with 7 days of telemetry (mock data generator)
import { PrismaClient } from '@prisma/client';
import { generateMockCommits } from '../src/services/mockData';
import { analyzeCommitSentiment } from '../src/services/moodAnalyzer';

const prisma = new PrismaClient();

async function main() {
  const email = 'dev@codezenflow.com';
  await prisma.moodCheckIn.deleteMany({});
  await prisma.meditationSession.deleteMany({});
  await prisma.mindfulnessScore.deleteMany({});
  await prisma.zenStreak.deleteMany({});
  await prisma.commit.deleteMany({});
  await prisma.issue.deleteMany({});
  await prisma.setting.deleteMany({});
  await prisma.integration.deleteMany({});
  await prisma.user.deleteMany({});

  const user = await prisma.user.create({
    data: { email, name: 'Jane Developer', avatarUrl: null }
  });

  const integration = await prisma.integration.create({
    data: { userId: user.id, provider: 'github', accessToken: 'mock-encrypted-token' }
  });

  await prisma.setting.create({
    data: { userId: user.id, preferredTheme: 'dark' }
  });

  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const mockCommits = generateMockCommits(40, weekAgo);
  await prisma.commit.createMany({
    data: mockCommits.map((c) => ({
      integrationId: integration.id,
      userId: user.id,
      hash: c.hash,
      message: c.message,
      linesChanged: c.linesChanged,
      sentimentTag: analyzeCommitSentiment(c.message),
      committedAt: c.committedAt
    }))
  });

  await prisma.issue.createMany({
    data: Array.from({ length: 6 }, (_, i) => ({
      integrationId: integration.id,
      userId: user.id,
      providerIssueId: `GH-${1000 + i}`,
      title: [`Flaky test in CI`, 'Memory leak in worker', 'Update deps', 'Rate limit handling', 'Docs gap', 'Chart render bug'][i],
      status: i === 2 ? 'closed' : 'open'
    }))
  });

  const sessionTitles = [
    { title: 'Build Break Zen', type: 'breathwork', duration: 60 },
    { title: 'Quick Breathe', type: 'breathwork', duration: 120 },
    { title: 'Deep Rhythm Reset', type: 'meditation', duration: 300 }
  ];
  for (let day = 0; day < 5; day++) {
    const started = new Date(Date.now() - day * 24 * 3600 * 1000);
    const s = sessionTitles[day % sessionTitles.length];
    await prisma.meditationSession.create({
      data: {
        userId: user.id,
        type: s.type,
        title: s.title,
        durationSeconds: s.duration,
        completionStatus: 'completed',
        startedAt: started,
        completedAt: new Date(started.getTime() + s.duration * 1000)
      }
    });
  }

  await prisma.zenStreak.create({
    data: { userId: user.id, currentStreak: 5, longestStreak: 8, lastSessionDate: new Date() }
  });

  const moodTags = ['Laser', 'Calm', 'Drained', 'Friction'];
  for (let day = 0; day < 7; day++) {
    await prisma.moodCheckIn.create({
      data: {
        userId: user.id,
        tag: moodTags[day % moodTags.length],
        source: 'manual',
        timestamp: new Date(Date.now() - day * 24 * 3600 * 1000)
      }
    });
  }

  for (let week = 0; week < 4; week++) {
    await prisma.mindfulnessScore.create({
      data: {
        userId: user.id,
        weekStartDate: new Date(Date.now() - (3 - week) * 7 * 24 * 3600 * 1000),
        score: 62 + week * 9,
        velocityRatio: 0.8 + week * 0.1,
        details: JSON.stringify({ meditations: 3 + week, stress_events: 4 - week })
      }
    });
  }

  console.log(`Seeded demo user ${email} with ${mockCommits.length} commits, 6 issues, 5 sessions, 7 check-ins, 4 weekly scores.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
