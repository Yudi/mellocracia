import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { RateLimitExceededException } from '../security/rate-limit.exception';

interface ExceptionPayload {
  statusCode?: number;
  code?: string;
  message?: string | string[];
  retryAfterSeconds?: number;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const payload =
      typeof raw === 'object' && raw !== null
        ? (raw as ExceptionPayload)
        : undefined;
    const message = Array.isArray(payload?.message)
      ? payload.message.join(', ')
      : (payload?.message ??
        (status >= 500 ? 'Internal server error' : 'Request failed'));
    const body = {
      statusCode: status,
      code: payload?.code ?? this.defaultCode(status),
      message,
      ...(payload?.retryAfterSeconds
        ? { retryAfterSeconds: payload.retryAfterSeconds }
        : {}),
    };
    const retryAfter =
      exception instanceof RateLimitExceededException
        ? exception.retryAfterSeconds
        : payload?.retryAfterSeconds;
    if (status === HttpStatus.TOO_MANY_REQUESTS && retryAfter) {
      response.header('Retry-After', String(Math.ceil(retryAfter)));
    }
    response.status(status).json(body);
  }

  private defaultCode(status: number): string {
    if (status === HttpStatus.BAD_REQUEST) return 'BAD_REQUEST';
    if (status === HttpStatus.NOT_FOUND) return 'NOT_FOUND';
    if (status === HttpStatus.TOO_MANY_REQUESTS) return 'RATE_LIMITED';
    if (status === HttpStatus.SERVICE_UNAVAILABLE) return 'SERVICE_UNAVAILABLE';
    return 'INTERNAL_ERROR';
  }
}
