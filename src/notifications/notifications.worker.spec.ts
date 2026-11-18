import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import type { EmailService } from './email.service';
import { backoffMs, workerConfigFromEnv, type WorkerConfig } from './notifications.config';
import { NotificationsWorker } from './notifications.worker';

const noop = (): void => undefined;

function createWorker(config: Partial<WorkerConfig> = {}): NotificationsWorker {
  return new NotificationsWorker({} as PrismaService, {} as EmailService, {
    enabled: true,
    pollIntervalMs: 2_000,
    batchSize: 20,
    ...config,
  });
}

describe('NotificationsWorker polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('polls every 2 seconds once the app has started', async () => {
    const worker = createWorker();
    const processDue = vi.spyOn(worker, 'processDue').mockResolvedValue();

    worker.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(1_999);
    expect(processDue).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(processDue).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(processDue).toHaveBeenCalledTimes(3);

    worker.onApplicationShutdown();
  });

  it('stops polling on shutdown', async () => {
    const worker = createWorker();
    const processDue = vi.spyOn(worker, 'processDue').mockResolvedValue();

    worker.onApplicationBootstrap();
    worker.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(processDue).not.toHaveBeenCalled();
  });

  it('does not poll when disabled', async () => {
    const worker = createWorker({ enabled: false });
    const processDue = vi.spyOn(worker, 'processDue').mockResolvedValue();

    worker.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(processDue).not.toHaveBeenCalled();
  });

  it('skips a poll while the previous one is still running', async () => {
    const worker = createWorker();
    let finish = noop;
    const processDue = vi
      .spyOn(worker, 'processDue')
      .mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));

    worker.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(processDue).toHaveBeenCalledTimes(1);

    finish();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(processDue).toHaveBeenCalledTimes(2);

    worker.onApplicationShutdown();
  });
});

describe('notification config', () => {
  it.each([
    [1, 2_000],
    [2, 4_000],
    [3, 8_000],
  ])('backs off %i failed send(s) by %i ms', (attemptsMade, expected) => {
    expect(backoffMs(attemptsMade)).toBe(expected);
  });

  it('defaults to an enabled worker polling every 2s', () => {
    expect(workerConfigFromEnv({})).toEqual({ enabled: true, pollIntervalMs: 2_000, batchSize: 20 });
  });

  it('can be disabled and re-timed through the environment', () => {
    expect(workerConfigFromEnv({ NOTIFICATIONS_WORKER_ENABLED: 'false', NOTIFICATIONS_POLL_MS: '500' })).toMatchObject({
      enabled: false,
      pollIntervalMs: 500,
    });
  });
});
