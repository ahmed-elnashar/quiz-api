import { Module } from '@nestjs/common';
import { AttemptsModule } from '../attempts/attempts.module';
import { UsersModule } from '../users/users.module';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

@Module({
  imports: [UsersModule, AttemptsModule],
  controllers: [ProgressController],
  providers: [ProgressService],
})
export class ProgressModule {}
