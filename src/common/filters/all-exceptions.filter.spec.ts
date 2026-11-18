import { type ArgumentsHost, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client';
import { AllExceptionsFilter, type ErrorResponseBody } from './all-exceptions.filter';

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`prisma failure ${code}`, { code, clientVersion: 'test' });
}

describe('AllExceptionsFilter', () => {
  const reply = vi.fn<(response: unknown, body: ErrorResponseBody, status: number) => void>();
  let logError: ReturnType<typeof vi.spyOn>;
  let filter: AllExceptionsFilter;

  const adapterHost = {
    httpAdapter: { getRequestMethod: () => 'POST', getRequestUrl: () => '/api/quizzes', reply },
  } as unknown as HttpAdapterHost;
  const argumentsHost = {
    switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
  } as unknown as ArgumentsHost;

  function run(exception: unknown): { body: ErrorResponseBody; status: number } {
    filter.catch(exception, argumentsHost);
    const call = reply.mock.calls.at(-1);
    if (!call) throw new Error('reply was not called');
    return { body: call[1], status: call[2] };
  }

  beforeEach(() => {
    reply.mockClear();
    logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    filter = new AllExceptionsFilter(adapterHost);
  });

  afterEach(() => {
    logError.mockRestore();
  });

  it('passes HttpExceptions through with their status and message', () => {
    const { body, status } = run(new NotFoundException('Quiz q1 not found'));
    expect(status).toBe(404);
    expect(body).toMatchObject({ statusCode: 404, error: 'Not Found', message: 'Quiz q1 not found', path: '/api/quizzes' });
    expect(logError).not.toHaveBeenCalled();
  });

  it('keeps validation message arrays', () => {
    const { body } = run(new BadRequestException(['title should not be empty', 'topic must be a string']));
    expect(body.message).toEqual(['title should not be empty', 'topic must be a string']);
  });

  it.each([
    ['P2002', 409],
    ['P2003', 409],
    ['P2025', 404],
  ])('maps Prisma %s to %i without leaking the Prisma message', (code, expected) => {
    const { body, status } = run(prismaError(code));
    expect(status).toBe(expected);
    expect(JSON.stringify(body)).not.toContain('prisma failure');
    expect(logError).not.toHaveBeenCalled();
  });

  it('returns a generic 500 for unmapped Prisma errors and logs them', () => {
    const { body, status } = run(prismaError('P1001'));
    expect(status).toBe(500);
    expect(body.message).toBe('Internal server error');
    expect(logError).toHaveBeenCalledOnce();
  });

  it.each([
    ['an Error', new Error('secret connection string')],
    ['a thrown string', 'secret connection string'],
    ['undefined', undefined],
  ])('returns a generic 500 for %s and logs it', (_label, exception) => {
    const { body, status } = run(exception);
    expect(status).toBe(500);
    expect(body).toMatchObject({ statusCode: 500, error: 'Internal Server Error', message: 'Internal server error' });
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(logError).toHaveBeenCalledOnce();
  });
});
