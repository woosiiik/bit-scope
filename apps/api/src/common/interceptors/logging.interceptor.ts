/**
 * 글로벌 로깅 인터셉터
 *
 * 모든 HTTP 요청/응답을 로깅한다.
 * 요청 처리 시간을 측정하여 성능 모니터링에 활용한다.
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const { method, url } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          this.logger.log(
            `${method} ${url} - ${duration}ms`,
          );
        },
        error: () => {
          const duration = Date.now() - startTime;
          this.logger.warn(
            `${method} ${url} - ${duration}ms (error)`,
          );
        },
      }),
    );
  }
}
