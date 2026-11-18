import { IsNotEmpty, IsString } from 'class-validator';

export class QuizIdParamDto {
  @IsString()
  @IsNotEmpty()
  id!: string;
}
