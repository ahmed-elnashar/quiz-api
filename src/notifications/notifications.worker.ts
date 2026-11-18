import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { NOTIFICATION_STATUS } from '../common/constants';
import { PrismaService } from '../prisma/prisma.service';
import { EMAIL_SERVICE, type EmailService } from './email.service';
import { buildQuizResultEmail, parsePayload } from './notification-payload';
import {
  backoffMs,
  CLAIM_LEASE_MS,
  MAX_SEND_ATTEMPTS,
  WORKER_CONFIG,
  type WorkerConfig,
} from './notifications.config';

/**
 * Sends PENDING notifications in the background.
 *
 * Every poll it finds due notifications and claims each one with a single
 * conditional update (PENDING, due, under the attempt limit). The claim
 * increments `attempts` and pushes `nextAttemptAt` out by a lease, so no other
 * poller can claim it while the send is in flight. The result is then written
 * only if `attempts` still matches the claim.
 */
@Injectable()
export class NotificationsWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationsWorker.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
    @Inject(WORKER_CONFIG) private readonly config: WorkerConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.enabled) return;
    this.timer = setInterval(() => void this.tick(), this.config.pollIntervalMs);
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One poll. Never throws: errors are logged so the interval keeps running. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.processDue();
    } catch (error) {
      this.logger.error('Notification poll failed', error instanceof Error ? error.stack : String(error));
    } finally {
      this.running = false;
    }
  }

  /** Claims and sends every due notification. `now` is injectable for tests. */
  async processDue(now: Date = new Date()): Promise<void> {
    const due = await this.prisma.notification.findMany({
      where: { status: NOTIFICATION_STATUS.PENDING, nextAttemptAt: { lte: now }, attempts: { lt: MAX_SEND_ATTEMPTS } },
      select: { id: true },
      orderBy: { nextAttemptAt: 'asc' },
      take: this.config.batchSize,
    });

    for (const { id } of due) {
      await this.processOne(id, now);
    }
  }

  private async processOne(id: string, now: Date): Promise<void> {
    const claimed = await this.claim(id, now);
    if (!claimed) return;

    try {
      await this.email.send(buildQuizResultEmail(parsePayload(claimed.payload)));
      await this.prisma.notification.updateMany({
        where: { id, attempts: claimed.attempts, status: NOTIFICATION_STATUS.PENDING },
        data: { status: NOTIFICATION_STATUS.SENT, sentAt: now },
      });
    } catch (error) {
      const lastError = error instanceof Error ? error.message : String(error);
      const exhausted = claimed.attempts >= MAX_SEND_ATTEMPTS;
      await this.prisma.notification.updateMany({
        where: { id, attempts: claimed.attempts, status: NOTIFICATION_STATUS.PENDING },
        data: exhausted
          ? { status: NOTIFICATION_STATUS.FAILED, lastError }
          : { lastError, nextAttemptAt: new Date(now.getTime() + backoffMs(claimed.attempts)) },
      });
      this.logger.warn(
        `Notification ${id} send attempt ${claimed.attempts}/${MAX_SEND_ATTEMPTS} failed: ${lastError}` +
          (exhausted ? ' (marked FAILED)' : ''),
      );
    }
  }

  /** Atomic claim. Returns the claimed row, or null if another poller got it first. */
  private async claim(id: string, now: Date): Promise<{ attempts: number; payload: string } | null> {
    const { count } = await this.prisma.notification.updateMany({
      where: {
        id,
        status: NOTIFICATION_STATUS.PENDING,
        nextAttemptAt: { lte: now },
        attempts: { lt: MAX_SEND_ATTEMPTS },
      },
      data: {
        attempts: { increment: 1 },
        nextAttemptAt: new Date(now.getTime() + CLAIM_LEASE_MS),
      },
    });
    if (count !== 1) return null;

    return this.prisma.notification.findUnique({
      where: { id },
      select: { attempts: true, payload: true },
    });
  }
}
