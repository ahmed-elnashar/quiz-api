import { Module } from '@nestjs/common';
import { EMAIL_SERVICE, MockEmailService } from './email.service';
import { WORKER_CONFIG, workerConfigFromEnv } from './notifications.config';
import { NotificationsWorker } from './notifications.worker';

@Module({
  providers: [
    { provide: EMAIL_SERVICE, useClass: MockEmailService },
    { provide: WORKER_CONFIG, useFactory: workerConfigFromEnv },
    NotificationsWorker,
  ],
  exports: [NotificationsWorker],
})
export class NotificationsModule {}
