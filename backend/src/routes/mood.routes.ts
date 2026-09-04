import { Router } from 'express';
import { prisma } from '../config/db';
import { analyzeCommitSentiment } from '../services/moodAnalyzer';
import { ApiError } from '../middleware/errorMiddleware';

const MOOD_TAGS = ['Laser', 'Calm', 'Drained', 'Friction'] as const;

const router = Router();

// GET /api/v1/mood/checkins
router.get('/mood/checkins', async (req, res, next) => {
  try {
    const checkIns = await prisma.moodCheckIn.findMany({
      where: { userId: req.userId! },
      orderBy: { timestamp: 'desc' },
      take: 50
    });
    res.json({
      check_ins: checkIns.map((c) => ({
        id: c.id,
        tag: c.tag,
        source: c.source,
        note: c.note,
        timestamp: c.timestamp
      }))
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/mood/checkins - daily pulse recording
router.post('/mood/checkins', async (req, res, next) => {
  try {
    const { tag, note } = req.body ?? {};
    if (!MOOD_TAGS.includes(tag)) {
      throw new ApiError(400, 'INVALID_REQUEST', `tag must be one of: ${MOOD_TAGS.join(', ')}`);
    }
    const checkIn = await prisma.moodCheckIn.create({
      data: { userId: req.userId!, tag, note: note ?? null, source: 'manual' }
    });
    res.status(201).json({ check_in: { id: checkIn.id, tag: checkIn.tag, timestamp: checkIn.timestamp } });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/mood/sentiments - AI-tagged commit sentiment (7-day resonance view)
router.get('/mood/sentiments', async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const commits = await prisma.commit.findMany({
      where: { userId: req.userId!, committedAt: { gte: since } },
      orderBy: { committedAt: 'desc' },
      take: 50
    });
    const summary = { Positive: 0, 'Stress Signals': 0, 'Deep Focus': 0, Neutral: 0 } as Record<string, number>;
    const tagged = commits.map((c) => {
      const tag = c.sentimentTag ?? analyzeCommitSentiment(c.message);
      summary[tag] += 1;
      return {
        commit_hash: c.hash,
        message: c.message,
        sentiment_tag: tag,
        committed_at: c.committedAt
      };
    });
    res.json({ commits: tagged, summary });
  } catch (err) {
    next(err);
  }
});

export default router;
