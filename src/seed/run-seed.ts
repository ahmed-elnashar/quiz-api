import { existsSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { logSeedSummary, seed } from './seed';

async function run(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  // The seed only writes data; it must not start sending notifications.
  process.env.NOTIFICATIONS_WORKER_ENABLED = 'false';

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  try {
    logSeedSummary(await seed(app));
  } finally {
    await app.close();
  }
}

run().catch((error: unknown) => {
  new Logger('Seed').error('Seeding failed', error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
