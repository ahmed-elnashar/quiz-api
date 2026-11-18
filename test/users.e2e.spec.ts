import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, postJson, type TestApp } from './app';

interface UserBody {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

const uniqueEmail = (): string => `user-${randomUUID()}@example.com`;

describe('Users (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  describe('POST /api/users', () => {
    it('creates a user and stores it', async () => {
      const email = uniqueEmail();

      const res = await postJson(t.url('/users'), { email, name: 'Alan Turing' });
      const body = (await res.json()) as UserBody;

      expect(res.status).toBe(201);
      expect(body).toMatchObject({ email, name: 'Alan Turing' });
      expect(typeof body.id).toBe('string');
      expect(Number.isNaN(Date.parse(body.createdAt))).toBe(false);
      const stored = await t.prisma.user.findUnique({ where: { id: body.id } });
      expect(stored).toMatchObject({ email, name: 'Alan Turing' });
    });

    it('trims the name and normalizes the email to lowercase', async () => {
      const local = `Mixed.Case-${randomUUID()}`;

      const res = await postJson(t.url('/users'), { email: `  ${local}@Example.COM `, name: '  Ada  ' });
      const body = (await res.json()) as UserBody;

      expect(res.status).toBe(201);
      expect(body.email).toBe(`${local.toLowerCase()}@example.com`);
      expect(body.name).toBe('Ada');
    });

    it('returns 409 when the email is already used, ignoring case', async () => {
      const email = uniqueEmail();
      await postJson(t.url('/users'), { email, name: 'First' });

      const res = await postJson(t.url('/users'), { email: email.toUpperCase(), name: 'Second' });

      expect(res.status).toBe(409);
      expect(await t.prisma.user.count({ where: { email } })).toBe(1);
    });

    it('returns 409 for concurrent signups with the same email', async () => {
      const email = uniqueEmail();

      const statuses = await Promise.all([
        postJson(t.url('/users'), { email, name: 'One' }),
        postJson(t.url('/users'), { email, name: 'Two' }),
      ]).then((responses) => responses.map((r) => r.status).toSorted());

      expect(statuses).toEqual([201, 409]);
    });

    it.each([
      ['an invalid email', { email: 'not-an-email', name: 'X' }],
      ['a missing email', { name: 'X' }],
      ['a missing name', { email: 'a@example.com' }],
      ['a blank name', { email: 'a@example.com', name: '   ' }],
      ['a name over 100 characters', { email: 'a@example.com', name: 'x'.repeat(101) }],
      ['unknown fields', { email: 'a@example.com', name: 'X', role: 'admin' }],
    ])('returns 400 for %s', async (_label, body) => {
      const res = await postJson(t.url('/users'), body);
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/users/:userId', () => {
    it('returns a stored user', async () => {
      const created = (await (await postJson(t.url('/users'), { email: uniqueEmail(), name: 'Grace' })).json()) as UserBody;

      const res = await fetch(t.url(`/users/${created.id}`));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(created);
    });

    it('returns 404 for an unknown user', async () => {
      const res = await fetch(t.url('/users/missing-user'));
      expect(res.status).toBe(404);
    });
  });

  it('supports the full flow through the API: user → quiz → attempt → submit → progress', async () => {
    const user = (await (await postJson(t.url('/users'), { email: uniqueEmail(), name: 'Flow' })).json()) as UserBody;
    const quiz = (await (
      await postJson(t.url('/quizzes'), {
        authorId: user.id,
        title: 'Flow quiz',
        topic: 'flow',
        questions: [
          {
            text: 'Pick A',
            explanation: 'A is right.',
            options: [
              { text: 'A', isCorrect: true },
              { text: 'B', isCorrect: false },
            ],
          },
        ],
      })
    ).json()) as { id: string; questions: { id: string; options: { id: string; text: string }[] }[] };
    const question = quiz.questions[0];
    const optionA = question?.options.find((o) => o.text === 'A');

    const attempt = (await (await postJson(t.url(`/users/${user.id}/attempts`), { quizId: quiz.id })).json()) as {
      id: string;
    };
    const submitRes = await postJson(t.url(`/users/${user.id}/attempts/${attempt.id}/submit`), {
      answers: [{ questionId: question?.id, optionId: optionA?.id }],
    });
    const progress = await (await fetch(t.url(`/users/${user.id}/progress`))).json();

    expect(submitRes.status).toBe(201);
    expect(await submitRes.json()).toMatchObject({ percentage: 100, message: 'You scored 100%. Perfect score!' });
    expect(progress).toMatchObject({ completedAttempts: 1, averagePercentage: 100, bestPercentage: 100 });
  });
});
