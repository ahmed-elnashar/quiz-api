import { type INestApplicationContext, Logger } from '@nestjs/common';
import { createValidationPipe } from '../app.setup';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuizDto } from '../quizzes/dto/create-quiz.dto';
import { QuizzesService } from '../quizzes/quizzes.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UsersService } from '../users/users.service';
import { SEED_AUTHOR_EMAIL, SEED_QUIZZES, SEED_USERS, type SeedQuiz } from './seed-data';

export interface SeedSummary {
  usersCreated: string[];
  usersSkipped: string[];
  quizzesCreated: string[];
  quizzesSkipped: string[];
}

export interface SeedInput {
  users: readonly { email: string; name: string }[];
  authorEmail: string;
  quizzes: readonly SeedQuiz[];
}

const DEFAULT_INPUT: SeedInput = { users: SEED_USERS, authorEmail: SEED_AUTHOR_EMAIL, quizzes: SEED_QUIZZES };

/**
 * Creates the seed users and quizzes through UsersService and QuizzesService,
 * after running every body through the API's ValidationPipe. Idempotent:
 * users (by email) and quizzes (by title) that already exist are skipped.
 */
export async function seed(app: INestApplicationContext, input: SeedInput = DEFAULT_INPUT): Promise<SeedSummary> {
  const prisma = app.get(PrismaService);
  const users = app.get(UsersService);
  const quizzes = app.get(QuizzesService);
  const pipe = createValidationPipe();
  const summary: SeedSummary = { usersCreated: [], usersSkipped: [], quizzesCreated: [], quizzesSkipped: [] };

  for (const body of input.users) {
    const dto = (await pipe.transform(body, { type: 'body', metatype: CreateUserDto })) as CreateUserDto;
    const existing = await prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } });
    if (existing) {
      summary.usersSkipped.push(dto.email);
      continue;
    }
    await users.create(dto);
    summary.usersCreated.push(dto.email);
  }

  const author = await prisma.user.findUnique({ where: { email: input.authorEmail }, select: { id: true } });
  if (!author) {
    throw new Error(`Seed author ${input.authorEmail} is not one of the seeded users`);
  }

  for (const quiz of input.quizzes) {
    const dto = (await pipe.transform(
      { ...quiz, authorId: author.id },
      { type: 'body', metatype: CreateQuizDto },
    )) as CreateQuizDto;
    const existing = await prisma.quiz.findFirst({ where: { title: dto.title }, select: { id: true } });
    if (existing) {
      summary.quizzesSkipped.push(dto.title);
      continue;
    }
    await quizzes.create(dto);
    summary.quizzesCreated.push(dto.title);
  }

  return summary;
}

export function logSeedSummary(summary: SeedSummary, logger = new Logger('Seed')): void {
  logger.log(`Users created: ${summary.usersCreated.join(', ') || 'none'}`);
  logger.log(`Users already present: ${summary.usersSkipped.join(', ') || 'none'}`);
  logger.log(`Quizzes created: ${summary.quizzesCreated.join(', ') || 'none'}`);
  logger.log(`Quizzes already present: ${summary.quizzesSkipped.join(', ') || 'none'}`);
}
