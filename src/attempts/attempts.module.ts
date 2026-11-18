import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AnswerKeyRepository } from './answer-key.repository';
import { AttemptsController } from './attempts.controller';
import { AttemptsService } from './attempts.service';

@Module({
  imports: [UsersModule],
  controllers: [AttemptsController],
  providers: [AttemptsService, AnswerKeyRepository],
  exports: [AnswerKeyRepository],
})
export class AttemptsModule {}
