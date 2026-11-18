import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../src/generated/prisma/client';
import { QuizzesService } from '../src/quizzes/quizzes.service';
import { createTestApp, postJson, type TestApp } from './app';

interface QuizDetailBody {
  id: string;
  title: string;
  topic: string;
  authorId: string;
  questions: { id: string; text: string; position: number; options: { id: string; text: string; position: number }[] }[];
}

interface QuizListBody {
  items: { id: string; topic: string; questionCount: number }[];
  page: number;
  limit: number;
  total: number;
}

function validQuiz(authorId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    authorId,
    title: 'Prompt Engineering Basics',
    description: 'Core prompting techniques',
    topic: '  Prompting ',
    questions: [
      {
        text: 'What does few-shot prompting mean?',
        explanation: 'Few-shot prompting includes a handful of worked examples in the prompt.',
        options: [
          { text: 'Giving the model a few examples in the prompt', isCorrect: true },
          { text: 'Fine-tuning on a small dataset', isCorrect: false },
          { text: 'Limiting the output to a few tokens', isCorrect: false },
        ],
      },
      {
        text: 'Which setting makes output more deterministic?',
        explanation: 'Lower temperature reduces sampling randomness.',
        options: [
          { text: 'Higher temperature', isCorrect: false },
          { text: 'Lower temperature', isCorrect: true },
        ],
      },
    ],
    ...overrides,
  };
}

function expectNoAnswerKeyLeak(rawBody: string): void {
  expect(rawBody).not.toContain('isCorrect');
  expect(rawBody).not.toContain('explanation');
}

