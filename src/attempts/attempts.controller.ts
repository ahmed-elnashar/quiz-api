import { Body, Controller, Param, Post } from '@nestjs/common';
import type { AttemptResult } from './answer-key.repository';
import { AttemptsService, type StartedAttempt } from './attempts.service';
// DTO classes must be value imports: ValidationPipe reads them from decorator metadata.
import { StartAttemptDto } from './dto/start-attempt.dto';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import { UserAttemptParamsDto, UserIdParamDto } from './dto/user-params.dto';

@Controller('users/:userId/attempts')
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  @Post()
  start(@Param() params: UserIdParamDto, @Body() dto: StartAttemptDto): Promise<StartedAttempt> {
    return this.attempts.start(params.userId, dto);
  }

  @Post(':attemptId/submit')
  submit(@Param() params: UserAttemptParamsDto, @Body() dto: SubmitAttemptDto): Promise<AttemptResult> {
    return this.attempts.submit(params.userId, params.attemptId, dto);
  }
}
