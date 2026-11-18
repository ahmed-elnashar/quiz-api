import { type INestApplication, ValidationPipe } from '@nestjs/common';

/**
 * The one validation configuration for all input: HTTP requests use it via
 * configureApp, and the seed script runs its DTOs through it too.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
}

/** Shared app configuration, used by main.ts and the e2e tests. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(createValidationPipe());
  app.enableShutdownHooks();
}
