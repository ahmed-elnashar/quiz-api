import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  url: (path: string) => string;
}

/** Boots the real app (same config as main.ts) on a random local port. */
export async function createTestApp(): Promise<TestApp> {
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  return {
    app,
    prisma: app.get(PrismaService),
    url: (path: string) => `${base}/api${path}`,
  };
}

export async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
