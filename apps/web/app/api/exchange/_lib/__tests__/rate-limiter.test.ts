/**
 * 거래소별 Rate Limiter 및 지수 백오프 재시도 단위 테스트
 *
 * 토큰 버킷 동작, 지수 백오프 타이밍, 재시도 가능 여부 판단,
 * 전역 인스턴스 관리를 검증한다.
 *
 * @see 요구사항 12.6 (Rate Limit 지수 백오프 재시도)
 * @see 요구사항 NF1.4 (거래소 API Rate Limit 준수)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ExchangeRateLimiter,
  RateLimitError,
  retryWithBackoff,
  getGlobalRateLimiter,
  resetGlobalRateLimiter,
} from '../rate-limiter';

describe('ExchangeRateLimiter', () => {
  let limiter: ExchangeRateLimiter;

  beforeEach(() => {
    limiter = new ExchangeRateLimiter();
  });

  describe('acquireToken', () => {
    it('토큰이 충분하면 정상적으로 획득한다', () => {
      expect(() => limiter.acquireToken('upbit')).not.toThrow();
    });

    it('모든 지원 거래소에서 토큰을 획득할 수 있다', () => {
      expect(() => limiter.acquireToken('upbit')).not.toThrow();
      expect(() => limiter.acquireToken('bithumb')).not.toThrow();
      expect(() => limiter.acquireToken('coinone')).not.toThrow();
    });

    it('지원하지 않는 거래소는 오류를 발생시킨다', () => {
      expect(() =>
        limiter.acquireToken('binance' as never),
      ).toThrowError('지원하지 않는 거래소입니다: binance');
    });

    it('토큰을 초과하여 사용하면 RateLimitError를 발생시킨다', () => {
      // 업비트: 초당 10개 요청 제한
      // 모든 토큰을 소진한다
      for (let i = 0; i < 10; i++) {
        limiter.acquireToken('upbit');
      }

      expect(() => limiter.acquireToken('upbit')).toThrowError(RateLimitError);
    });

    it('RateLimitError에 거래소와 대기 시간 정보를 포함한다', () => {
      // 토큰 소진
      for (let i = 0; i < 10; i++) {
        limiter.acquireToken('upbit');
      }

      try {
        limiter.acquireToken('upbit');
        // 여기에 도달하면 실패
        expect.fail('RateLimitError가 발생해야 한다');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        const rateLimitError = error as RateLimitError;
        expect(rateLimitError.exchange).toBe('upbit');
        expect(rateLimitError.retryAfterMs).toBeGreaterThan(0);
      }
    });

    it('시간이 경과하면 토큰이 충전된다', () => {
      vi.useFakeTimers();

      try {
        // 모든 토큰 소진
        for (let i = 0; i < 10; i++) {
          limiter.acquireToken('upbit');
        }

        // 1초 경과 후 토큰 충전
        vi.advanceTimersByTime(1000);

        expect(() => limiter.acquireToken('upbit')).not.toThrow();
      } finally {
        vi.useRealTimers();
      }
    });

    it('거래소별로 독립적인 토큰 버킷을 사용한다', () => {
      // 업비트 토큰 소진
      for (let i = 0; i < 10; i++) {
        limiter.acquireToken('upbit');
      }

      // 빗썸과 코인원은 여전히 사용 가능
      expect(() => limiter.acquireToken('bithumb')).not.toThrow();
      expect(() => limiter.acquireToken('coinone')).not.toThrow();
    });
  });

  describe('isRateLimited', () => {
    it('토큰이 충분하면 false를 반환한다', () => {
      expect(limiter.isRateLimited('upbit')).toBe(false);
    });

    it('토큰이 소진되면 true를 반환한다', () => {
      for (let i = 0; i < 10; i++) {
        limiter.acquireToken('upbit');
      }

      expect(limiter.isRateLimited('upbit')).toBe(true);
    });

    it('시간이 경과하면 다시 false를 반환한다', () => {
      vi.useFakeTimers();

      try {
        for (let i = 0; i < 10; i++) {
          limiter.acquireToken('upbit');
        }
        expect(limiter.isRateLimited('upbit')).toBe(true);

        vi.advanceTimersByTime(1000);
        expect(limiter.isRateLimited('upbit')).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('지원하지 않는 거래소는 false를 반환한다', () => {
      expect(limiter.isRateLimited('binance' as never)).toBe(false);
    });
  });

  describe('getAvailableTokens', () => {
    it('초기 상태에서 최대 토큰 수를 반환한다', () => {
      // 업비트: 초당 10개
      expect(limiter.getAvailableTokens('upbit')).toBe(10);
      // 빗썸: 초당 10개
      expect(limiter.getAvailableTokens('bithumb')).toBe(10);
      // 코인원: 초당 6개
      expect(limiter.getAvailableTokens('coinone')).toBe(6);
    });

    it('토큰 사용 후 남은 토큰 수를 반환한다', () => {
      limiter.acquireToken('upbit');
      limiter.acquireToken('upbit');
      limiter.acquireToken('upbit');

      expect(limiter.getAvailableTokens('upbit')).toBe(7);
    });

    it('지원하지 않는 거래소는 0을 반환한다', () => {
      expect(limiter.getAvailableTokens('binance' as never)).toBe(0);
    });
  });

  describe('reset', () => {
    it('모든 거래소의 토큰을 초기 상태로 리셋한다', () => {
      // 토큰 소진
      for (let i = 0; i < 10; i++) {
        limiter.acquireToken('upbit');
      }
      expect(limiter.isRateLimited('upbit')).toBe(true);

      limiter.reset();

      expect(limiter.isRateLimited('upbit')).toBe(false);
      expect(limiter.getAvailableTokens('upbit')).toBe(10);
    });
  });

  describe('acquireTokenAsync', () => {
    it('토큰이 충분하면 즉시 반환한다', async () => {
      await expect(limiter.acquireTokenAsync('upbit')).resolves.not.toThrow();
    });

    it('토큰이 부족하면 대기 후 획득한다', async () => {
      vi.useFakeTimers();

      try {
        // 토큰 소진
        for (let i = 0; i < 10; i++) {
          limiter.acquireToken('upbit');
        }

        // acquireTokenAsync는 토큰이 채워질 때까지 대기
        const promise = limiter.acquireTokenAsync('upbit');

        // 타이머를 진행시켜 토큰 충전
        await vi.advanceTimersByTimeAsync(1000);

        await expect(promise).resolves.not.toThrow();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('함수가 즉시 성공하면 결과를 반환한다', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await retryWithBackoff(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('함수가 실패 후 재시도에서 성공하면 결과를 반환한다', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new RateLimitError('upbit', 1000))
      .mockResolvedValue('retry-success');

    const promise = retryWithBackoff(fn, {
      baseDelayMs: 1000,
      maxDelayMs: 4000,
    });

    // 첫 번째 재시도 대기 (1초)
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;

    expect(result).toBe('retry-success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('최대 재시도 횟수를 초과하면 마지막 오류를 throw한다', async () => {
    const error = new RateLimitError('upbit', 1000);
    const fn = vi.fn().mockRejectedValue(error);

    // promise를 미리 catch로 잡아두어 unhandled rejection을 방지
    let caughtError: Error | undefined;
    const promise = retryWithBackoff(fn, {
      maxRetries: 2,
      baseDelayMs: 100,
      maxDelayMs: 400,
    }).catch((e: Error) => {
      caughtError = e;
    });

    // 재시도 대기 시간만큼 타이머 진행 (async 버전 사용)
    await vi.advanceTimersByTimeAsync(100); // 1차 재시도 대기
    await vi.advanceTimersByTimeAsync(200); // 2차 재시도 대기
    await vi.advanceTimersByTimeAsync(400); // 여유 시간

    await promise;

    expect(caughtError).toBeInstanceOf(RateLimitError);
    expect(fn).toHaveBeenCalledTimes(3); // 최초 1회 + 재시도 2회
  });

  it('지수 백오프 대기 시간을 적용한다 (1s -> 2s -> 4s)', async () => {
    const delays: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new RateLimitError('upbit', 1000))
      .mockRejectedValueOnce(new RateLimitError('upbit', 1000))
      .mockRejectedValueOnce(new RateLimitError('upbit', 1000))
      .mockResolvedValue('success');

    const promise = retryWithBackoff(fn, {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 4000,
      onRetry: (_attempt, _error, delayMs) => {
        delays.push(delayMs);
      },
    });

    // 1차 재시도 대기: 1000 * 2^0 = 1000ms
    await vi.advanceTimersByTimeAsync(1000);
    // 2차 재시도 대기: 1000 * 2^1 = 2000ms
    await vi.advanceTimersByTimeAsync(2000);
    // 3차 재시도 대기: 1000 * 2^2 = 4000ms
    await vi.advanceTimersByTimeAsync(4000);

    await promise;

    expect(delays).toEqual([1000, 2000, 4000]);
  });

  it('최대 대기 시간을 초과하지 않는다', async () => {
    const delays: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new RateLimitError('upbit', 1000))
      .mockRejectedValueOnce(new RateLimitError('upbit', 1000))
      .mockRejectedValueOnce(new RateLimitError('upbit', 1000))
      .mockResolvedValue('success');

    const promise = retryWithBackoff(fn, {
      maxRetries: 3,
      baseDelayMs: 2000,
      maxDelayMs: 4000,
      onRetry: (_attempt, _error, delayMs) => {
        delays.push(delayMs);
      },
    });

    // 충분한 시간 진행
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    await vi.advanceTimersByTimeAsync(4000);

    await promise;

    // 2000 * 2^0 = 2000, 2000 * 2^1 = 4000, 2000 * 2^2 = 8000 -> maxDelayMs로 클램핑 -> 4000
    expect(delays).toEqual([2000, 4000, 4000]);
  });

  it('재시도 콜백이 호출된다', async () => {
    const onRetry = vi.fn();
    const error = new RateLimitError('upbit', 1000);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('ok');

    const promise = retryWithBackoff(fn, {
      baseDelayMs: 100,
      maxDelayMs: 400,
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, error, 100);
  });

  it('재시도 불가능한 오류는 즉시 throw한다', async () => {
    const authError = new Error('Unauthorized');
    (authError as { statusCode?: number }).statusCode = 401;

    const fn = vi.fn().mockRejectedValue(authError);

    await expect(retryWithBackoff(fn)).rejects.toThrow('Unauthorized');
    expect(fn).toHaveBeenCalledTimes(1); // 재시도 없이 즉시 실패
  });

  it('커스텀 isRetryable 함수를 사용할 수 있다', async () => {
    const error = new Error('custom error');
    const fn = vi.fn().mockRejectedValue(error);

    // 모든 오류를 재시도 불가능으로 판단
    await expect(
      retryWithBackoff(fn, {
        maxRetries: 3,
        isRetryable: () => false,
      }),
    ).rejects.toThrow('custom error');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('재시도 횟수를 0으로 설정하면 재시도하지 않는다', async () => {
    const fn = vi.fn().mockRejectedValue(new RateLimitError('upbit', 100));

    await expect(
      retryWithBackoff(fn, { maxRetries: 0 }),
    ).rejects.toThrow(RateLimitError);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('네트워크 오류는 재시도 가능으로 판단한다', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValue('ok');

    const promise = retryWithBackoff(fn, {
      baseDelayMs: 100,
      maxDelayMs: 400,
    });

    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('서버 오류(5xx)는 재시도 가능으로 판단한다', async () => {
    const serverError = new Error('Internal Server Error');
    (serverError as { statusCode?: number }).statusCode = 500;

    const fn = vi
      .fn()
      .mockRejectedValueOnce(serverError)
      .mockResolvedValue('ok');

    const promise = retryWithBackoff(fn, {
      baseDelayMs: 100,
      maxDelayMs: 400,
    });

    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('클라이언트 오류(4xx, 429 제외)는 재시도 불가능으로 판단한다', async () => {
    const badRequest = new Error('Bad Request');
    (badRequest as { statusCode?: number }).statusCode = 400;

    const fn = vi.fn().mockRejectedValue(badRequest);

    await expect(retryWithBackoff(fn)).rejects.toThrow('Bad Request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('429 Too Many Requests는 재시도 가능으로 판단한다', async () => {
    const rateLimitResponse = new Error('Too Many Requests');
    (rateLimitResponse as { statusCode?: number }).statusCode = 429;

    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimitResponse)
      .mockResolvedValue('ok');

    const promise = retryWithBackoff(fn, {
      baseDelayMs: 100,
      maxDelayMs: 400,
    });

    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('getGlobalRateLimiter / resetGlobalRateLimiter', () => {
  afterEach(() => {
    resetGlobalRateLimiter();
  });

  it('전역 Rate Limiter 인스턴스를 반환한다', () => {
    const limiter = getGlobalRateLimiter();
    expect(limiter).toBeInstanceOf(ExchangeRateLimiter);
  });

  it('동일한 전역 인스턴스를 반환한다 (싱글턴)', () => {
    const limiter1 = getGlobalRateLimiter();
    const limiter2 = getGlobalRateLimiter();
    expect(limiter1).toBe(limiter2);
  });

  it('리셋 후 새로운 인스턴스를 반환한다', () => {
    const limiter1 = getGlobalRateLimiter();

    resetGlobalRateLimiter();

    const limiter2 = getGlobalRateLimiter();
    expect(limiter2).not.toBe(limiter1);
  });
});
