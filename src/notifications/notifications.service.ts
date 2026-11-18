import { Injectable } from '@nestjs/common';
import type { PaginationQueryDto, Paginated } from '../common/dto/pagination-query.dto';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { parsePayload, type QuizResultPayload } from './notification-payload';

const notificationSelect = {
  id: true,
  attemptId: true,
  type: true,
  channel: true,
  status: true,
  attempts: true,
  lastError: true,
  nextAttemptAt: true,
  sentAt: true,
  createdAt: true,
  payload: true,
} satisfies Prisma.NotificationSelect;

type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>;

export type NotificationView = Omit<NotificationRow, 'payload'> & { payload: QuizResultPayload };

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  /** A user's notifications, newest first, with delivery status and the email payload. */
  async listForUser(userId: string, query: PaginationQueryDto): Promise<Paginated<NotificationView>> {
    await this.users.assertExists(userId);
    const { page, limit } = query;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId },
        select: notificationSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);

    const items = rows.map((row) => ({ ...row, payload: parsePayload(row.payload) }));
    return { items, page, limit, total };
  }
}
