import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ATTEMPT_STATUS,
  NOTIFICATION_CHANNEL,
  NOTIFICATION_STATUS,
  NOTIFICATION_TYPE,
} from '../common/constants';
import { serializePayload } from '../notifications/notification-payload';
import { PrismaService } from '../prisma/prisma.service';
import { publicQuestionSelect } from '../quizzes/quiz.selects';
import { calculateScore, getPerformanceMessage, type SubmittedAnswer } from '../scoring/scoring';
import { UsersService } from '../users/users.service';
import { AnswerKeyRepository, type AttemptResult, type QuizAnswerKey } from './answer-key.repository';
import type { StartAttemptDto } from './dto/start-attempt.dto';
import type { SubmitAttemptDto } from './dto/submit-attempt.dto';

export interface StartedAttempt {
  id: string;
  quizId: string;
  quizTitle: string;
  status: string;
  startedAt: Date;
  questions: { id: string; text: string; position: number; options: { id: string; text: string; position: number }[] }[];
}

@Injectable()
export class AttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly answerKeys: AnswerKeyRepository,
  ) {}

  /** Starts an attempt and returns the quiz questions without answers. */
  async start(userId: string, dto: StartAttemptDto): Promise<StartedAttempt> {
    await this.users.assertExists(userId);
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: dto.quizId },
      select: { id: true, title: true, questions: { select: publicQuestionSelect, orderBy: { position: 'asc' } } },
    });
    if (!quiz) {
      throw new NotFoundException(`Quiz ${dto.quizId} not found`);
    }

    const attempt = await this.prisma.attempt.create({
      data: { userId, quizId: quiz.id, status: ATTEMPT_STATUS.IN_PROGRESS },
      select: { id: true, status: true, startedAt: true },
    });
    return { ...attempt, quizId: quiz.id, quizTitle: quiz.title, questions: quiz.questions };
  }

  /**
   * Grades the attempt and, in ONE transaction, stores the answers, the score
   * and a PENDING notification. Email is sent later by NotificationsWorker, so
   * an email failure can never fail the submission.
   */
  async submit(userId: string, attemptId: string, dto: SubmitAttemptDto): Promise<AttemptResult> {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id: attemptId, userId },
      select: {
        id: true,
        quizId: true,
        status: true,
        user: { select: { name: true, email: true } },
        quiz: { select: { title: true } },
      },
    });
    if (!attempt) {
      throw new NotFoundException(`Attempt ${attemptId} not found`);
    }
    if (attempt.status !== ATTEMPT_STATUS.IN_PROGRESS) {
      throw new ConflictException(`Attempt ${attemptId} has already been submitted`);
    }

    const answerKey = await this.answerKeys.findAnswerKey(attempt.quizId);
    assertAnswersBelongToQuiz(answerKey, dto.answers);

    const score = calculateScore(answerKey.questions, dto.answers);
    const completedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Conditional update: only one concurrent submit can move IN_PROGRESS -> COMPLETED.
      const { count } = await tx.attempt.updateMany({
        where: { id: attempt.id, status: ATTEMPT_STATUS.IN_PROGRESS },
        data: {
          status: ATTEMPT_STATUS.COMPLETED,
          score: score.correct,
          totalQuestions: score.total,
          percentage: score.percentage,
          completedAt,
        },
      });
      if (count !== 1) {
        throw new ConflictException(`Attempt ${attemptId} has already been submitted`);
      }

      await tx.attemptAnswer.createMany({
        data: score.questions.map((question) => ({
          attemptId: attempt.id,
          questionId: question.questionId,
          optionId: question.selectedOptionId,
          isCorrect: question.isCorrect,
        })),
      });

      await tx.notification.create({
        data: {
          userId,
          attemptId: attempt.id,
          type: NOTIFICATION_TYPE.QUIZ_RESULT,
          channel: NOTIFICATION_CHANNEL.EMAIL,
          status: NOTIFICATION_STATUS.PENDING,
          payload: serializePayload({
            userName: attempt.user.name,
            userEmail: attempt.user.email,
            quizTitle: attempt.quiz.title,
            score: { correct: score.correct, total: score.total },
            percentage: score.percentage,
            message: getPerformanceMessage(score.percentage),
            completedAt: completedAt.toISOString(),
          }),
        },
      });
    });

    const result = await this.answerKeys.findCompletedResult(userId, attempt.id);
    if (!result) {
      throw new Error(`Attempt ${attempt.id} was submitted but its result could not be loaded`);
    }
    return result;
  }
}

/** 400 for answers to questions outside the quiz, options outside the question, or duplicates. */
function assertAnswersBelongToQuiz(answerKey: QuizAnswerKey, answers: SubmittedAnswer[]): void {
  const optionsByQuestion = new Map(answerKey.questions.map((q) => [q.questionId, new Set(q.optionIds)]));
  const seen = new Set<string>();

  for (const { questionId, optionId } of answers) {
    const options = optionsByQuestion.get(questionId);
    if (!options) {
      throw new BadRequestException(`Question ${questionId} does not belong to this quiz`);
    }
    if (!options.has(optionId)) {
      throw new BadRequestException(`Option ${optionId} does not belong to question ${questionId}`);
    }
    if (seen.has(questionId)) {
      throw new BadRequestException(`Question ${questionId} is answered more than once`);
    }
    seen.add(questionId);
  }
}
