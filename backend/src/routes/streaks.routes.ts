import { Router } from 'express';
import { prisma } from '../config/db';

const router = Router();

// GET /api/v1/streaks
router.get('/streaks', async (req, res, next) => {
  try {
    const streak = await prisma.zenStreak.findUnique({ where: { userId: req.userId! } });
    const sessions = await prisma.meditationSession.findMany({
      where: { userId: req.userId! },
      orderBy: { startedAt: 'desc' },
      take: 30
    });
    res.json({
      current_streak: streak?.currentStreak ?? 0,
      longest_streak: streak?.longestStreak ?? 0,
      last_session_date: streak?.lastSessionDate?.toISOString() ?? null,
      recent_sessions: sessions.map((s) => ({
        id: s.id,
        title: s.title,
        type: s.type,
        duration_seconds: s.durationSeconds,
        completion_status: s.completionStatus,
        started_at: s.startedAt
      }))
    });
  } catch (err) {
    next(err);
  }
});

export default router;
