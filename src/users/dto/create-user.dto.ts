import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim, TrimLower } from '../../common/transforms';

export class CreateUserDto {
  /** Stored trimmed and lowercased, so emails are unique case-insensitively. */
  @TrimLower()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}
