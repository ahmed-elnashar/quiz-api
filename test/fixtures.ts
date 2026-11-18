import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/prisma/prisma.service';
import { postJson, type TestApp } from './app';

export interface TestUser {
  id: string;
  name: string;
  email: string;
}

export async function createUser(prisma: PrismaService, name = 'Test User'): Promise<TestUser> {
  return prisma.user.create({
    data: { name, email: `user-${randomUUID()}@example.com` },
    select: { id: true, name: true, email: true },
  });
}

export interface TestQuiz {
  quizId: string;
  title: string;
  questions: { questionId: string; correctOptionId: string; wrongOptionId: string }[];
}

/** Creates a quiz through the API; reads the answer key from the DB (test-only). */
export async function createQuiz(t: TestApp, authorId: string, questionCount = 5): Promise<TestQuiz> {
  const title = `Quiz ${randomUUID().slice(0, 8)}`;
  const res = await postJson(t.url('/quizzes'), {
    authorId,
    title,
    topic: 'testing',
    questions: Array.from({ length: questionCount }, (_, i) => ({
      text: `Question ${i + 1}?`,
      explanation: `Explanation ${i + 1}.`,
      options: [
        { text: 'Right', isCorrect: true },
        { text: 'Wrong', isCorrect: false },
      ],
    })),
  });
  if (res.status !== 201) {
    throw new Error(`createQuiz failed: ${res.status} ${await res.text()}`);
  }
  const { id: quizId } = (await res.json()) as { id: string };

  const questions = await t.prisma.question.findMany({
    where: { quizId },
    orderBy: { position: 'asc' },
    select: { id: true, options: { select: { id: true, isCorrect: true } } },
  });
  return {
    quizId,
    title,
    questions: questions.map((q) => ({
      questionId: q.id,
      correctOptionId: q.options.find((o) => o.isCorrect)?.id ?? '',
      wrongOptionId: q.options.find((o) => !o.isCorrect)?.id ?? '',
    })),
  };
}

export async function startAttempt(t: TestApp, userId: string, quizId: string): Promise<string> {
  const res = await postJson(t.url(`/users/${userId}/attempts`), { quizId });
  if (res.status !== 201) {
    throw new Error(`startAttempt failed: ${res.status} ${await res.text()}`);
  }
  return ((await res.json()) as { id: string }).id;
}

/** Answers the first `correctCount` questions right and the rest wrong; `skip` question indexes are left out. */
export function answers(
  quiz: TestQuiz,
  correctCount: number,
  skip: number[] = [],
): { questionId: string; optionId: string }[] {
  return quiz.questions
    .map((q, i) => ({ q, i }))
    .filter(({ i }) => !skip.includes(i))
    .map(({ q, i }) => ({ questionId: q.questionId, optionId: i < correctCount ? q.correctOptionId : q.wrongOptionId }));
}

export async function submit(
  t: TestApp,
  userId: string,
  attemptId: string,
  body: unknown,
): Promise<Response> {
  return postJson(t.url(`/users/${userId}/attempts/${attemptId}/submit`), body);
}
