import type { Server } from 'node:http';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { ensureBootstrapAdmin } from './modules/auth/auth.service.js';

async function main() {
  await connectDatabase();
  await ensureBootstrapAdmin();

  const app = createApp();
  // Cloud Run injects PORT (8080) and requires listening on 0.0.0.0.
  const server: Server = app.listen(env.PORT, '0.0.0.0', () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Doctor Tracker API listening');
  });

  // Cloud Run sends SIGTERM before stopping an instance (10s grace period).
  // Stop accepting connections, let in-flight requests finish, close the pool.
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 9_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
