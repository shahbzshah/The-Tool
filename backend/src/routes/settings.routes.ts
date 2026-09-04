import { Router } from 'express';
import { prisma } from '../config/db';
import { ApiError } from '../middleware/errorMiddleware';

const router = Router();

// GET /api/v1/settings
router.get('/settings', async (req, res, next) => {
  try {
    const settings = await prisma.setting.upsert({
      where: { userId: req.userId! },
      update: {},
      create: { userId: req.userId! }
    });
    const integrations = await prisma.integration.findMany({ where: { userId: req.userId! } });
    res.json({
      settings: {
        ide_sync_enabled: settings.ideSyncEnabled,
        notifications_on: settings.notificationsOn,
        preferred_theme: settings.preferredTheme,
        language: settings.language
      },
      integrations: integrations.map((i) => ({ provider: i.provider, is_active: i.isActive }))
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/settings
router.patch('/settings', async (req, res, next) => {
  try {
    const { ide_sync_enabled, notifications_on, preferred_theme, language } = req.body ?? {};
    if (preferred_theme && !['dark', 'light'].includes(preferred_theme)) {
      throw new ApiError(400, 'INVALID_REQUEST', "preferred_theme must be 'dark' or 'light'.");
    }
    const settings = await prisma.setting.upsert({
      where: { userId: req.userId! },
      update: {
        ...(typeof ide_sync_enabled === 'boolean' ? { ideSyncEnabled: ide_sync_enabled } : {}),
        ...(typeof notifications_on === 'boolean' ? { notificationsOn: notifications_on } : {}),
        ...(preferred_theme ? { preferredTheme: preferred_theme } : {}),
        ...(language ? { language } : {})
      },
      create: {
        userId: req.userId!,
        ...(typeof ide_sync_enabled === 'boolean' ? { ideSyncEnabled: ide_sync_enabled } : {}),
        ...(typeof notifications_on === 'boolean' ? { notificationsOn: notifications_on } : {})
      }
    });
    res.json({
      message: 'Settings updated',
      settings: {
        ide_sync_enabled: settings.ideSyncEnabled,
        notifications_on: settings.notificationsOn,
        preferred_theme: settings.preferredTheme,
        language: settings.language
      }
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/settings/integrations/:provider - revoke third-party access
router.delete('/settings/integrations/:provider', async (req, res, next) => {
  try {
    const provider = req.params.provider;
    const integration = await prisma.integration.findFirst({
      where: { userId: req.userId!, provider }
    });
    if (!integration) {
      throw new ApiError(404, 'NOT_FOUND', 'No active integration found for that provider.');
    }
    await prisma.integration.update({ where: { id: integration.id }, data: { isActive: false } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
