import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import type { Paginated } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateQuizDto } from './dto/create-quiz.dto';
import type { ListQuizzesQueryDto } from './dto/list-quizzes-query.dto';
import {
  type PublicQuizDetail,
  type QuizSummary,
  publicQuizDetailSelect,
  quizSummarySelect,
} from './quiz.selects';

@Injectable()
export class QuizzesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateQuizDto): Promise<PublicQuizDetail> {
    const author = await this.prisma.user.findUnique({
      where: { id: dto.authorId },
      select: { id: true },
    });
    if (!author) {
      throw new NotFoundException(`User ${dto.authorId} not found`);
    }

    // Positions are 1-based and follow the order of the request arrays.
    return this.prisma.quiz.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        topic: dto.topic,
        authorId: dto.authorId,
        questions: {
          create: dto.questions.map((question, questionIndex) => ({
            text: question.text,
            explanation: question.explanation,
            position: questionIndex + 1,
            options: {
              create: question.options.map((option, optionIndex) => ({
                text: option.text,
                isCorrect: option.isCorrect,
                position: optionIndex + 1,
              })),
            },
          })),
        },
      },
      select: publicQuizDetailSelect,
    });
  }

  async list(query: ListQuizzesQueryDto): Promise<Paginated<QuizSummary>> {
    const { page, limit, topic } = query;
    const where: Prisma.QuizWhereInput = topic ? { topic } : {};

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.quiz.findMany({
        where,
        select: quizSummarySelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.quiz.count({ where }),
    ]);

    const items = rows.map(({ _count, ...quiz }) => ({ ...quiz, questionCount: _count.questions }));
    return { items, page, limit, total };
  }

  async findById(id: string): Promise<PublicQuizDetail> {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      select: publicQuizDetailSelect,
    });
    if (!quiz) {
      throw new NotFoundException(`Quiz ${id} not found`);
    }
    return quiz;
  }
}
