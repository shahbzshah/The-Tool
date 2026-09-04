import { Router } from 'express';
import { computeDashboard } from '../services/dashboardService';

const router = Router();

// GET /api/v1/dashboard
router.get('/dashboard', async (req, res, next) => {
  try {
    res.json(await computeDashboard(req.userId!));
  } catch (err) {
    next(err);
  }
});

export default router;
