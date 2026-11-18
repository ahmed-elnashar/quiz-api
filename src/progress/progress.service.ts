import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ATTEMPT_STATUS } from '../common/constants';
import type { Paginated } from '../common/dto/pagination-query.dto';
import { AnswerKeyRepository, type AttemptResult } from '../attempts/answer-key.repository';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { publicQuestionSelect } from '../quizzes/quiz.selects';
import { getPerformanceMessage } from '../scoring/scoring';
import { UsersService } from '../users/users.service';
import type { ListAttemptsQueryDto } from './dto/list-attempts-query.dto';

// No select here may include Option.isCorrect or Question.explanation;
// full results go through AnswerKeyRepository.findCompletedResult.
const attemptSummarySelect = {
  id: true,
  quizId: true,
  status: true,
  score: true,
  totalQuestions: true,
  percentage: true,
  startedAt: true,
  completedAt: true,
  quiz: { select: { title: true } },
} satisfies Prisma.AttemptSelect;

type AttemptSummaryRow = Prisma.AttemptGetPayload<{ select: typeof attemptSummarySelect }>;

export interface AttemptSummary {
  id: string;
  quizId: string;
  quizTitle: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  /** null while in progress */
  correct: number | null;
  total: number | null;
  percentage: number | null;
  message: string | null;
}

export interface AttemptDetail extends AttemptSummary {
  /** Questions to answer while in progress (no answers); null once completed. */
  questions: { id: string; text: string; position: number; options: { id: string; text: string; position: number }[] }[] | null;
}

export interface ProgressStats {
  totalAttempts: number;
  completedAttempts: number;
  inProgressAttempts: number;
  /** Whole-number average percentage over completed attempts; null if none. */
  averagePercentage: number | null;
  /** Best percentage over completed attempts; null if none. */
  bestPercentage: number | null;
}

@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly answerKeys: AnswerKeyRepository,
  ) {}

  async listAttempts(userId: string, query: ListAttemptsQueryDto): Promise<Paginated<AttemptSummary>> {
    await this.users.assertExists(userId);
    const { page, limit, status, quizId } = query;
    const where: Prisma.AttemptWhereInput = { userId, ...(status && { status }), ...(quizId && { quizId }) };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.attempt.findMany({
        where,
        select: attemptSummarySelect,
        orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.attempt.count({ where }),
    ]);
    return { items: rows.map(toSummary), page, limit, total };
  }

  async getAttempt(userId: string, attemptId: string): Promise<AttemptDetail> {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id: attemptId, userId },
      select: {
        ...attemptSummarySelect,
        quiz: {
          select: { title: true, questions: { select: publicQuestionSelect, orderBy: { position: 'asc' } } },
        },
      },
    });
    if (!attempt) {
      throw new NotFoundException(`Attempt ${attemptId} not found`);
    }

    const inProgress = attempt.status === ATTEMPT_STATUS.IN_PROGRESS;
    return { ...toSummary(attempt), questions: inProgress ? attempt.quiz.questions : null };
  }

  /** Per-question correctness and explanations. Only for completed attempts (409 otherwise). */
  async getResult(userId: string, attemptId: string): Promise<AttemptResult> {
    const result = await this.answerKeys.findCompletedResult(userId, attemptId);
    if (result) return result;

    const attempt = await this.prisma.attempt.findFirst({ where: { id: attemptId, userId }, select: { id: true } });
    if (!attempt) {
      throw new NotFoundException(`Attempt ${attemptId} not found`);
    }
    throw new ConflictException(`Attempt ${attemptId} is not completed yet`);
  }

  async getStats(userId: string): Promise<ProgressStats> {
    await this.users.assertExists(userId);

    const [totalAttempts, completed] = await this.prisma.$transaction([
      this.prisma.attempt.count({ where: { userId } }),
      this.prisma.attempt.aggregate({
        where: { userId, status: ATTEMPT_STATUS.COMPLETED },
        _count: { _all: true },
        _avg: { percentage: true },
        _max: { percentage: true },
      }),
    ]);

    const average = completed._avg.percentage;
    return {
      totalAttempts,
      completedAttempts: completed._count._all,
      inProgressAttempts: totalAttempts - completed._count._all,
      averagePercentage: average === null ? null : Math.round(average),
      bestPercentage: completed._max.percentage,
    };
  }
}

function toSummary(row: AttemptSummaryRow): AttemptSummary {
  return {
    id: row.id,
    quizId: row.quizId,
    quizTitle: row.quiz.title,
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    correct: row.score,
    total: row.totalQuestions,
    percentage: row.percentage,
    message: row.percentage === null ? null : getPerformanceMessage(row.percentage),
  };
}
