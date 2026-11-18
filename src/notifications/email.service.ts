import { Injectable, Logger } from '@nestjs/common';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Port for sending email. Swap MockEmailService for a real provider later. */
export interface EmailService {
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE');

/**
 * Logs emails instead of sending them.
 * Fails every send while the EMAIL_FAIL environment variable is "true"
 * (read on each send, so it can be toggled without a restart).
 */
@Injectable()
export class MockEmailService implements EmailService {
  private readonly logger = new Logger(MockEmailService.name);

  async send(message: EmailMessage): Promise<void> {
    if (process.env.EMAIL_FAIL === 'true') {
      throw new Error('Mock email delivery failed (EMAIL_FAIL=true)');
    }
    this.logger.log(`Email to ${message.to}: ${message.subject}`);
  }
}
