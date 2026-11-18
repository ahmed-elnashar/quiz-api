/** Total sends before a notification is marked FAILED (1 try + 2 retries). */
export const MAX_SEND_ATTEMPTS = 3;

/** How long a claim holds a notification; a crashed send is retried after this. */
export const CLAIM_LEASE_MS = 30_000;

const BASE_BACKOFF_MS = 2_000;

/** Delay before the next try after `attemptsMade` failed sends: 2s, 4s, 8s, ... */
export function backoffMs(attemptsMade: number): number {
  return BASE_BACKOFF_MS * 2 ** (attemptsMade - 1);
}

export interface WorkerConfig {
  enabled: boolean;
  pollIntervalMs: number;
  batchSize: number;
}

export function workerConfigFromEnv(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return {
    enabled: env.NOTIFICATIONS_WORKER_ENABLED !== 'false',
    pollIntervalMs: Number(env.NOTIFICATIONS_POLL_MS ?? 2_000),
    batchSize: 20,
  };
}

export const WORKER_CONFIG = Symbol('WORKER_CONFIG');
