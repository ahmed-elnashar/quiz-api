import { existsSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');

  const app = await NestFactory.create(AppModule);
  configureApp(app);

  await app.listen(Number(process.env.PORT ?? 3000));
}

// Startup failures (missing DATABASE_URL, port in use, ...) are logged and
// exit with a non-zero code instead of surfacing as an unhandled rejection.
bootstrap().catch((error: unknown) => {
  new Logger('Bootstrap').error(
    'Failed to start the application',
    error instanceof Error ? error.stack : String(error),
  );
  process.exit(1);
});
