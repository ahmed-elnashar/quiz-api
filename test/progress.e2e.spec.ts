import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './app';
import { answers, createQuiz, createUser, startAttempt, submit, type TestQuiz, type TestUser } from './fixtures';

interface AttemptSummaryBody {
  id: string;
  quizId: string;
  quizTitle: string;
  status: string;
  correct: number | null;
  total: number | null;
  percentage: number | null;
  message: string | null;
  completedAt: string | null;
}

interface ListBody {
  items: AttemptSummaryBody[];
  page: number;
  limit: number;
  total: number;
}

async function getJson<T>(t: TestApp, path: string): Promise<{ status: number; body: T; raw: string }> {
  const res = await fetch(t.url(path));
  const raw = await res.text();
  return { status: res.status, body: JSON.parse(raw) as T, raw };
}

describe('Progress (e2e)', () => {
  let t: TestApp;
  let user: TestUser;
  let quizA: TestQuiz;
  let quizB: TestQuiz;
  let completedA80: string;
  let completedA40: string;
  let completedB100: string;
  let inProgressB: string;

  beforeAll(async () => {
    t = await createTestApp();
    user = await createUser(t.prisma);
    quizA = await createQuiz(t, user.id, 5);
    quizB = await createQuiz(t, user.id, 2);

    completedA80 = await startAttempt(t, user.id, quizA.quizId);
    await submit(t, user.id, completedA80, { answers: answers(quizA, 4) });
    completedA40 = await startAttempt(t, user.id, quizA.quizId);
    await submit(t, user.id, completedA40, { answers: answers(quizA, 2) });
    completedB100 = await startAttempt(t, user.id, quizB.quizId);
    await submit(t, user.id, completedB100, { answers: answers(quizB, 2) });
    inProgressB = await startAttempt(t, user.id, quizB.quizId);
  });

  afterAll(async () => {
    await t.app.close();
  });

  describe('GET /api/users/:userId/attempts (history)', () => {
    it('lists all attempts, newest first, with scores for completed ones', async () => {
      const { status, body, raw } = await getJson<ListBody>(t, `/users/${user.id}/attempts`);

      expect(status).toBe(200);
      expect(raw).not.toContain('"isCorrect":');
      expect(raw).not.toContain('"explanation":');
      expect(body.total).toBe(4);
      expect(body.items.map((a) => a.id)).toEqual([inProgressB, completedB100, completedA40, completedA80]);
      expect(body.items.find((a) => a.id === completedA80)).toMatchObject({
        quizTitle: quizA.title,
        status: 'COMPLETED',
        correct: 4,
        total: 5,
        percentage: 80,
        message: 'You scored 80%. Great job!',
      });
      expect(body.items.find((a) => a.id === inProgressB)).toMatchObject({
        status: 'IN_PROGRESS',
        correct: null,
        percentage: null,
        message: null,
        completedAt: null,
      });
    });

    it('filters by status and quiz', async () => {
      const completed = await getJson<ListBody>(t, `/users/${user.id}/attempts?status=COMPLETED`);
      const forQuizA = await getJson<ListBody>(t, `/users/${user.id}/attempts?quizId=${quizA.quizId}`);

      expect(completed.body.total).toBe(3);
      expect(forQuizA.body.items.map((a) => a.id).toSorted()).toEqual([completedA40, completedA80].toSorted());
    });

    it('paginates', async () => {
      const { body } = await getJson<ListBody>(t, `/users/${user.id}/attempts?page=2&limit=3`);

      expect(body).toMatchObject({ page: 2, limit: 3, total: 4 });
      expect(body.items.map((a) => a.id)).toEqual([completedA80]);
    });

    it('returns 400 for an invalid status filter', async () => {
      const { status } = await getJson(t, `/users/${user.id}/attempts?status=DONE`);
      expect(status).toBe(400);
    });

    it('returns 404 for an unknown user', async () => {
      const { status } = await getJson(t, '/users/missing-user/attempts');
      expect(status).toBe(404);
    });
  });

  describe('GET /api/users/:userId/attempts/:attemptId (detail)', () => {
    it('shows an in-progress attempt with its questions and no answer keys', async () => {
      const { status, body, raw } = await getJson<AttemptSummaryBody & { questions: unknown[] }>(
        t,
        `/users/${user.id}/attempts/${inProgressB}`,
      );

      expect(status).toBe(200);
      expect(raw).not.toContain('"isCorrect":');
      expect(raw).not.toContain('"explanation":');
      expect(body).toMatchObject({ id: inProgressB, status: 'IN_PROGRESS', percentage: null });
      expect(body.questions).toHaveLength(2);
    });

    it('shows a completed attempt with its score and message but no answer keys', async () => {
      const { body, raw } = await getJson<AttemptSummaryBody & { questions: unknown }>(
        t,
        `/users/${user.id}/attempts/${completedA80}`,
      );

      expect(raw).not.toContain('"isCorrect":');
      expect(raw).not.toContain('"explanation":');
      expect(body).toMatchObject({ status: 'COMPLETED', correct: 4, total: 5, percentage: 80, questions: null });
    });

    it("returns 404 for another user's attempt", async () => {
      const other = await createUser(t.prisma);
      const { status } = await getJson(t, `/users/${other.id}/attempts/${completedA80}`);
      expect(status).toBe(404);
    });
  });

  describe('GET /api/users/:userId/attempts/:attemptId/result', () => {
    it('returns per-question correctness and explanations for a completed attempt', async () => {
      const { status, body } = await getJson<{
        percentage: number;
        message: string;
        questions: { isCorrect: boolean; correctOptionId: string; explanation: string }[];
      }>(t, `/users/${user.id}/attempts/${completedA40}/result`);

      expect(status).toBe(200);
      expect(body.percentage).toBe(40);
      expect(body.message).toBe('You scored 40%. Keep learning: review the explanations and try again.');
      expect(body.questions.map((q) => q.isCorrect)).toEqual([true, true, false, false, false]);
      expect(body.questions[2]).toMatchObject({
        correctOptionId: quizA.questions[2]?.correctOptionId,
        explanation: 'Explanation 3.',
      });
    });

    it('returns 409 for an in-progress attempt without exposing answers', async () => {
      const { status, raw } = await getJson(t, `/users/${user.id}/attempts/${inProgressB}/result`);

      expect(status).toBe(409);
      expect(raw).not.toContain('"isCorrect":');
      expect(raw).not.toContain('"correctOptionId":');
    });

    it('returns 404 for an unknown attempt', async () => {
      const { status } = await getJson(t, `/users/${user.id}/attempts/missing/result`);
      expect(status).toBe(404);
    });

    it("returns 404 for another user's completed attempt", async () => {
      const other = await createUser(t.prisma);
      const { status } = await getJson(t, `/users/${other.id}/attempts/${completedA80}/result`);
      expect(status).toBe(404);
    });
  });

  describe('GET /api/users/:userId/progress (stats)', () => {
    it('reports total, completed, average and best over completed attempts', async () => {
      const { status, body } = await getJson(t, `/users/${user.id}/progress`);

      // Completed: 80%, 40%, 100% -> average 73.3 -> 73, best 100.
      expect(status).toBe(200);
      expect(body).toEqual({
        totalAttempts: 4,
        completedAttempts: 3,
        inProgressAttempts: 1,
        averagePercentage: 73,
        bestPercentage: 100,
      });
    });

    it('reports null average and best for a user with no completed attempts', async () => {
      const newcomer = await createUser(t.prisma);
      await startAttempt(t, newcomer.id, quizA.quizId);

      const { body } = await getJson(t, `/users/${newcomer.id}/progress`);

      expect(body).toEqual({
        totalAttempts: 1,
        completedAttempts: 0,
        inProgressAttempts: 1,
        averagePercentage: null,
        bestPercentage: null,
      });
    });

    it('returns 404 for an unknown user', async () => {
      const { status } = await getJson(t, '/users/missing-user/progress');
      expect(status).toBe(404);
    });
  });
});
