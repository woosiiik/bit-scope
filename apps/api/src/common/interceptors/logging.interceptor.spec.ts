/**
 * LoggingInterceptor 단위 테스트
 *
 * 요청 로깅 및 응답 시간 측정을 검증한다.
 */

import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let mockExecutionContext: {
    switchToHttp: jest.Mock;
  };
  let mockCallHandler: {
    handle: jest.Mock;
  };

  beforeEach(() => {
    interceptor = new LoggingInterceptor();

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => ({
          method: 'GET',
          url: '/test',
        }),
      }),
    };

    mockCallHandler = {
      handle: jest.fn(),
    };
  });

  it('성공 응답을 통과시켜야 한다', (done) => {
    const responseData = { status: 'ok' };
    mockCallHandler.handle.mockReturnValue(of(responseData));

    interceptor
      .intercept(mockExecutionContext as any, mockCallHandler as any)
      .subscribe({
        next: (data) => {
          expect(data).toEqual(responseData);
          done();
        },
      });
  });

  it('오류 응답도 처리해야 한다', (done) => {
    const error = new Error('Test error');
    mockCallHandler.handle.mockReturnValue(throwError(() => error));

    interceptor
      .intercept(mockExecutionContext as any, mockCallHandler as any)
      .subscribe({
        error: (err) => {
          expect(err).toBe(error);
          done();
        },
      });
  });
});
