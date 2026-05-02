/**
 * 오류 복구 및 Graceful Degradation 단위 테스트
 *
 * 다양한 오류 시나리오(타임아웃, Rate Limit, 잘못된 키, 거래소 점검 등)에 대한
 * 오류 복구 전략을 검증한다.
 *
 * 테스트 범위:
 * - 재시도 가능 여부 판단 (isRetryable)
 * - 지수 백오프 재시도 (retryWithBackoff)
 * - 폴백 데이터 캐시 (FallbackDataCache)
 * - 오류 상태 관리 (ErrorStateManager)
 * - 스냅샷 저장 실패 큐 (SnapshotQueue)
 * - 사용자 친화적 오류 메시지 (getUserFriendlyErrorMessage)
 * - 통합 ErrorRecoveryStrategy
 *
 * @see 요구사항 2.6, NF3.1, NF3.2, NF3.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isRetryable,
  retryWithBackoff,
  FallbackDataCache,
  ErrorStateManager,
  SnapshotQueue,
  ErrorRecoveryStrategy,
  getUserFriendlyErrorMessage,
  getFallbackDataMessage,
  getErrorRecoveryStrategy,
  resetErrorRecoveryStrategy,
  type CachedExchangeData,
  type ErrorState,
  type RetryOptions,
} from '../error-recovery';
import { ExchangeApiError, type BalanceResponse } from '../api-client';
import type { ExchangeType, PortfolioSnapshot } from '@bitscope/shared';

// ===== 테스트 헬퍼 =====

/** ExchangeApiError를 간편하게 생성하는 헬퍼 */
function createError(
  code: string,
  exchange: ExchangeType = 'upbit',
  statusCode?: number,
): ExchangeApiError {
  return new ExchangeApiError(`테스트 오류: ${code}`, code, exchange, statusCode);
}

/** 테스트용 잔고 응답 데이터 */
function createBalanceResponse(
  exchange: ExchangeType = 'upbit',
): BalanceResponse {
  return {
    exchange,
    holdings: [
      {
        exchange,
        symbol: 'BTC',
        currency: 'KRW',
        balance: 0.5,
        lockedBalance: 0,
        avgBuyPrice: 50000000,
        currentPrice: 55000000,
        evaluationAmount: 27500000,
        profitLoss: 2500000,
        profitLossRate: 10,
      },
    ],
    krwBalance: 1000000,
    timestamp: Date.now(),
  };
}

/** 테스트용 포트폴리오 스냅샷 */
function createSnapshot(walletAddress: string = '0x1234'): PortfolioSnapshot {
  return {
    walletAddress,
    timestamp: new Date(),
    totalEvaluation: 100000000,
    totalInvestment: 90000000,
    totalProfitLoss: 10000000,
    profitLossRate: 11.11,
    holdings: [
      {
        symbol: 'BTC',
        exchange: 'upbit',
        balance: 0.5,
        avgBuyPrice: 50000000,
        currentPrice: 55000000,
        evaluation: 27500000,
      },
    ],
  };
}

// localStorage 모의 구현
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
})();

// ===== 테스트 =====

