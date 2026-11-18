import { Body, Controller, Get, Param, Post } from '@nestjs/common';
// DTO classes must be value imports: ValidationPipe reads them from decorator metadata.
import { UserIdParamDto } from './dto/user-params.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { type PublicUser, UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  create(@Body() dto: CreateUserDto): Promise<PublicUser> {
    return this.users.create(dto);
  }

  @Get(':userId')
  findOne(@Param() params: UserIdParamDto): Promise<PublicUser> {
    return this.users.findById(params.userId);
  }
}
