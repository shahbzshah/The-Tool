import { Router } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware';
import authRoutes from './auth.routes';
import dashboardRoutes from './dashboard.routes';
import flowRoutes from './flow.routes';
import meditationRoutes from './meditations.routes';
import streakRoutes from './streaks.routes';
import moodRoutes from './mood.routes';
import scoreRoutes from './score.routes';
import settingsRoutes from './settings.routes';
import webhookRoutes from './webhooks.routes';

const router = Router();

router.use(authRoutes);            // /auth/login (public)
router.use(webhookRoutes);         // /webhooks/github (public, signature-verified)

// All routes below require a Bearer token
const authenticated = Router();
authenticated.use((req, res, next) => requireAuth(req as AuthenticatedRequest, res, next));
authenticated.use(dashboardRoutes);
authenticated.use(flowRoutes);
authenticated.use(meditationRoutes);
authenticated.use(streakRoutes);
authenticated.use(moodRoutes);
authenticated.use(scoreRoutes);
authenticated.use(settingsRoutes);

router.use(authenticated);

export default router;
