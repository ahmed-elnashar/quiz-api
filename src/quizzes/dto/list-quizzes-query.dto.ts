import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { TrimLower } from '../../common/transforms';

export class ListQuizzesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @TrimLower()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  topic?: string;
}
