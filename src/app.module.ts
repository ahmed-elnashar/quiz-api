import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AttemptsModule } from './attempts/attempts.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProgressModule } from './progress/progress.module';
import { QuizzesModule } from './quizzes/quizzes.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [PrismaModule, UsersModule, QuizzesModule, AttemptsModule, ProgressModule, NotificationsModule],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
