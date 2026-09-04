import { createApp } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';

const app = createApp();

app.listen(env.port, () => {
  logger.info(`CodeZen Flow API listening on http://localhost:${env.port}`);
});
