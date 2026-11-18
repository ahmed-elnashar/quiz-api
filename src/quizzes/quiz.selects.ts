import type { Prisma } from '../generated/prisma/client';

// Public selects. These must NEVER include Option.isCorrect or
// Question.explanation; answer keys and feedback are only exposed in
// completed attempt results. Never use `include` on Option/Question.

export const publicOptionSelect = {
  id: true,
  text: true,
  position: true,
} satisfies Prisma.OptionSelect;

export const publicQuestionSelect = {
  id: true,
  text: true,
  position: true,
  options: { select: publicOptionSelect, orderBy: { position: 'asc' } },
} satisfies Prisma.QuestionSelect;

const quizFieldsSelect = {
  id: true,
  title: true,
  description: true,
  topic: true,
  authorId: true,
  createdAt: true,
} satisfies Prisma.QuizSelect;

export const quizSummarySelect = {
  ...quizFieldsSelect,
  _count: { select: { questions: true } },
} satisfies Prisma.QuizSelect;

export const publicQuizDetailSelect = {
  ...quizFieldsSelect,
  questions: { select: publicQuestionSelect, orderBy: { position: 'asc' } },
} satisfies Prisma.QuizSelect;

type QuizSummaryRow = Prisma.QuizGetPayload<{ select: typeof quizSummarySelect }>;

export type QuizSummary = Omit<QuizSummaryRow, '_count'> & { questionCount: number };
export type PublicQuizDetail = Prisma.QuizGetPayload<{ select: typeof publicQuizDetailSelect }>;