describe('Quizzes (e2e)', () => {
  let t: TestApp;
  let authorId: string;

  beforeAll(async () => {
    t = await createTestApp();
    const author = await t.prisma.user.create({
      data: { email: `author-${Date.now()}@example.com`, name: 'Quiz Author' },
    });
    authorId = author.id;
  });

  afterAll(async () => {
    await t.app.close();
  });

  describe('POST /api/quizzes', () => {
    it('creates a quiz and returns the public view without answer keys', async () => {
      const res = await postJson(t.url('/quizzes'), validQuiz(authorId));
      const raw = await res.text();

      expect(res.status).toBe(201);
      expectNoAnswerKeyLeak(raw);

      const body = JSON.parse(raw) as QuizDetailBody;
      expect(body.title).toBe('Prompt Engineering Basics');
      expect(body.topic).toBe('prompting');
      expect(body.authorId).toBe(authorId);
      expect(body.questions.map((q) => q.position)).toEqual([1, 2]);
      expect(body.questions[0]?.options.map((o) => o.position)).toEqual([1, 2, 3]);
    });

    it('stores the correct option and explanation', async () => {
      const res = await postJson(t.url('/quizzes'), validQuiz(authorId));
      const body = (await res.json()) as QuizDetailBody;

      const stored = await t.prisma.question.findMany({
        where: { quizId: body.id },
        orderBy: { position: 'asc' },
        select: { explanation: true, options: { select: { isCorrect: true }, orderBy: { position: 'asc' } } },
      });
      expect(stored[0]?.explanation).toContain('worked examples');
      expect(stored[0]?.options.map((o) => o.isCorrect)).toEqual([true, false, false]);
      expect(stored[1]?.options.map((o) => o.isCorrect)).toEqual([false, true]);
    });

    it.each([
      [
        'no correct option',
        [{ text: 'A', isCorrect: false }, { text: 'B', isCorrect: false }],
      ],
      [
        'two correct options',
        [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: true }],
      ],
      ['a single option', [{ text: 'A', isCorrect: true }]],
    ])('rejects a question with %s', async (_label, options) => {
      const quiz = validQuiz(authorId, {
        questions: [{ text: 'Q?', explanation: 'Because.', options }],
      });
      const res = await postJson(t.url('/quizzes'), quiz);
      expect(res.status).toBe(400);
    });

    it.each([
      ['missing', undefined],
      ['blank', '   '],
    ])('rejects a question with a %s explanation', async (_label, explanation) => {
      const quiz = validQuiz(authorId, {
        questions: [
          {
            text: 'Q?',
            explanation,
            options: [
              { text: 'A', isCorrect: true },
              { text: 'B', isCorrect: false },
            ],
          },
        ],
      });
      const res = await postJson(t.url('/quizzes'), quiz);
      expect(res.status).toBe(400);
    });

    it('rejects a quiz with no questions', async () => {
      const res = await postJson(t.url('/quizzes'), validQuiz(authorId, { questions: [] }));
      expect(res.status).toBe(400);
    });

    it('rejects unknown fields', async () => {
      const res = await postJson(t.url('/quizzes'), validQuiz(authorId, { isPublished: true }));
      expect(res.status).toBe(400);
    });

    it('returns 404 when the author does not exist', async () => {
      const res = await postJson(t.url('/quizzes'), validQuiz('missing-user'));
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/quizzes/:id', () => {
    it('returns the quiz with ordered questions and options, without answer keys', async () => {
      const created = (await (await postJson(t.url('/quizzes'), validQuiz(authorId))).json()) as QuizDetailBody;

      const res = await fetch(t.url(`/quizzes/${created.id}`));
      const raw = await res.text();

      expect(res.status).toBe(200);
      expectNoAnswerKeyLeak(raw);
      expect(JSON.parse(raw)).toEqual(created);
    });

    it('returns 404 for an unknown quiz', async () => {
      const res = await fetch(t.url('/quizzes/does-not-exist'));
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/quizzes', () => {
    it('lists quizzes with question counts, filtered by topic and paginated', async () => {
      const ragTopic = `rag-${Date.now()}`;
      for (let i = 0; i < 3; i++) {
        await postJson(t.url('/quizzes'), validQuiz(authorId, { topic: ragTopic }));
      }

      const res = await fetch(t.url(`/quizzes?topic=${ragTopic.toUpperCase()}&page=2&limit=2`));
      const raw = await res.text();

      expect(res.status).toBe(200);
      expectNoAnswerKeyLeak(raw);
      const body = JSON.parse(raw) as QuizListBody;
      expect(body.total).toBe(3);
      expect(body.page).toBe(2);
      expect(body.limit).toBe(2);
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({ topic: ragTopic, questionCount: 2 });
    });

    it.each(['page=0', 'limit=101', 'page=abc', 'unknown=1'])('rejects invalid query %s', async (query) => {
      const res = await fetch(t.url(`/quizzes?${query}`));
      expect(res.status).toBe(400);
    });
  });

  describe('error handling', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns 400 for a malformed JSON body', async () => {
      const res = await fetch(t.url('/quizzes'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"title": ',
      });
      expect(res.status).toBe(400);
    });

    it('returns a generic 500 without internal details for unexpected errors', async () => {
      vi.spyOn(t.app.get(QuizzesService), 'findById').mockRejectedValueOnce(new Error('disk I/O error at /var/db'));

      const res = await fetch(t.url('/quizzes/any-id'));
      const body = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body).toMatchObject({ statusCode: 500, message: 'Internal server error', path: '/api/quizzes/any-id' });
      expect(JSON.stringify(body)).not.toContain('disk I/O');
    });

    it('maps a foreign key violation (author deleted mid-request) to 409', async () => {
      vi.spyOn(t.app.get(QuizzesService), 'create').mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Foreign key constraint violated', {
          code: 'P2003',
          clientVersion: 'test',
        }),
      );

      const res = await postJson(t.url('/quizzes'), validQuiz(authorId));
      expect(res.status).toBe(409);
    });

    it('keeps the standard error shape for validation errors', async () => {
      const res = await postJson(t.url('/quizzes'), validQuiz(authorId, { title: '' }));
      const body = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body).toMatchObject({ statusCode: 400, error: 'Bad Request', path: '/api/quizzes' });
      expect(body.message).toEqual(expect.arrayContaining(['title should not be empty']));
      expect(typeof body.timestamp).toBe('string');
    });
  });
});
