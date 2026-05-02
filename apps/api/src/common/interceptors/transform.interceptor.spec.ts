/**
 * TransformInterceptor 단위 테스트
 *
 * 성공 응답이 통일된 ApiResponse 형식으로 변환되는지 검증한다.
 */

import { of } from 'rxjs';
import { TransformInterceptor, ApiResponse } from './transform.interceptor';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<unknown>;
  let mockExecutionContext: {
    switchToHttp: jest.Mock;
  };
  let mockCallHandler: {
    handle: jest.Mock;
  };

  beforeEach(() => {
    interceptor = new TransformInterceptor();

    mockExecutionContext = {
      switchToHttp: jest.fn(),
    };

    mockCallHandler = {
      handle: jest.fn(),
    };
  });

  it('응답을 ApiResponse 형식으로 감싸야 한다', (done) => {
    const responseData = { id: '1', name: 'test' };
    mockCallHandler.handle.mockReturnValue(of(responseData));

    interceptor
      .intercept(mockExecutionContext as any, mockCallHandler as any)
      .subscribe({
        next: (result: ApiResponse<unknown>) => {
          expect(result.success).toBe(true);
          expect(result.data).toEqual(responseData);
          expect(result.timestamp).toBeDefined();
          done();
        },
      });
  });

  it('null 데이터도 올바르게 감싸야 한다', (done) => {
    mockCallHandler.handle.mockReturnValue(of(null));

    interceptor
      .intercept(mockExecutionContext as any, mockCallHandler as any)
      .subscribe({
        next: (result: ApiResponse<unknown>) => {
          expect(result.success).toBe(true);
          expect(result.data).toBeNull();
          done();
        },
      });
  });

  it('배열 데이터도 올바르게 감싸야 한다', (done) => {
    const responseData = [{ id: '1' }, { id: '2' }];
    mockCallHandler.handle.mockReturnValue(of(responseData));

    interceptor
      .intercept(mockExecutionContext as any, mockCallHandler as any)
      .subscribe({
        next: (result: ApiResponse<unknown>) => {
          expect(result.success).toBe(true);
          expect(result.data).toEqual(responseData);
          expect(Array.isArray(result.data)).toBe(true);
          done();
        },
      });
  });

  it('timestamp가 유효한 ISO 8601 형식이어야 한다', (done) => {
    mockCallHandler.handle.mockReturnValue(of({}));

    interceptor
      .intercept(mockExecutionContext as any, mockCallHandler as any)
      .subscribe({
        next: (result: ApiResponse<unknown>) => {
          const parsed = new Date(result.timestamp);
          expect(parsed.toISOString()).toBe(result.timestamp);
          done();
        },
      });
  });
});
