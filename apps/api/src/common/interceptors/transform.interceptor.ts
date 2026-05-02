/**
 * 응답 변환 인터셉터
 *
 * 모든 성공 응답을 통일된 형식으로 감싸서 반환한다.
 * 클라이언트가 일관된 응답 구조를 기대할 수 있도록 한다.
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

/** 표준화된 성공 응답 형식 */
export interface ApiResponse<T> {
  /** 성공 여부 */
  success: boolean;
  /** 응답 데이터 */
  data: T;
  /** 응답 시각 (ISO 8601) */
  timestamp: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
