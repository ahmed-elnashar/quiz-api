import { Controller, Get, Param, Query } from '@nestjs/common';
import type { Paginated } from '../common/dto/pagination-query.dto';
import type { AttemptResult } from '../attempts/answer-key.repository';
// DTO classes must be value imports: ValidationPipe reads them from decorator metadata.
import { UserAttemptParamsDto, UserIdParamDto } from '../users/dto/user-params.dto';
import { ListAttemptsQueryDto } from './dto/list-attempts-query.dto';
import { type AttemptDetail, type AttemptSummary, ProgressService, type ProgressStats } from './progress.service';

@Controller('users/:userId')
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get('attempts')
  listAttempts(@Param() params: UserIdParamDto, @Query() query: ListAttemptsQueryDto): Promise<Paginated<AttemptSummary>> {
    return this.progress.listAttempts(params.userId, query);
  }

  @Get('attempts/:attemptId')
  getAttempt(@Param() params: UserAttemptParamsDto): Promise<AttemptDetail> {
    return this.progress.getAttempt(params.userId, params.attemptId);
  }

  @Get('attempts/:attemptId/result')
  getResult(@Param() params: UserAttemptParamsDto): Promise<AttemptResult> {
    return this.progress.getResult(params.userId, params.attemptId);
  }

  @Get('progress')
  getStats(@Param() params: UserIdParamDto): Promise<ProgressStats> {
    return this.progress.getStats(params.userId);
  }
}
