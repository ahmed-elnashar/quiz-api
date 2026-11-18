import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Prisma } from '../../generated/prisma/client';

export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

interface MappedError {
  statusCode: number;
  error: string;
  message: string | string[];
}

/** Prisma error codes that are caused by client input, not by a bug. */
const PRISMA_ERROR_MAP: Record<string, MappedError> = {
  P2002: { statusCode: HttpStatus.CONFLICT, error: 'Conflict', message: 'A record with these values already exists' },
  P2003: {
    statusCode: HttpStatus.CONFLICT,
    error: 'Conflict',
    message: 'A related record does not exist or is still referenced',
  },
  P2025: { statusCode: HttpStatus.NOT_FOUND, error: 'Not Found', message: 'Record not found' },
};

const INTERNAL_ERROR: MappedError = {
  statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  error: 'Internal Server Error',
  message: 'Internal server error',
};

/**
 * Global safety net for every request. Controllers and services do not
 * try/catch just to convert errors: they throw, and this filter turns the
 * error into a consistent JSON response.
 *
 * - HttpException (incl. ValidationPipe 400s): passed through unchanged.
 * - Known Prisma errors (unique, foreign key, not found): mapped to 4xx.
 * - Anything else: logged with its stack and returned as a generic 500.
 *   Internal details are never sent to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request: unknown = ctx.getRequest();
    const method = String(httpAdapter.getRequestMethod(request));
    const path = String(httpAdapter.getRequestUrl(request));

    const mapped = toMappedError(exception);
    if (mapped.statusCode >= 500) {
      this.logger.error(
        `${method} ${path} failed: ${describe(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body: ErrorResponseBody = { ...mapped, path, timestamp: new Date().toISOString() };
    httpAdapter.reply(ctx.getResponse(), body, mapped.statusCode);
  }
}

export function toMappedError(exception: unknown): MappedError {
  if (exception instanceof HttpException) {
    return fromHttpException(exception);
  }
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    return PRISMA_ERROR_MAP[exception.code] ?? INTERNAL_ERROR;
  }
  return INTERNAL_ERROR;
}

function fromHttpException(exception: HttpException): MappedError {
  const statusCode = exception.getStatus();
  const response = exception.getResponse();

  if (typeof response === 'string') {
    return { statusCode, error: exception.name, message: response };
  }

  const { error, message } = response as { error?: unknown; message?: unknown };
  return {
    statusCode,
    error: typeof error === 'string' ? error : exception.name,
    message: isMessage(message) ? message : exception.message,
  };
}

function isMessage(value: unknown): value is string | string[] {
  return typeof value === 'string' || (Array.isArray(value) && value.every((v) => typeof v === 'string'));
}

function describe(exception: unknown): string {
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    return `Prisma ${exception.code}: ${exception.message}`;
  }
  return exception instanceof Error ? exception.message : String(exception);
}
