import { Controller, Get, Param, Query } from '@nestjs/common';
// DTO classes must be value imports: ValidationPipe reads them from decorator metadata.
import { PaginationQueryDto, type Paginated } from '../common/dto/pagination-query.dto';
import { UserIdParamDto } from '../users/dto/user-params.dto';
import { type NotificationView, NotificationsService } from './notifications.service';

@Controller('users/:userId/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Param() params: UserIdParamDto, @Query() query: PaginationQueryDto): Promise<Paginated<NotificationView>> {
    return this.notifications.listForUser(params.userId, query);
  }
}
