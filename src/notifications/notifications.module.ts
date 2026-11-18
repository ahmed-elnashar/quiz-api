import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { EMAIL_SERVICE, MockEmailService } from './email.service';
import { WORKER_CONFIG, workerConfigFromEnv } from './notifications.config';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsWorker } from './notifications.worker';

@Module({
  imports: [UsersModule],
  controllers: [NotificationsController],
  providers: [
    { provide: EMAIL_SERVICE, useClass: MockEmailService },
    { provide: WORKER_CONFIG, useFactory: workerConfigFromEnv },
    NotificationsService,
    NotificationsWorker,
  ],
  exports: [NotificationsWorker],
})
export class NotificationsModule {}
