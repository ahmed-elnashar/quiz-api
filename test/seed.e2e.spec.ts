import { BadRequestException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seed } from '../src/seed/seed';
import { SEED_AUTHOR_EMAIL, SEED_QUIZZES, SEED_USERS } from '../src/seed/seed-data';
import { createTestApp, type TestApp } from './app';

describe('Seed (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('creates 2 users and 2 quizzes with 5 questions each', async () => {
    const summary = await seed(t.app);

    expect(summary.usersCreated).toEqual(['ada@example.com', 'alan@example.com']);
    expect(summary.quizzesCreated).toEqual(['Prompt Engineering Fundamentals', 'Retrieval-Augmented Generation (RAG)']);

    const quizzes = await t.prisma.quiz.findMany({
      where: { title: { in: SEED_QUIZZES.map((q) => q.title) } },
      select: {
        author: { select: { email: true } },
        questions: {
          select: { explanation: true, options: { select: { isCorrect: true } } },
        },
      },
    });
    expect(quizzes).toHaveLength(2);
    for (const quiz of quizzes) {
      expect(quiz.author.email).toBe(SEED_AUTHOR_EMAIL);
      expect(quiz.questions).toHaveLength(5);
      for (const question of quiz.questions) {
        expect(question.explanation).toBeTruthy();
        expect(question.options.filter((o) => o.isCorrect)).toHaveLength(1);
      }
    }
  });

  it('is idempotent: a second run creates nothing', async () => {
    const summary = await seed(t.app);

    expect(summary.usersCreated).toEqual([]);
    expect(summary.quizzesCreated).toEqual([]);
    expect(await t.prisma.user.count({ where: { email: { in: SEED_USERS.map((u) => u.email) } } })).toBe(2);
    expect(await t.prisma.quiz.count({ where: { title: SEED_QUIZZES[0]?.title } })).toBe(1);
  });

  it('serves the seeded quizzes through the API without answer keys', async () => {
    const list = (await (await fetch(t.url('/quizzes?limit=100'))).json()) as {
      items: { id: string; title: string; questionCount: number }[];
    };
    const seeded = list.items.filter((q) => SEED_QUIZZES.some((s) => s.title === q.title));
    expect(seeded.map((q) => q.questionCount)).toEqual([5, 5]);

    for (const quiz of seeded) {
      const raw = await (await fetch(t.url(`/quizzes/${quiz.id}`))).text();
      expect(raw).not.toContain('"isCorrect":');
      expect(raw).not.toContain('"explanation":');
    }
  });

  it('rejects seed data that fails API validation (two correct options)', async () => {
    const [first] = SEED_QUIZZES;
    if (!first) throw new Error('no seed quizzes');
    const broken = {
      ...first,
      title: 'Broken seed quiz',
      questions: first.questions.map((q) => ({ ...q, options: q.options.map((o) => ({ ...o, isCorrect: true })) })),
    };

    await expect(
      seed(t.app, { users: SEED_USERS, authorEmail: SEED_AUTHOR_EMAIL, quizzes: [broken] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await t.prisma.quiz.count({ where: { title: 'Broken seed quiz' } })).toBe(0);
  });

  it('rejects a seed user with an invalid email', async () => {
    await expect(
      seed(t.app, { users: [{ email: 'not-an-email', name: 'X' }], authorEmail: SEED_AUTHOR_EMAIL, quizzes: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
