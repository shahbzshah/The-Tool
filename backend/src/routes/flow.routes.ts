import { Router } from 'express';
import { computeFlowTracker, getUserTriggers } from '../services/dashboardService';
import { prisma } from '../config/db';
import { ApiError } from '../middleware/errorMiddleware';

const router = Router();

// GET /api/v1/flow/tracker?range=today|7days|30days|custom
router.get('/flow/tracker', async (req, res, next) => {
  try {
    const range = String(req.query.range || '7days');
    if (!['today', '7days', '30days', 'custom'].includes(range)) {
      throw new ApiError(400, 'INVALID_REQUEST', 'range must be today, 7days, 30days or custom.');
    }
    res.json(await computeFlowTracker(req.userId!, range));
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/flow/triggers - calibrate engine thresholds
router.post('/flow/triggers', async (req, res, next) => {
  try {
    const { velocity_threshold, frustration_threshold, idle_timeout_minutes } = req.body ?? {};
    const parsed = {
      velocityThreshold: Number(velocity_threshold),
      frustrationThreshold: Number(frustration_threshold),
      idleTimeoutMinutes: Number(idle_timeout_minutes)
    };
    if (
      Number.isNaN(parsed.velocityThreshold) || Number.isNaN(parsed.frustrationThreshold) ||
      Number.isNaN(parsed.idleTimeoutMinutes) || parsed.idleTimeoutMinutes < 1
    ) {
      throw new ApiError(400, 'INVALID_REQUEST', 'velocity_threshold, frustration_threshold and idle_timeout_minutes (>=1) are required numbers.');
    }
    await prisma.setting.upsert({
      where: { userId: req.userId! },
      update: { triggersJson: JSON.stringify(parsed) },
      create: { userId: req.userId!, triggersJson: JSON.stringify(parsed) }
    });
    const saved = await getUserTriggers(req.userId!);
    res.json({
      message: 'Triggers updated successfully',
      config: {
        velocity_threshold: saved.velocityThreshold,
        frustration_threshold: saved.frustrationThreshold,
        idle_timeout_minutes: saved.idleTimeoutMinutes
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
