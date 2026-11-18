import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { postJson, createTestApp, type TestApp } from './app';
import { answers, createQuiz, createUser, startAttempt, submit, type TestQuiz, type TestUser } from './fixtures';

interface ResultBody {
  attemptId: string;
  status: string;
  correct: number;
  total: number;
  percentage: number;
  message: string;
  completedAt: string;
  questions: {
    questionId: string;
    position: number;
    text: string;
    selectedOptionId: string | null;
    correctOptionId: string;
    isCorrect: boolean;
    explanation: string | null;
  }[];
}

describe('Attempts (e2e)', () => {
  let t: TestApp;
  let user: TestUser;
  let quiz: TestQuiz;

  beforeAll(async () => {
    t = await createTestApp();
    user = await createUser(t.prisma, 'Ada Lovelace');
    quiz = await createQuiz(t, user.id, 5);
  });

  afterAll(async () => {
    await t.app.close();
  });

  describe('POST /api/users/:userId/attempts (start)', () => {
    it('starts an attempt and returns the questions without answers', async () => {
      const res = await postJson(t.url(`/users/${user.id}/attempts`), { quizId: quiz.quizId });
      const raw = await res.text();

      expect(res.status).toBe(201);
      expect(raw).not.toContain('"isCorrect":');
      expect(raw).not.toContain('"explanation":');
      expect(raw).not.toContain('"correctOptionId":');
      const body = JSON.parse(raw) as { status: string; quizTitle: string; questions: { options: unknown[] }[] };
      expect(body.status).toBe('IN_PROGRESS');
      expect(body.quizTitle).toBe(quiz.title);
      expect(body.questions).toHaveLength(5);
      expect(body.questions[0]?.options).toHaveLength(2);
    });

    it('returns 404 for an unknown quiz', async () => {
      const res = await postJson(t.url(`/users/${user.id}/attempts`), { quizId: 'missing-quiz' });
      expect(res.status).toBe(404);
    });

    it('returns 404 for an unknown user', async () => {
      const res = await postJson(t.url('/users/missing-user/attempts'), { quizId: quiz.quizId });
      expect(res.status).toBe(404);
    });

    it('returns 400 without a quizId', async () => {
      const res = await postJson(t.url(`/users/${user.id}/attempts`), {});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/users/:userId/attempts/:attemptId/submit', () => {
    it('returns score, per-question correctness, explanations and message (4/5 = 80%)', async () => {
      const attemptId = await startAttempt(t, user.id, quiz.quizId);

      const res = await submit(t, user.id, attemptId, { answers: answers(quiz, 4) });
      const body = (await res.json()) as ResultBody;

      expect(res.status).toBe(201);
      expect(body).toMatchObject({
        attemptId,
        status: 'COMPLETED',
        correct: 4,
        total: 5,
        percentage: 80,
        message: 'You scored 80%. Great job!',
      });
      expect(body.questions.map((q) => q.isCorrect)).toEqual([true, true, true, true, false]);
      expect(body.questions[4]).toMatchObject({
        questionId: quiz.questions[4]?.questionId,
        selectedOptionId: quiz.questions[4]?.wrongOptionId,
        correctOptionId: quiz.questions[4]?.correctOptionId,
        explanation: 'Explanation 5.',
      });
    });

    it('counts skipped questions as wrong', async () => {
      const attemptId = await startAttempt(t, user.id, quiz.quizId);

      const res = await submit(t, user.id, attemptId, { answers: answers(quiz, 5, [1, 3]) });
      const body = (await res.json()) as ResultBody;

      expect(body).toMatchObject({ correct: 3, total: 5, percentage: 60 });
      expect(body.questions[1]).toMatchObject({ selectedOptionId: null, isCorrect: false });
    });

    it('accepts an empty submission as 0%', async () => {
      const attemptId = await startAttempt(t, user.id, quiz.quizId);

      const body = (await (await submit(t, user.id, attemptId, { answers: [] })).json()) as ResultBody;

      expect(body).toMatchObject({ correct: 0, total: 5, percentage: 0 });
    });

    it('stores answers, score and a PENDING notification with the email payload', async () => {
      const attemptId = await startAttempt(t, user.id, quiz.quizId);
      const body = (await (await submit(t, user.id, attemptId, { answers: answers(quiz, 4) })).json()) as ResultBody;

      const attempt = await t.prisma.attempt.findUniqueOrThrow({
        where: { id: attemptId },
        select: { status: true, score: true, totalQuestions: true, percentage: true, _count: { select: { answers: true } } },
      });
      expect(attempt).toEqual({ status: 'COMPLETED', score: 4, totalQuestions: 5, percentage: 80, _count: { answers: 5 } });

      const notification = await t.prisma.notification.findUniqueOrThrow({ where: { attemptId } });
      expect(notification).toMatchObject({
        userId: user.id,
        type: 'QUIZ_RESULT',
        channel: 'EMAIL',
        status: 'PENDING',
        attempts: 0,
        lastError: null,
        sentAt: null,
      });
      expect(JSON.parse(notification.payload)).toEqual({
        userName: 'Ada Lovelace',
        userEmail: user.email,
        quizTitle: quiz.title,
        score: { correct: 4, total: 5 },
        percentage: 80,
        message: 'You scored 80%. Great job!',
        completedAt: body.completedAt,
      });
    });

    it('returns 409 on resubmit and keeps the first result', async () => {
      const attemptId = await startAttempt(t, user.id, quiz.quizId);
      await submit(t, user.id, attemptId, { answers: answers(quiz, 4) });

      const res = await submit(t, user.id, attemptId, { answers: answers(quiz, 5) });

      expect(res.status).toBe(409);
      const attempt = await t.prisma.attempt.findUniqueOrThrow({ where: { id: attemptId }, select: { score: true } });
      expect(attempt.score).toBe(4);
      expect(await t.prisma.notification.count({ where: { attemptId } })).toBe(1);
    });

    it('lets only one of two concurrent submits succeed', async () => {
      const attemptId = await startAttempt(t, user.id, quiz.quizId);

      const statuses = await Promise.all([
        submit(t, user.id, attemptId, { answers: answers(quiz, 5) }),
        submit(t, user.id, attemptId, { answers: answers(quiz, 1) }),
      ]).then((responses) => responses.map((r) => r.status).toSorted());

      expect(statuses).toEqual([201, 409]);
      expect(await t.prisma.notification.count({ where: { attemptId } })).toBe(1);
      expect(await t.prisma.attemptAnswer.count({ where: { attemptId } })).toBe(5);
    });

    describe('foreign answers (400, nothing stored)', () => {
      let otherQuiz: TestQuiz;

      beforeAll(async () => {
        otherQuiz = await createQuiz(t, user.id, 2);
      });

      it.each([
        ['a question from another quiz', () => ({ questionId: otherQuiz.questions[0]?.questionId, optionId: otherQuiz.questions[0]?.correctOptionId })],
        ['an option from another question', () => ({ questionId: quiz.questions[0]?.questionId, optionId: quiz.questions[1]?.correctOptionId })],
        ['an option from another quiz', () => ({ questionId: quiz.questions[0]?.questionId, optionId: otherQuiz.questions[0]?.correctOptionId })],
        ['an unknown question id', () => ({ questionId: 'no-such-question', optionId: quiz.questions[0]?.correctOptionId })],
      ])('rejects %s', async (_label, foreignAnswer) => {
        const attemptId = await startAttempt(t, user.id, quiz.quizId);

        const res = await submit(t, user.id, attemptId, { answers: [...answers(quiz, 5).slice(1), foreignAnswer()] });

        expect(res.status).toBe(400);
        const attempt = await t.prisma.attempt.findUniqueOrThrow({ where: { id: attemptId }, select: { status: true } });
        expect(attempt.status).toBe('IN_PROGRESS');
        expect(await t.prisma.attemptAnswer.count({ where: { attemptId } })).toBe(0);
        expect(await t.prisma.notification.count({ where: { attemptId } })).toBe(0);
      });

      it('rejects the same question answered twice', async () => {
        const attemptId = await startAttempt(t, user.id, quiz.quizId);
        const first = quiz.questions[0];

        const res = await submit(t, user.id, attemptId, {
          answers: [
            { questionId: first?.questionId, optionId: first?.correctOptionId },
            { questionId: first?.questionId, optionId: first?.wrongOptionId },
          ],
        });

        expect(res.status).toBe(400);
      });

      it('still accepts a valid submit after a rejected one', async () => {
        const attemptId = await startAttempt(t, user.id, quiz.quizId);
        await submit(t, user.id, attemptId, { answers: [{ questionId: 'no-such-question', optionId: 'x' }] });

        const res = await submit(t, user.id, attemptId, { answers: answers(quiz, 5) });

        expect(res.status).toBe(201);
      });
    });

    it.each([
      ['missing answers', {}],
      ['answers not an array', { answers: 'all of them' }],
      ['an answer without optionId', { answers: [{ questionId: 'q1' }] }],
      ['unknown fields', { answers: [], extra: true }],
    ])('returns 400 for %s', async (_label, body) => {
      const attemptId = await startAttempt(t, user.id, quiz.quizId);
      const res = await submit(t, user.id, attemptId, body);
      expect(res.status).toBe(400);
    });

    it("returns 404 when submitting another user's attempt", async () => {
      const other = await createUser(t.prisma);
      const attemptId = await startAttempt(t, other.id, quiz.quizId);

      const res = await submit(t, user.id, attemptId, { answers: answers(quiz, 5) });

      expect(res.status).toBe(404);
    });

    it('rolls back answers and score when the notification insert fails', async () => {
      const attemptId = await startAttempt(t, user.id, quiz.quizId);
      // A notification already linked to this attempt makes the insert in the
      // submit transaction violate the unique attemptId constraint.
      await t.prisma.notification.create({
        data: { userId: user.id, attemptId, type: 'QUIZ_RESULT', payload: '{}' },
      });

      const res = await submit(t, user.id, attemptId, { answers: answers(quiz, 5) });

      expect(res.status).toBe(409);
      const attempt = await t.prisma.attempt.findUniqueOrThrow({
        where: { id: attemptId },
        select: { status: true, score: true, percentage: true },
      });
      expect(attempt).toEqual({ status: 'IN_PROGRESS', score: null, percentage: null });
      expect(await t.prisma.attemptAnswer.count({ where: { attemptId } })).toBe(0);
    });
  });
});
