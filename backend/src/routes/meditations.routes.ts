import { Router } from 'express';
import { prisma } from '../config/db';
import { MEDITATION_LIBRARY } from '../services/mockData';
import { ApiError } from '../middleware/errorMiddleware';
import { updateStreakCounters } from '../services/streakService';

const router = Router();

// GET /api/v1/meditations
router.get('/meditations', async (_req, res, next) => {
  try {
    res.json({ sessions: MEDITATION_LIBRARY });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/meditations/:id/start
router.post('/meditations/:id/start', async (req, res, next) => {
  try {
    const meditation = MEDITATION_LIBRARY.find((m) => m.id === req.params.id);
    if (!meditation) {
      throw new ApiError(404, 'NOT_FOUND', 'The provided session ID does not exist.');
    }
    const session = await prisma.meditationSession.create({
      data: {
        userId: req.userId!,
        type: meditation.type,
        title: meditation.title,
        durationSeconds: meditation.durationSeconds
      }
    });

    // Maintain zen streak on session start (resets only via idle/stress events)
    const today = new Date().toDateString();
    const streak = await prisma.zenStreak.findFirst({ where: { userId: req.userId! } });
    const alreadyToday = streak?.lastSessionDate?.toDateString() === today;
    const counters = updateStreakCounters(
      { currentStreak: streak?.currentStreak ?? 0, longestStreak: streak?.longestStreak ?? 0 },
      !alreadyToday
    );
    await prisma.zenStreak.upsert({
      where: { userId: req.userId! },
      update: { ...counters, lastSessionDate: new Date() },
      create: { userId: req.userId!, ...counters, lastSessionDate: new Date() }
    });

    res.status(201).json({
      session: {
        id: session.id,
        title: session.title,
        duration_seconds: session.durationSeconds,
        type: session.type,
        started_at: session.startedAt
      },
      zen_streak: counters.currentStreak
    });
  } catch (err) {
    next(err);
  }
});

export default router;
