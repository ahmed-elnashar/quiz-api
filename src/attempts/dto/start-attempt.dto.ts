import { IsNotEmpty, IsString } from 'class-validator';
import { Trim } from '../../common/transforms';

export class StartAttemptDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  quizId!: string;
}
