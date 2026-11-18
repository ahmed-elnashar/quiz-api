import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Trim, TrimLower } from '../../common/transforms';
import { HasExactlyOneCorrectOption } from './has-exactly-one-correct-option';

export class CreateOptionDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  text!: string;

  @IsBoolean()
  isCorrect!: boolean;
}

export class CreateQuestionDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  text!: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  explanation!: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => CreateOptionDto)
  @HasExactlyOneCorrectOption()
  options!: CreateOptionDto[];
}

export class CreateQuizDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  authorId!: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @TrimLower()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  topic!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions!: CreateQuestionDto[];
}
