import { IsNotEmpty, IsString } from 'class-validator';

export class UserIdParamDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;
}

export class UserAttemptParamsDto extends UserIdParamDto {
  @IsString()
  @IsNotEmpty()
  attemptId!: string;
}
