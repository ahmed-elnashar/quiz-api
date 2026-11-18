import { Injectable } from '@nestjs/common';
import { ATTEMPT_STATUS } from '../common/constants';
import { PrismaService } from '../prisma/prisma.service';
import { getPerformanceMessage } from '../scoring/scoring';

// The ONLY place that selects Option.isCorrect (CLAUDE.md rule):
// - findAnswerKey: grading inside submit.
// - findCompletedResult: results, filtered to COMPLETED attempts in the query.

export interface QuizAnswerKey {
  questions: { questionId: string; correctOptionId: string; optionIds: string[] }[];
}

export interface AttemptResult {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  status: typeof ATTEMPT_STATUS.COMPLETED;
  correct: number;
  total: number;
  percentage: number;
  message: string;
  startedAt: Date;
  completedAt: Date;
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

@Injectable()
export class AnswerKeyRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Answer key for grading, in question order. Throws if a question has no single correct option. */
  async findAnswerKey(quizId: string): Promise<QuizAnswerKey> {
    const questions = await this.prisma.question.findMany({
      where: { quizId },
      orderBy: { position: 'asc' },
      select: { id: true, options: { select: { id: true, isCorrect: true } } },
    });

    return {
      questions: questions.map((question) => ({
        questionId: question.id,
        correctOptionId: exactlyOneCorrect(
          question.id,
          question.options.filter((option) => option.isCorrect).map((option) => option.id),
        ),
        optionIds: question.options.map((option) => option.id),
      })),
    };
  }

  /** Full result with correctness and explanations. Null unless the attempt is COMPLETED and owned by the user. */
  async findCompletedResult(userId: string, attemptId: string): Promise<AttemptResult | null> {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id: attemptId, userId, status: ATTEMPT_STATUS.COMPLETED },
      select: {
        id: true,
        quizId: true,
        score: true,
        totalQuestions: true,
        percentage: true,
        startedAt: true,
        completedAt: true,
        quiz: { select: { title: true } },
        answers: {
          orderBy: { question: { position: 'asc' } },
          select: {
            questionId: true,
            optionId: true,
            isCorrect: true,
            question: {
              select: {
                position: true,
                text: true,
                explanation: true,
                options: { where: { isCorrect: true }, select: { id: true } },
              },
            },
          },
        },
      },
    });
    if (!attempt) return null;

    const { score, totalQuestions, percentage, completedAt } = attempt;
    if (score === null || totalQuestions === null || percentage === null || completedAt === null) {
      throw new Error(`Completed attempt ${attempt.id} is missing its score`);
    }

    return {
      attemptId: attempt.id,
      quizId: attempt.quizId,
      quizTitle: attempt.quiz.title,
      status: ATTEMPT_STATUS.COMPLETED,
      correct: score,
      total: totalQuestions,
      percentage,
      message: getPerformanceMessage(percentage),
      startedAt: attempt.startedAt,
      completedAt,
      questions: attempt.answers.map((answer) => ({
        questionId: answer.questionId,
        position: answer.question.position,
        text: answer.question.text,
        selectedOptionId: answer.optionId,
        correctOptionId: exactlyOneCorrect(
          answer.questionId,
          answer.question.options.map((option) => option.id),
        ),
        isCorrect: answer.isCorrect,
        explanation: answer.question.explanation,
      })),
    };
  }
}

/** Quizzes are validated on create, so anything but one correct option is a data bug. */
function exactlyOneCorrect(questionId: string, correctOptionIds: string[]): string {
  const [only] = correctOptionIds;
  if (correctOptionIds.length !== 1 || only === undefined) {
    throw new Error(`Question ${questionId} must have exactly one correct option, found ${correctOptionIds.length}`);
  }
  return only;
}
