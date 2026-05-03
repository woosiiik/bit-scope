/**
 * 글로벌 HTTP 예외 필터
 *
 * 모든 HTTP 예외를 가로채어 통일된 에러 응답 형식을 제공한다.
 * 예기치 못한 오류 발생 시 로깅을 수행하고, 사용자에게
 * 서비스 복구 안내를 제공한다.
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/** 표준화된 에러 응답 형식 */
interface ErrorResponse {
  /** HTTP 상태 코드 */
  statusCode: number;
  /** 에러 메시지 */
  message: string;
  /** 에러 상세 (개발 환경에서만 포함) */
  error?: string;
  /** 요청 경로 */
  path: string;
  /** 에러 발생 시각 (ISO 8601) */
  timestamp: string;
}

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    // WebSocket이나 RPC 컨텍스트에서 발생한 예외는 HTTP 필터에서 처리하지 않는다.
    // HTTP 컨텍스트가 아닌 경우 기본 에러 핸들링에 위임한다.
    if (host.getType() !== 'http') {
      this.logger.error(
        `Non-HTTP context exception (${host.getType()})`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode: number;
    let message: string;
    let error: string | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as Record<string, unknown>;
        message = Array.isArray(responseObj.message)
          ? responseObj.message.join(', ')
          : (responseObj.message as string) || exception.message;
        error = responseObj.error as string | undefined;
      } else {
        message = exception.message;
      }
    } else {
      // 예기치 못한 오류
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = '서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';

      // 예기치 못한 오류는 상세히 로깅
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const errorResponse: ErrorResponse = {
      statusCode,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    // 개발 환경에서만 에러 상세 포함
    if (process.env.NODE_ENV !== 'production' && error) {
      errorResponse.error = error;
    }

    // 클라이언트 오류(4xx)는 warn, 서버 오류(5xx)는 error로 로깅
    if (statusCode >= 500) {
      this.logger.error(
        `[${statusCode}] ${request.method} ${request.url} - ${message}`,
      );
    } else if (statusCode >= 400) {
      this.logger.warn(
        `[${statusCode}] ${request.method} ${request.url} - ${message}`,
      );
    }

    response.status(statusCode).json(errorResponse);
  }
}
