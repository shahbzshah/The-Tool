import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/db';
import { signToken } from '../middleware/authMiddleware';
import { ApiError } from '../middleware/errorMiddleware';

const router = Router();

// POST /api/v1/auth/login - mock OAuth exchange (swap for Clerk.dev / real OAuth2 later)
router.post('/auth/login', async (req, res, next) => {
  try {
    const { provider, code } = req.body ?? {};
    if (!provider || !code) {
      throw new ApiError(400, 'INVALID_REQUEST', 'provider and code are required.');
    }
    if (!['github', 'gitlab'].includes(provider)) {
      throw new ApiError(400, 'INVALID_REQUEST', 'provider must be github or gitlab.');
    }
    // Deterministic demo identity; a real implementation exchanges `code` with the provider.
    const email = 'dev@codezenflow.com';
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name: 'Jane Developer' }
    });
    await prisma.integration.upsert({
      where: { userId_provider: { userId: user.id, provider } },
      update: { isActive: true },
      create: { userId: user.id, provider, accessToken: `mock-token-${crypto.randomUUID()}` }
    });
    res.json({
      access_token: signToken(user.id),
      refresh_token: crypto.randomBytes(32).toString('base64'),
      expires_in: 3600,
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
