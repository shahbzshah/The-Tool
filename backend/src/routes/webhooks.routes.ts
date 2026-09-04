import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/db';
import { analyzeCommitSentiment } from '../services/moodAnalyzer';
import { env } from '../config/env';

const router = Router();

// POST /api/v1/webhooks/github - public, signature-verified (X-Hub-Signature-256)
router.post('/webhooks/github', async (req, res, next) => {
  try {
    if (env.githubWebhookSecret) {
      const signature = req.headers['x-hub-signature-256'] as string | undefined;
      const raw = JSON.stringify(req.body);
      const expected = 'sha256=' + crypto.createHmac('sha256', env.githubWebhookSecret).update(raw).digest('hex');
      if (!signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid webhook signature.' } });
        return;
      }
    }

    const { commits = [], repository } = req.body ?? {};
    let flowImpact: 'positive' | 'stress' | 'neutral' = 'neutral';
    let stressCount = 0;

    const integration = await prisma.integration.findFirst({ where: { provider: 'github', isActive: true } });
    if (integration) {
      for (const commit of commits) {
        const tag = analyzeCommitSentiment(commit.message || '');
        if (tag === 'Stress Signals') stressCount += 1;
        await prisma.commit.upsert({
          where: { integrationId_hash: { integrationId: integration.id, hash: commit.id } },
          update: { sentimentTag: tag },
          create: {
            integrationId: integration.id,
            userId: integration.userId,
            hash: commit.id,
            message: commit.message || '',
            linesChanged: 0,
            sentimentTag: tag,
            committedAt: new Date()
          }
        });
      }
      flowImpact = stressCount > commits.length / 2 ? 'stress' : commits.length > 0 ? 'positive' : 'neutral';
    }

    void repository;
    res.json({ status: 'processed', flow_impact: flowImpact });
  } catch (err) {
    next(err);
  }
});

export default router;