describe('Error Recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // localStorage 모의 설정
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetErrorRecoveryStrategy();
  });

  // ===== isRetryable =====
  describe('isRetryable', () => {
    it('타임아웃 오류는 재시도 가능하다', () => {
      expect(isRetryable(createError('TIMEOUT'))).toBe(true);
    });

    it('Rate Limit 오류는 재시도 가능하다', () => {
      expect(isRetryable(createError('RATE_LIMITED'))).toBe(true);
    });

    it('서버 오류는 재시도 가능하다', () => {
      expect(isRetryable(createError('SERVER_ERROR'))).toBe(true);
    });

    it('네트워크 오류는 재시도 가능하다', () => {
      expect(isRetryable(createError('NETWORK_ERROR'))).toBe(true);
    });

    it('거래소 점검 오류는 재시도 가능하다', () => {
      expect(isRetryable(createError('EXCHANGE_MAINTENANCE'))).toBe(true);
    });

    it('서비스 불가 오류는 재시도 가능하다', () => {
      expect(isRetryable(createError('SERVICE_UNAVAILABLE'))).toBe(true);
    });

    it('Bad Gateway 오류는 재시도 가능하다', () => {
      expect(isRetryable(createError('BAD_GATEWAY'))).toBe(true);
    });

    it('Gateway Timeout 오류는 재시도 가능하다', () => {
      expect(isRetryable(createError('GATEWAY_TIMEOUT'))).toBe(true);
    });

    it('잘못된 API Key 오류는 재시도 불가하다', () => {
      expect(isRetryable(createError('AUTH_ERROR'))).toBe(false);
    });

    it('유효하지 않은 키 오류는 재시도 불가하다', () => {
      expect(isRetryable(createError('INVALID_KEY'))).toBe(false);
    });

    it('권한 부족 오류는 재시도 불가하다', () => {
      expect(isRetryable(createError('INSUFFICIENT_PERMISSION'))).toBe(false);
    });

    it('복호화 실패 오류는 재시도 불가하다', () => {
      expect(isRetryable(createError('DECRYPTION_FAILED'))).toBe(false);
    });

    it('파싱 오류는 재시도 불가하다', () => {
      expect(isRetryable(createError('PARSE_ERROR'))).toBe(false);
    });

    it('빈 응답 오류는 재시도 불가하다', () => {
      expect(isRetryable(createError('EMPTY_RESPONSE'))).toBe(false);
    });

    it('HTTP 429(Rate Limit) 상태 코드는 재시도 가능하다', () => {
      expect(isRetryable(createError('CUSTOM_ERROR', 'upbit', 429))).toBe(true);
    });

    it('HTTP 500(서버 오류) 상태 코드는 재시도 가능하다', () => {
      expect(isRetryable(createError('CUSTOM_ERROR', 'upbit', 500))).toBe(true);
    });

    it('HTTP 502(Bad Gateway) 상태 코드는 재시도 가능하다', () => {
      expect(isRetryable(createError('CUSTOM_ERROR', 'upbit', 502))).toBe(true);
    });

    it('HTTP 503(Service Unavailable) 상태 코드는 재시도 가능하다', () => {
      expect(isRetryable(createError('CUSTOM_ERROR', 'upbit', 503))).toBe(true);
    });

    it('HTTP 504(Gateway Timeout) 상태 코드는 재시도 가능하다', () => {
      expect(isRetryable(createError('CUSTOM_ERROR', 'upbit', 504))).toBe(true);
    });

    it('HTTP 408(Request Timeout) 상태 코드는 재시도 가능하다', () => {
      expect(isRetryable(createError('CUSTOM_ERROR', 'upbit', 408))).toBe(true);
    });

    it('HTTP 400(Bad Request) 상태 코드는 재시도 불가하다', () => {
      expect(isRetryable(createError('CUSTOM_ERROR', 'upbit', 400))).toBe(false);
    });

    it('UNKNOWN_ERROR는 재시도 가능하다 (1회 재시도 허용)', () => {
      expect(isRetryable(createError('UNKNOWN_ERROR'))).toBe(true);
    });

    it('알 수 없는 커스텀 오류 코드 + 비재시도 상태 코드는 재시도 불가하다', () => {
      expect(isRetryable(createError('SOME_RANDOM_CODE', 'upbit', 400))).toBe(false);
    });
  });

  // ===== retryWithBackoff =====
  describe('retryWithBackoff', () => {
    it('첫 번째 시도에서 성공하면 결과를 반환한다', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await retryWithBackoff(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('실패 후 재시도에서 성공하면 결과를 반환한다', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(createError('TIMEOUT'))
        .mockResolvedValue('success');

      const resultPromise = retryWithBackoff(fn, {
        maxRetries: 3,
        baseDelay: 100,
        maxDelay: 400,
      });

      // 첫 번째 재시도 대기 (100ms)
      await vi.advanceTimersByTimeAsync(100);

      const result = await resultPromise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('모든 재시도가 실패하면 마지막 오류를 throw한다', async () => {
      const fn = vi.fn().mockRejectedValue(createError('TIMEOUT'));

      // catch를 미리 연결하여 unhandled rejection을 방지한다
      const resultPromise = retryWithBackoff(fn, {
        maxRetries: 2,
        baseDelay: 100,
        maxDelay: 400,
      }).catch((e) => e);

      // 첫 번째 재시도 대기 (100ms)
      await vi.advanceTimersByTimeAsync(100);
      // 두 번째 재시도 대기 (200ms)
      await vi.advanceTimersByTimeAsync(200);

      const result = await resultPromise;
      expect(result).toBeInstanceOf(ExchangeApiError);
      expect(fn).toHaveBeenCalledTimes(3); // 초기 1회 + 재시도 2회
    });

    it('재시도 불가한 오류는 즉시 throw한다', async () => {
      const fn = vi.fn().mockRejectedValue(createError('AUTH_ERROR'));

      await expect(
        retryWithBackoff(fn, { maxRetries: 3, baseDelay: 100, maxDelay: 400 }),
      ).rejects.toThrow(ExchangeApiError);

      // 재시도 없이 1회만 호출
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('onRetry 콜백이 재시도 시마다 호출된다', async () => {
      const onRetry = vi.fn();
      const fn = vi
        .fn()
        .mockRejectedValueOnce(createError('TIMEOUT'))
        .mockRejectedValueOnce(createError('TIMEOUT'))
        .mockResolvedValue('success');

      const resultPromise = retryWithBackoff(fn, {
        maxRetries: 3,
        baseDelay: 100,
        maxDelay: 400,
        onRetry,
      });

      // 첫 번째 재시도 대기
      await vi.advanceTimersByTimeAsync(100);
      // 두 번째 재시도 대기
      await vi.advanceTimersByTimeAsync(200);

      await resultPromise;

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(ExchangeApiError));
      expect(onRetry).toHaveBeenCalledWith(2, expect.any(ExchangeApiError));
    });

    it('지수 백오프 대기 시간이 maxDelay를 초과하지 않는다', async () => {
      const fn = vi.fn().mockRejectedValue(createError('TIMEOUT'));

      // catch를 미리 연결하여 unhandled rejection을 방지한다
      const resultPromise = retryWithBackoff(fn, {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 4000,
      }).catch((e) => e);

      // 1차 재시도: 1000ms (1000 * 2^0)
      await vi.advanceTimersByTimeAsync(1000);
      // 2차 재시도: 2000ms (1000 * 2^1)
      await vi.advanceTimersByTimeAsync(2000);
      // 3차 재시도: 4000ms (min(1000 * 2^2, 4000) = 4000)
      await vi.advanceTimersByTimeAsync(4000);

      const result = await resultPromise;
      expect(result).toBeInstanceOf(ExchangeApiError);
      expect(fn).toHaveBeenCalledTimes(4);
    });

    it('기본 옵션으로 동작한다 (RETRY_CONFIG 상수 사용)', async () => {
      const fn = vi.fn().mockRejectedValue(createError('TIMEOUT'));

      // catch를 미리 연결하여 unhandled rejection을 방지한다
      const resultPromise = retryWithBackoff(fn).catch((e) => e);

      // RETRY_CONFIG: maxRetries=3, baseDelay=1000, maxDelay=4000
      await vi.advanceTimersByTimeAsync(1000); // 1차 재시도
      await vi.advanceTimersByTimeAsync(2000); // 2차 재시도
      await vi.advanceTimersByTimeAsync(4000); // 3차 재시도

      const result = await resultPromise;
      expect(result).toBeInstanceOf(Error);
      expect(fn).toHaveBeenCalledTimes(4); // 초기 1회 + 재시도 3회
    });

    it('Error가 아닌 값이 throw되어도 처리한다', async () => {
      const fn = vi.fn().mockRejectedValue('string error');

      const resultPromise = retryWithBackoff(fn, {
        maxRetries: 0,
        baseDelay: 100,
        maxDelay: 400,
      });

      await expect(resultPromise).rejects.toThrow();
    });
  });

  // ===== FallbackDataCache =====
  describe('FallbackDataCache', () => {
    let cache: FallbackDataCache;

    beforeEach(() => {
      cache = new FallbackDataCache(300_000); // 5분
    });

    it('성공 데이터를 캐시에 저장하고 조회할 수 있다', () => {
      const data = createBalanceResponse('upbit');
      cache.cacheSuccessData('upbit', data);

      const cached = cache.getFallbackData('upbit');

      expect(cached).not.toBeNull();
      expect(cached!.exchange).toBe('upbit');
      expect(cached!.data).toEqual(data);
      expect(cached!.isFresh).toBe(true);
    });

    it('캐시가 없는 거래소에 대해 null을 반환한다', () => {
      const cached = cache.getFallbackData('upbit');

      expect(cached).toBeNull();
    });

    it('유효 기간(freshDuration) 이내의 데이터는 isFresh=true이다', () => {
      const data = createBalanceResponse('upbit');
      cache.cacheSuccessData('upbit', data);

      // 1분 경과
      vi.advanceTimersByTime(60_000);

      const cached = cache.getFallbackData('upbit');
      expect(cached!.isFresh).toBe(true);
    });

    it('유효 기간(freshDuration) 초과 데이터는 isFresh=false이다', () => {
      const data = createBalanceResponse('upbit');
      cache.cacheSuccessData('upbit', data);

      // 6분 경과 (5분 유효 기간 초과)
      vi.advanceTimersByTime(360_000);

      const cached = cache.getFallbackData('upbit');
      expect(cached).not.toBeNull();
      expect(cached!.isFresh).toBe(false);
    });

    it('거래소별로 독립적으로 캐시를 관리한다', () => {
      cache.cacheSuccessData('upbit', createBalanceResponse('upbit'));
      cache.cacheSuccessData('bithumb', createBalanceResponse('bithumb'));

      const upbitData = cache.getFallbackData('upbit');
      const bithumbData = cache.getFallbackData('bithumb');

      expect(upbitData!.exchange).toBe('upbit');
      expect(bithumbData!.exchange).toBe('bithumb');
    });

    it('특정 거래소의 캐시를 삭제할 수 있다', () => {
      cache.cacheSuccessData('upbit', createBalanceResponse('upbit'));
      cache.cacheSuccessData('bithumb', createBalanceResponse('bithumb'));

      cache.clearCache('upbit');

      expect(cache.getFallbackData('upbit')).toBeNull();
      expect(cache.getFallbackData('bithumb')).not.toBeNull();
    });

    it('모든 거래소의 캐시를 삭제할 수 있다', () => {
      cache.cacheSuccessData('upbit', createBalanceResponse('upbit'));
      cache.cacheSuccessData('bithumb', createBalanceResponse('bithumb'));

      cache.clearAll();

      expect(cache.getFallbackData('upbit')).toBeNull();
      expect(cache.getFallbackData('bithumb')).toBeNull();
    });

    it('캐시된 거래소 목록을 조회할 수 있다', () => {
      cache.cacheSuccessData('upbit', createBalanceResponse('upbit'));
      cache.cacheSuccessData('coinone', createBalanceResponse('coinone'));

      const exchanges = cache.getCachedExchanges();

      expect(exchanges).toHaveLength(2);
      expect(exchanges).toContain('upbit');
      expect(exchanges).toContain('coinone');
    });

    it('캐시 존재 여부를 확인할 수 있다', () => {
      cache.cacheSuccessData('upbit', createBalanceResponse('upbit'));

      expect(cache.hasCache('upbit')).toBe(true);
      expect(cache.hasCache('bithumb')).toBe(false);
    });

    it('동일 거래소에 새 데이터를 저장하면 캐시가 갱신된다', () => {
      const data1 = createBalanceResponse('upbit');
      data1.krwBalance = 1000000;
      cache.cacheSuccessData('upbit', data1);

      const data2 = createBalanceResponse('upbit');
      data2.krwBalance = 2000000;
      cache.cacheSuccessData('upbit', data2);

      const cached = cache.getFallbackData('upbit');
      expect(cached!.data.krwBalance).toBe(2000000);
    });
  });

  // ===== ErrorStateManager =====
  describe('ErrorStateManager', () => {
    let manager: ErrorStateManager;

    beforeEach(() => {
      manager = new ErrorStateManager();
    });

    it('오류를 보고하면 오류 상태가 생성된다', () => {
      const error = createError('TIMEOUT', 'upbit');
      manager.reportError('upbit', error);

      const state = manager.getErrorState('upbit');

      expect(state).not.toBeNull();
      expect(state!.exchange).toBe('upbit');
      expect(state!.error).toBe(error);
      expect(state!.consecutiveErrorCount).toBe(1);
    });

    it('동일 거래소에 연속 오류가 발생하면 카운트가 증가한다', () => {
      manager.reportError('upbit', createError('TIMEOUT', 'upbit'));
      manager.reportError('upbit', createError('TIMEOUT', 'upbit'));
      manager.reportError('upbit', createError('TIMEOUT', 'upbit'));

      const state = manager.getErrorState('upbit');

      expect(state!.consecutiveErrorCount).toBe(3);
    });

    it('오류 상태를 해제하면 정상 상태로 돌아간다', () => {
      manager.reportError('upbit', createError('TIMEOUT', 'upbit'));

      manager.clearError('upbit');

      expect(manager.getErrorState('upbit')).toBeNull();
      expect(manager.hasError('upbit')).toBe(false);
    });

    it('거래소별로 독립적인 오류 상태를 관리한다', () => {
      manager.reportError('upbit', createError('TIMEOUT', 'upbit'));
      manager.reportError('bithumb', createError('SERVER_ERROR', 'bithumb'));

      expect(manager.hasError('upbit')).toBe(true);
      expect(manager.hasError('bithumb')).toBe(true);
      expect(manager.hasError('coinone')).toBe(false);
    });

    it('특정 거래소 오류 해제가 다른 거래소에 영향을 미치지 않는다', () => {
      manager.reportError('upbit', createError('TIMEOUT', 'upbit'));
      manager.reportError('bithumb', createError('SERVER_ERROR', 'bithumb'));

      manager.clearError('upbit');

      expect(manager.hasError('upbit')).toBe(false);
      expect(manager.hasError('bithumb')).toBe(true);
    });

    it('모든 오류 상태를 조회할 수 있다', () => {
      manager.reportError('upbit', createError('TIMEOUT', 'upbit'));
      manager.reportError('bithumb', createError('SERVER_ERROR', 'bithumb'));

      const allStates = manager.getAllErrorStates();

      expect(allStates).toHaveLength(2);
      expect(allStates.map((s) => s.exchange)).toContain('upbit');
      expect(allStates.map((s) => s.exchange)).toContain('bithumb');
    });

    it('오류가 없는 거래소에 대해 null을 반환한다', () => {
      expect(manager.getErrorState('upbit')).toBeNull();
    });

    it('모든 오류 상태를 초기화할 수 있다', () => {
      manager.reportError('upbit', createError('TIMEOUT', 'upbit'));
      manager.reportError('bithumb', createError('SERVER_ERROR', 'bithumb'));

      manager.clearAll();

      expect(manager.getAllErrorStates()).toHaveLength(0);
    });

    it('오류 발생 시각이 기록된다', () => {
      const now = new Date('2024-06-01T12:00:00Z');
      vi.setSystemTime(now);

      manager.reportError('upbit', createError('TIMEOUT', 'upbit'));

      const state = manager.getErrorState('upbit');
      expect(state!.occurredAt.getTime()).toBe(now.getTime());
    });
  });

  // ===== SnapshotQueue =====
  describe('SnapshotQueue', () => {
    let queue: SnapshotQueue;

    beforeEach(() => {
      queue = new SnapshotQueue();
    });

    it('스냅샷을 큐에 추가할 수 있다', () => {
      const snapshot = createSnapshot();

      queue.enqueue('0x1234', snapshot);

      const status = queue.getStatus();
      expect(status.pendingCount).toBe(1);
      expect(status.items).toHaveLength(1);
      expect(status.items[0]!.walletAddress).toBe('0x1234');
    });

    it('여러 스냅샷을 큐에 추가할 수 있다', () => {
      queue.enqueue('0x1234', createSnapshot());
      queue.enqueue('0x1234', createSnapshot());
      queue.enqueue('0x5678', createSnapshot('0x5678'));

      const status = queue.getStatus();
      expect(status.pendingCount).toBe(3);
    });

    it('큐 크기가 최대 크기를 초과하면 가장 오래된 항목이 제거된다', () => {
      // 50개보다 많은 항목 추가
      for (let i = 0; i < 55; i++) {
        queue.enqueue(`0x${i}`, createSnapshot(`0x${i}`));
      }

      const status = queue.getStatus();
      expect(status.items.length).toBeLessThanOrEqual(50);
    });

    it('전송 성공 시 큐에서 항목이 제거된다', async () => {
      queue.enqueue('0x1234', createSnapshot());
      queue.enqueue('0x5678', createSnapshot('0x5678'));

      const sendFn = vi.fn().mockResolvedValue(undefined);

      const result = await queue.flush(sendFn);

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(queue.getStatus().pendingCount).toBe(0);
    });

    it('전송 실패 시 재시도 횟수가 증가한다', async () => {
      queue.enqueue('0x1234', createSnapshot());

      const sendFn = vi.fn().mockRejectedValue(new Error('서버 오류'));

      await queue.flush(sendFn);

      const status = queue.getStatus();
      expect(status.items[0]!.retryCount).toBe(1);
    });

    it('최대 재시도 횟수 초과 시 큐에서 제거된다', async () => {
      queue.enqueue('0x1234', createSnapshot());

      const sendFn = vi.fn().mockRejectedValue(new Error('서버 오류'));

      // 5번 실패 (MAX_SNAPSHOT_RETRY_COUNT = 5)
      for (let i = 0; i < 5; i++) {
        await queue.flush(sendFn);
      }

      expect(queue.getStatus().pendingCount).toBe(0);
    });

    it('일부 성공, 일부 실패를 정확히 보고한다', async () => {
      queue.enqueue('0x1234', createSnapshot());
      queue.enqueue('0x5678', createSnapshot('0x5678'));

      let callCount = 0;
      const sendFn = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('서버 오류');
        }
      });

      const result = await queue.flush(sendFn);

      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
    });

    it('빈 큐에서 flush하면 성공 0, 실패 0을 반환한다', async () => {
      const sendFn = vi.fn();

      const result = await queue.flush(sendFn);

      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
      expect(sendFn).not.toHaveBeenCalled();
    });

    it('큐를 비울 수 있다', () => {
      queue.enqueue('0x1234', createSnapshot());
      queue.enqueue('0x5678', createSnapshot('0x5678'));

      queue.clear();

      expect(queue.getStatus().pendingCount).toBe(0);
      expect(queue.getStatus().items).toHaveLength(0);
    });

    it('localStorage에 큐 데이터를 저장하고 복원한다', () => {
      queue.enqueue('0x1234', createSnapshot());
      queue.enqueue('0x5678', createSnapshot('0x5678'));

      // 새 인스턴스를 생성하면 localStorage에서 복원한다
      const restoredQueue = new SnapshotQueue();
      const status = restoredQueue.getStatus();

      expect(status.items).toHaveLength(2);
    });

    it('localStorage가 비어있으면 빈 큐로 초기화한다', () => {
      localStorageMock.clear();

      const newQueue = new SnapshotQueue();
      expect(newQueue.getStatus().pendingCount).toBe(0);
    });

    it('localStorage에 잘못된 데이터가 있으면 빈 큐로 초기화한다', () => {
      localStorageMock.setItem('bitscope:snapshot-queue', 'invalid-json');

      const newQueue = new SnapshotQueue();
      expect(newQueue.getStatus().pendingCount).toBe(0);
    });
  });

  // ===== getUserFriendlyErrorMessage =====
  describe('getUserFriendlyErrorMessage', () => {
    it('타임아웃 오류에 대해 적절한 메시지를 반환한다', () => {
      const message = getUserFriendlyErrorMessage(createError('TIMEOUT', 'upbit'));
      expect(message).toContain('업비트');
      expect(message).toContain('지연');
    });

    it('Rate Limit 오류에 대해 적절한 메시지를 반환한다', () => {
      const message = getUserFriendlyErrorMessage(createError('RATE_LIMITED', 'bithumb'));
      expect(message).toContain('빗썸');
      expect(message).toContain('제한');
    });

    it('잘못된 API Key 오류에 대해 적절한 메시지를 반환한다', () => {
      const message = getUserFriendlyErrorMessage(createError('AUTH_ERROR', 'upbit'));
      expect(message).toContain('업비트');
      expect(message).toContain('유효하지 않');
    });

    it('권한 부족 오류에 대해 적절한 메시지를 반환한다', () => {
      const message = getUserFriendlyErrorMessage(
        createError('INSUFFICIENT_PERMISSION', 'coinone'),
      );
      expect(message).toContain('코인원');
      expect(message).toContain('권한');
      expect(message).toContain('Read-Only');
    });

    it('복호화 실패 오류에 대해 적절한 메시지를 반환한다', () => {
      const message = getUserFriendlyErrorMessage(
        createError('DECRYPTION_FAILED', 'upbit'),
      );
      expect(message).toContain('복호화');
      expect(message).toContain('지갑');
    });

    it('서버 오류에 대해 적절한 메시지를 반환한다', () => {
      const message = getUserFriendlyErrorMessage(createError('SERVER_ERROR', 'bithumb'));
      expect(message).toContain('빗썸');
      expect(message).toContain('서버');
    });

    it('거래소 점검 오류에 대해 적절한 메시지를 반환한다', () => {
      const message = getUserFriendlyErrorMessage(
        createError('EXCHANGE_MAINTENANCE', 'coinone'),
      );
      expect(message).toContain('코인원');
      expect(message).toContain('점검');
    });

    it('네트워크 오류에 대해 적절한 메시지를 반환한다', () => {
      const message = getUserFriendlyErrorMessage(createError('NETWORK_ERROR', 'upbit'));
      expect(message).toContain('네트워크');
    });

    it('알 수 없는 오류에 대해 기본 메시지를 반환한다', () => {
      const message = getUserFriendlyErrorMessage(
        createError('UNKNOWN_ERROR', 'upbit'),
      );
      expect(message).toContain('업비트');
      expect(message).toContain('오류');
    });
  });

  // ===== getFallbackDataMessage =====
  describe('getFallbackDataMessage', () => {
    it('신선한 폴백 데이터에 대해 적절한 메시지를 반환한다', () => {
      const cachedData: CachedExchangeData = {
        exchange: 'upbit',
        data: createBalanceResponse('upbit'),
        cachedAt: new Date(),
        isFresh: true,
      };

      const message = getFallbackDataMessage('upbit', cachedData);

      expect(message).toContain('업비트');
      expect(message).toContain('최근 데이터');
    });

    it('오래된 폴백 데이터에 대해 경고 메시지를 반환한다', () => {
      const cachedData: CachedExchangeData = {
        exchange: 'bithumb',
        data: createBalanceResponse('bithumb'),
        cachedAt: new Date('2024-01-01T10:30:00Z'),
        isFresh: false,
      };

      const message = getFallbackDataMessage('bithumb', cachedData);

      expect(message).toContain('빗썸');
      expect(message).toContain('마지막 업데이트');
      expect(message).toContain('오래된 데이터');
    });
  });

  // ===== ErrorRecoveryStrategy 통합 =====
  describe('ErrorRecoveryStrategy', () => {
    let strategy: ErrorRecoveryStrategy;

    beforeEach(() => {
      strategy = new ErrorRecoveryStrategy();
    });

    it('API 호출 성공 시 캐시 저장 및 오류 상태 해제를 수행한다', () => {
      // 먼저 오류 상태를 설정한다
      strategy.reportError('upbit', createError('TIMEOUT', 'upbit'));
      expect(strategy.getErrorState('upbit')).not.toBeNull();

      // 성공 처리
      const data = createBalanceResponse('upbit');
      strategy.handleSuccess('upbit', data);

      // 오류 상태가 해제되었는지 확인
      expect(strategy.getErrorState('upbit')).toBeNull();

      // 폴백 캐시에 데이터가 저장되었는지 확인
      const fallback = strategy.getFallbackData('upbit');
      expect(fallback).not.toBeNull();
      expect(fallback!.data).toEqual(data);
    });

    it('API 호출 실패 시 오류 보고 및 폴백 데이터 반환을 수행한다', () => {
      // 먼저 성공 데이터를 캐시한다
      const data = createBalanceResponse('upbit');
      strategy.handleSuccess('upbit', data);

      // 오류 발생
      const error = createError('TIMEOUT', 'upbit');
      const fallback = strategy.handleError('upbit', error);

      // 오류 상태가 설정되었는지 확인
      expect(strategy.getErrorState('upbit')).not.toBeNull();
      expect(strategy.getErrorState('upbit')!.error.code).toBe('TIMEOUT');

      // 폴백 데이터가 반환되었는지 확인
      expect(fallback).not.toBeNull();
      expect(fallback!.data).toEqual(data);
    });

    it('캐시 없이 오류 발생 시 폴백 데이터로 null을 반환한다', () => {
      const error = createError('TIMEOUT', 'upbit');
      const fallback = strategy.handleError('upbit', error);

      expect(fallback).toBeNull();
      expect(strategy.getErrorState('upbit')).not.toBeNull();
    });

    it('거래소별 독립적으로 오류와 폴백을 관리한다', () => {
      // 업비트 성공
      strategy.handleSuccess('upbit', createBalanceResponse('upbit'));
      // 빗썸 오류
      strategy.handleError('bithumb', createError('TIMEOUT', 'bithumb'));

      // 업비트는 정상
      expect(strategy.getErrorState('upbit')).toBeNull();
      expect(strategy.getFallbackData('upbit')).not.toBeNull();

      // 빗썸은 오류
      expect(strategy.getErrorState('bithumb')).not.toBeNull();
    });

    it('isRetryable을 올바르게 위임한다', () => {
      expect(strategy.isRetryable(createError('TIMEOUT'))).toBe(true);
      expect(strategy.isRetryable(createError('AUTH_ERROR'))).toBe(false);
    });

    it('retryWithBackoff를 올바르게 위임한다', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await strategy.retryWithBackoff(fn);

      expect(result).toBe('success');
    });

    it('reset으로 모든 상태를 초기화할 수 있다', () => {
      strategy.handleSuccess('upbit', createBalanceResponse('upbit'));
      strategy.reportError('bithumb', createError('TIMEOUT', 'bithumb'));
      strategy.snapshotQueue.enqueue('0x1234', createSnapshot());

      strategy.reset();

      expect(strategy.getFallbackData('upbit')).toBeNull();
      expect(strategy.getErrorState('bithumb')).toBeNull();
      expect(strategy.snapshotQueue.getStatus().pendingCount).toBe(0);
    });

    it('스냅샷 큐를 통해 실패한 스냅샷을 관리할 수 있다', async () => {
      const snapshot = createSnapshot();

      // 큐에 추가
      strategy.snapshotQueue.enqueue('0x1234', snapshot);
      expect(strategy.snapshotQueue.getStatus().pendingCount).toBe(1);

      // 플러시 성공
      const sendFn = vi.fn().mockResolvedValue(undefined);
      const result = await strategy.snapshotQueue.flush(sendFn);

      expect(result.successCount).toBe(1);
      expect(strategy.snapshotQueue.getStatus().pendingCount).toBe(0);
    });
  });

  // ===== getErrorRecoveryStrategy 싱글톤 =====
  describe('getErrorRecoveryStrategy', () => {
    it('항상 동일한 인스턴스를 반환한다', () => {
      const instance1 = getErrorRecoveryStrategy();
      const instance2 = getErrorRecoveryStrategy();

      expect(instance1).toBe(instance2);
    });

    it('resetErrorRecoveryStrategy 호출 후 새 인스턴스를 반환한다', () => {
      const instance1 = getErrorRecoveryStrategy();
      resetErrorRecoveryStrategy();
      const instance2 = getErrorRecoveryStrategy();

      expect(instance1).not.toBe(instance2);
    });
  });

  // ===== 통합 시나리오 테스트 =====
  describe('통합 시나리오', () => {
    it('시나리오: 업비트 타임아웃 -> 폴백 데이터 -> 복구 성공', () => {
      const strategy = new ErrorRecoveryStrategy();

      // 1단계: 정상 데이터 캐시
      const data = createBalanceResponse('upbit');
      strategy.handleSuccess('upbit', data);

      // 2단계: 타임아웃 발생
      const error = createError('TIMEOUT', 'upbit');
      const fallback = strategy.handleError('upbit', error);

      // 폴백 데이터가 제공됨
      expect(fallback).not.toBeNull();
      expect(fallback!.data).toEqual(data);
      expect(strategy.getErrorState('upbit')!.consecutiveErrorCount).toBe(1);

      // 3단계: 연속 타임아웃
      strategy.handleError('upbit', createError('TIMEOUT', 'upbit'));
      expect(strategy.getErrorState('upbit')!.consecutiveErrorCount).toBe(2);

      // 4단계: 복구 성공
      const newData = createBalanceResponse('upbit');
      newData.krwBalance = 2000000;
      strategy.handleSuccess('upbit', newData);

      // 오류 상태 해제됨
      expect(strategy.getErrorState('upbit')).toBeNull();

      // 새로운 데이터가 캐시됨
      const newFallback = strategy.getFallbackData('upbit');
      expect(newFallback!.data.krwBalance).toBe(2000000);
    });

    it('시나리오: 빗썸 점검 중 -> 업비트/코인원은 정상 서비스', () => {
      const strategy = new ErrorRecoveryStrategy();

      // 업비트: 성공
      strategy.handleSuccess('upbit', createBalanceResponse('upbit'));
      // 빗썸: 점검 중
      strategy.handleError('bithumb', createError('EXCHANGE_MAINTENANCE', 'bithumb'));
      // 코인원: 성공
      strategy.handleSuccess('coinone', createBalanceResponse('coinone'));

      // 업비트/코인원은 정상
      expect(strategy.getErrorState('upbit')).toBeNull();
      expect(strategy.getErrorState('coinone')).toBeNull();

      // 빗썸만 오류
      expect(strategy.getErrorState('bithumb')).not.toBeNull();
      expect(strategy.getErrorState('bithumb')!.error.code).toBe('EXCHANGE_MAINTENANCE');
    });

    it('시나리오: 스냅샷 저장 실패 -> 큐잉 -> 재시도 성공', async () => {
      const strategy = new ErrorRecoveryStrategy();
      const snapshot = createSnapshot();

      // 1단계: 스냅샷 저장 실패 -> 큐잉
      strategy.snapshotQueue.enqueue('0x1234', snapshot);
      expect(strategy.snapshotQueue.getStatus().pendingCount).toBe(1);

      // 2단계: 서버 복구 후 재시도 성공
      const sendFn = vi.fn().mockResolvedValue(undefined);
      const result = await strategy.snapshotQueue.flush(sendFn);

      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(0);
      expect(strategy.snapshotQueue.getStatus().pendingCount).toBe(0);
    });

    it('시나리오: 재시도 가능한 오류에 지수 백오프 적용', async () => {
      let attempt = 0;
      const fn = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt < 3) {
          throw createError('TIMEOUT', 'upbit');
        }
        return 'success';
      });

      const resultPromise = retryWithBackoff(fn, {
        maxRetries: 3,
        baseDelay: 100,
        maxDelay: 400,
      });

      // 1차 재시도 대기 (100ms)
      await vi.advanceTimersByTimeAsync(100);
      // 2차 재시도 대기 (200ms)
      await vi.advanceTimersByTimeAsync(200);

      const result = await resultPromise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('시나리오: 재시도 불가한 오류는 즉시 사용자에게 안내', async () => {
      const error = createError('AUTH_ERROR', 'upbit');

      // 재시도 불가 확인
      expect(isRetryable(error)).toBe(false);

      // 사용자 메시지 생성
      const message = getUserFriendlyErrorMessage(error);
      expect(message).toContain('API 키');
      expect(message).toContain('유효하지 않');
    });
  });
});
