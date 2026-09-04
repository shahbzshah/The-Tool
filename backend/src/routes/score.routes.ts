import { Router } from 'express';
import { prisma } from '../config/db';

const router = Router();

// GET /api/v1/score/weekly - mindfulness score vs coding output
router.get('/score/weekly', async (req, res, next) => {
  try {
    const scores = await prisma.mindfulnessScore.findMany({
      where: { userId: req.userId! },
      orderBy: { weekStartDate: 'asc' },
      take: 12
    });
    res.json({
      scores: scores.map((s) => ({
        week_start_date: s.weekStartDate,
        score: s.score,
        velocity_ratio: s.velocityRatio,
        details: s.details ? JSON.parse(s.details) : null
      }))
    });
  } catch (err) {
    next(err);
  }
});

export default router;
