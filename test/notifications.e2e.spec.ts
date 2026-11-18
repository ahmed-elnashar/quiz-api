import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMAIL_SERVICE, type EmailService } from '../src/notifications/email.service';
import { NotificationsWorker } from '../src/notifications/notifications.worker';
import { createTestApp, type TestApp } from './app';
import { answers, createQuiz, createUser, startAttempt, submit, type TestQuiz, type TestUser } from './fixtures';

const seconds = (base: Date, s: number): Date => new Date(base.getTime() + s * 1000);

describe('Notifications (e2e)', () => {
  let t: TestApp;
  let worker: NotificationsWorker;
  let email: EmailService;
  let user: TestUser;
  let quiz: TestQuiz;

  beforeAll(async () => {
    t = await createTestApp();
    worker = t.app.get(NotificationsWorker);
    email = t.app.get<EmailService>(EMAIL_SERVICE);
    user = await createUser(t.prisma, 'Grace Hopper');
    quiz = await createQuiz(t, user.id, 5);
  });

  afterAll(async () => {
    await t.app.close();
  });

  beforeEach(async () => {
    delete process.env.EMAIL_FAIL;
    // Isolate each test: settle notifications left over from other tests.
    await t.prisma.notification.updateMany({ where: { status: 'PENDING' }, data: { status: 'SENT' } });
  });

  afterEach(() => {
    delete process.env.EMAIL_FAIL;
    vi.restoreAllMocks();
  });

  /** Submits a 4/5 attempt and returns its notification id. */
  async function submitAttempt(): Promise<{ attemptId: string; notificationId: string; status: number }> {
    const attemptId = await startAttempt(t, user.id, quiz.quizId);
    const res = await submit(t, user.id, attemptId, { answers: answers(quiz, 4) });
    const notification = await t.prisma.notification.findUnique({ where: { attemptId }, select: { id: true } });
    return { attemptId, notificationId: notification?.id ?? '', status: res.status };
  }

  function readNotification(id: string) {
    return t.prisma.notification.findUniqueOrThrow({
      where: { id },
      select: { status: true, attempts: true, lastError: true, sentAt: true, nextAttemptAt: true },
    });
  }

  describe('email failure never breaks submission', () => {
    it('submits successfully while EMAIL_FAIL=true and keeps the notification PENDING', async () => {
      process.env.EMAIL_FAIL = 'true';
      const attemptId = await startAttempt(t, user.id, quiz.quizId);

      const res = await submit(t, user.id, attemptId, { answers: answers(quiz, 4) });
      const now = new Date();
      await worker.processDue(now);

      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({ status: 'COMPLETED', percentage: 80 });
      const stored = await t.prisma.notification.findUniqueOrThrow({ where: { attemptId } });
      expect(stored).toMatchObject({ status: 'PENDING', attempts: 1, lastError: 'Mock email delivery failed (EMAIL_FAIL=true)' });
    });

    it('keeps the attempt and its result intact after the notification is marked FAILED', async () => {
      process.env.EMAIL_FAIL = 'true';
      const { attemptId, notificationId } = await submitAttempt();
      const now = new Date();

      await worker.processDue(now);
      await worker.processDue(seconds(now, 2));
      await worker.processDue(seconds(now, 6));

      expect((await readNotification(notificationId)).status).toBe('FAILED');
      const result = await fetch(t.url(`/users/${user.id}/attempts/${attemptId}/result`));
      expect(result.status).toBe(200);
      expect(await result.json()).toMatchObject({ status: 'COMPLETED', correct: 4, total: 5 });
    });

    it('does not call the email service during submit', async () => {
      const send = vi.spyOn(email, 'send');

      const { status } = await submitAttempt();

      expect(status).toBe(201);
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('NotificationsWorker', () => {
    it('sends a pending notification and marks it SENT with sentAt', async () => {
      const send = vi.spyOn(email, 'send');
      const { notificationId } = await submitAttempt();
      const now = new Date();

      await worker.processDue(now);

      expect(await readNotification(notificationId)).toMatchObject({ status: 'SENT', attempts: 1, lastError: null, sentAt: now });
      expect(send).toHaveBeenCalledWith({
        to: user.email,
        subject: `Your result for "${quiz.title}"`,
        text: expect.stringContaining('Score: 4/5 (80%)') as unknown as string,
      });
    });

    it('includes name, quiz, score, percentage, message and completion time in the email', async () => {
      const send = vi.spyOn(email, 'send');
      const { attemptId } = await submitAttempt();
      const { completedAt } = await t.prisma.attempt.findUniqueOrThrow({ where: { id: attemptId }, select: { completedAt: true } });

      await worker.processDue(new Date());

      const text = send.mock.calls[0]?.[0].text ?? '';
      expect(text).toContain('Hi Grace Hopper,');
      expect(text).toContain(quiz.title);
      expect(text).toContain('Score: 4/5 (80%)');
      expect(text).toContain('You scored 80%. Great job!');
      expect(text).toContain(completedAt?.toISOString());
    });

    it('backs off 2s after the first failure and 4s after the second', async () => {
      process.env.EMAIL_FAIL = 'true';
      const { notificationId } = await submitAttempt();
      const now = new Date();

      await worker.processDue(now);
      expect(await readNotification(notificationId)).toMatchObject({ attempts: 1, nextAttemptAt: seconds(now, 2) });

      await worker.processDue(seconds(now, 1.9));
      expect((await readNotification(notificationId)).attempts).toBe(1);

      await worker.processDue(seconds(now, 2));
      expect(await readNotification(notificationId)).toMatchObject({ attempts: 2, nextAttemptAt: seconds(now, 6) });

      await worker.processDue(seconds(now, 5.9));
      expect((await readNotification(notificationId)).attempts).toBe(2);
    });

    it('marks the notification FAILED after 3 failed sends and stops retrying', async () => {
      process.env.EMAIL_FAIL = 'true';
      const send = vi.spyOn(email, 'send');
      const { notificationId } = await submitAttempt();
      const now = new Date();

      await worker.processDue(now);
      await worker.processDue(seconds(now, 2));
      await worker.processDue(seconds(now, 6));
      await worker.processDue(seconds(now, 600));

      expect(await readNotification(notificationId)).toMatchObject({
        status: 'FAILED',
        attempts: 3,
        lastError: 'Mock email delivery failed (EMAIL_FAIL=true)',
        sentAt: null,
      });
      expect(send).toHaveBeenCalledTimes(3);
    });

    it('recovers when the email service comes back before the limit', async () => {
      process.env.EMAIL_FAIL = 'true';
      const { notificationId } = await submitAttempt();
      const now = new Date();
      await worker.processDue(now);

      delete process.env.EMAIL_FAIL;
      await worker.processDue(seconds(now, 2));

      expect(await readNotification(notificationId)).toMatchObject({ status: 'SENT', attempts: 2, sentAt: seconds(now, 2) });
    });

    it('claims atomically: concurrent polls send each notification once', async () => {
      const send = vi.spyOn(email, 'send');
      const { notificationId } = await submitAttempt();
      const now = new Date();

      await Promise.all([worker.processDue(now), worker.processDue(now), worker.processDue(now)]);

      expect(send).toHaveBeenCalledTimes(1);
      expect(await readNotification(notificationId)).toMatchObject({ status: 'SENT', attempts: 1 });
    });

    it('retries a claim whose send never finished once the 30s lease expires', async () => {
      const { notificationId } = await submitAttempt();
      const now = new Date();
      // Simulate a worker that claimed the row and crashed mid-send.
      await t.prisma.notification.update({
        where: { id: notificationId },
        data: { attempts: 1, nextAttemptAt: seconds(now, 30) },
      });

      await worker.processDue(seconds(now, 29));
      expect((await readNotification(notificationId)).status).toBe('PENDING');

      await worker.processDue(seconds(now, 30));
      expect(await readNotification(notificationId)).toMatchObject({ status: 'SENT', attempts: 2 });
    });

    it('keeps polling after a poll throws', async () => {
      vi.spyOn(worker, 'processDue').mockRejectedValueOnce(new Error('database is locked'));

      await expect(worker.tick()).resolves.toBeUndefined();
      await expect(worker.tick()).resolves.toBeUndefined();
    });
  });

  describe('GET /api/users/:userId/notifications', () => {
    it('shows delivery status and the email payload', async () => {
      const { attemptId } = await submitAttempt();
      const now = new Date();
      await worker.processDue(now);

      const res = await fetch(t.url(`/users/${user.id}/notifications?limit=100`));
      const body = (await res.json()) as { items: Record<string, unknown>[]; total: number };
      const item = body.items.find((n) => n.attemptId === attemptId);

      expect(res.status).toBe(200);
      expect(item).toMatchObject({
        type: 'QUIZ_RESULT',
        channel: 'EMAIL',
        status: 'SENT',
        attempts: 1,
        lastError: null,
        sentAt: now.toISOString(),
        payload: {
          userName: 'Grace Hopper',
          userEmail: user.email,
          quizTitle: quiz.title,
          score: { correct: 4, total: 5 },
          percentage: 80,
          message: 'You scored 80%. Great job!',
        },
      });
    });

    it('shows lastError and attempts while delivery is failing', async () => {
      process.env.EMAIL_FAIL = 'true';
      const { attemptId } = await submitAttempt();
      await worker.processDue(new Date());

      const body = (await (await fetch(t.url(`/users/${user.id}/notifications?limit=100`))).json()) as {
        items: Record<string, unknown>[];
      };

      expect(body.items.find((n) => n.attemptId === attemptId)).toMatchObject({
        status: 'PENDING',
        attempts: 1,
        lastError: 'Mock email delivery failed (EMAIL_FAIL=true)',
        sentAt: null,
      });
    });

    it('returns 404 for an unknown user', async () => {
      const res = await fetch(t.url('/users/missing-user/notifications'));
      expect(res.status).toBe(404);
    });
  });
});
