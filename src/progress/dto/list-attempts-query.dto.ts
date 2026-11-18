import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { type AttemptStatus, ATTEMPT_STATUS } from '../../common/constants';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListAttemptsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(Object.values(ATTEMPT_STATUS))
  status?: AttemptStatus;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  quizId?: string;
}
