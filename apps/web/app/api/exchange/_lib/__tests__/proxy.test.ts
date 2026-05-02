/**
 * 거래소 API 프록시 릴레이 단위 테스트
 *
 * 서명된 요청 릴레이, 타임아웃 처리, 캐시 연동,
 * Rate Limit 연동, 스테일 데이터 반환을 검증한다.
 *
 * @see 요구사항 12.3 (서명된 요청 릴레이)
 * @see 요구사항 12.7 (10초 타임아웃)
 * @see 요구사항 12.8 (거래소 점검 시 마지막 캐시 데이터 반환)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SignedRequest } from '@bitscope/shared';
import {
  relayRequest,
  fetchWithTimeout,
  ProxyError,
} from '../proxy';
import { resetGlobalCache, getGlobalCache } from '../cache';
import { resetGlobalRateLimiter } from '../rate-limiter';

/** 테스트용 서명된 요청 */
const mockSignedRequest: SignedRequest = {
  url: 'https://api.upbit.com/v1/accounts',
  method: 'GET',
  headers: {
    Authorization: 'Bearer test-jwt-token',
    'Content-Type': 'application/json',
  },
};

/** 테스트용 POST 서명된 요청 */
const mockPostSignedRequest: SignedRequest = {
  url: 'https://api.bithumb.com/info/balance',
  method: 'POST',
  headers: {
    'Api-Key': 'test-access-key',
    'Api-Sign': 'test-signature',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ order_currency: 'BTC' }),
};

/** 테스트용 거래소 응답 데이터 */
const mockResponseData = [
  { currency: 'BTC', balance: '0.5', avg_buy_price: '50000000' },
  { currency: 'ETH', balance: '10.0', avg_buy_price: '3000000' },
];

describe('relayRequest', () => {
  beforeEach(() => {
    resetGlobalCache();
    resetGlobalRateLimiter();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetGlobalCache();
    resetGlobalRateLimiter();
    vi.restoreAllMocks();
  });

  it('서명된 요청을 거래소에 릴레이하고 응답을 반환한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponseData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await relayRequest({
      exchange: 'upbit',
      signedRequest: mockSignedRequest,
      cacheEndpoint: '/v1/accounts',
      useCache: false,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockResponseData);
    expect(result.cached).toBe(false);
    expect(result.stale).toBe(false);
  });

  it('캐시 히트 시 거래소 API를 호출하지 않고 캐시 데이터를 반환한다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponseData), { status: 200 }),
    );

    // 첫 번째 요청: 캐시 저장
    await relayRequest({
      exchange: 'upbit',
      signedRequest: mockSignedRequest,
      cacheEndpoint: '/v1/accounts',
    });

    // 두 번째 요청: 캐시 히트
    const result = await relayRequest({
      exchange: 'upbit',
      signedRequest: mockSignedRequest,
      cacheEndpoint: '/v1/accounts',
    });

    expect(result.success).toBe(true);
    expect(result.cached).toBe(true);
    expect(result.stale).toBe(false);
    expect(result.data).toEqual(mockResponseData);
    // 두 번째 요청에서는 fetch가 호출되지 않아야 한다
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('캐시 비활성화 시 항상 거래소 API를 호출한다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponseData), { status: 200 }),
    );

    // 두 번 요청
    await relayRequest({
      exchange: 'upbit',
      signedRequest: mockSignedRequest,
      useCache: false,
    });
    await relayRequest({
      exchange: 'upbit',
      signedRequest: mockSignedRequest,
      useCache: false,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('거래소 API 오류 시 스테일 캐시 데이터를 반환한다', async () => {
    vi.useFakeTimers();

    try {
      // 첫 번째 요청: 성공 (캐시 저장)
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponseData), { status: 200 }),
      );

      await relayRequest({
        exchange: 'upbit',
        signedRequest: mockSignedRequest,
        cacheEndpoint: '/v1/accounts',
        cacheTtlMs: 500,
      });

      // TTL 만료 시킴
      vi.advanceTimersByTime(600);

      // 두 번째 요청: 인증 오류 (401은 재시도 불가능 -> 즉시 실패 -> 스테일 데이터 반환)
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
      );

      const result = await relayRequest({
        exchange: 'upbit',
        signedRequest: mockSignedRequest,
        cacheEndpoint: '/v1/accounts',
      });

      expect(result.success).toBe(true);
      expect(result.cached).toBe(true);
      expect(result.stale).toBe(true);
      expect(result.data).toEqual(mockResponseData);
      expect(result.error?.code).toBe('STALE_DATA');
    } finally {
      vi.useRealTimers();
    }
  });

  it('스테일 데이터도 없으면 오류를 반환한다', async () => {
    // 인증 오류 (401)는 재시도 불가능이므로 즉시 실패하여 타임아웃이 발생하지 않는다
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
    );

    const result = await relayRequest({
      exchange: 'upbit',
      signedRequest: mockSignedRequest,
      cacheEndpoint: '/v1/accounts',
    });

    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe('AUTH_ERROR');
  });

  it('POST 요청을 올바르게 릴레이한다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ balance: '1.0' }), { status: 200 }),
    );

    await relayRequest({
      exchange: 'bithumb',
      signedRequest: mockPostSignedRequest,
      useCache: false,
    });

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.bithumb.com/info/balance');
    expect(options?.method).toBe('POST');
    expect(options?.body).toBe(JSON.stringify({ order_currency: 'BTC' }));
  });

  it('커스텀 캐시 TTL을 적용할 수 있다', async () => {
    vi.useFakeTimers();

    try {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockResponseData), { status: 200 }),
      );

      // 커스텀 TTL 2초로 설정
      await relayRequest({
        exchange: 'upbit',
        signedRequest: mockSignedRequest,
        cacheEndpoint: '/v1/accounts',
        cacheTtlMs: 2000,
      });

      // 1.5초 후: 아직 캐시 유효
      vi.advanceTimersByTime(1500);
      const cache = getGlobalCache();
      const cacheResult = cache.get('upbit:/v1/accounts');
      expect(cacheResult.hit).toBe(true);

      // 2.5초 후: 캐시 만료
      vi.advanceTimersByTime(1000);
      const expiredResult = cache.get('upbit:/v1/accounts');
      expect(expiredResult.hit).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('성공 응답에 올바른 dataTimestamp를 반환한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponseData), { status: 200 }),
    );

    const before = Date.now();
    const result = await relayRequest({
      exchange: 'upbit',
      signedRequest: mockSignedRequest,
      useCache: false,
    });
    const after = Date.now();

    expect(result.dataTimestamp).toBeGreaterThanOrEqual(before);
    expect(result.dataTimestamp).toBeLessThanOrEqual(after);
  });
});

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('정상 응답을 반환한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponseData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await fetchWithTimeout('upbit', mockSignedRequest);
    expect(result).toEqual(mockResponseData);
  });

  it('서명된 요청의 헤더를 그대로 전달한다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    await fetchWithTimeout('upbit', mockSignedRequest);

    const [, options] = fetchSpy.mock.calls[0];
    expect(options?.headers).toEqual(mockSignedRequest.headers);
  });

  it('GET 요청에는 body를 포함하지 않는다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    await fetchWithTimeout('upbit', {
      ...mockSignedRequest,
      body: 'should-not-be-included',
    });

    const [, options] = fetchSpy.mock.calls[0];
    expect(options?.body).toBeUndefined();
  });

  it('POST 요청에는 body를 포함한다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    await fetchWithTimeout('bithumb', mockPostSignedRequest);

    const [, options] = fetchSpy.mock.calls[0];
    expect(options?.body).toBe(mockPostSignedRequest.body);
  });

  it('타임아웃 시 ProxyError(TIMEOUT)를 throw한다', async () => {
    vi.useFakeTimers();

    try {
      // fetch가 응답하지 않는 상황을 시뮬레이션
      // AbortSignal에 반응하여 reject하는 대신, 단순히 영원히 pending 상태로 유지
      // AbortController.abort()가 호출되면 fetch 자체가 DOMException으로 reject됨
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            const signal = options?.signal;
            if (signal) {
              // abort 시 즉시 reject (비동기 딜레이 없이)
              if (signal.aborted) {
                reject(new DOMException('The operation was aborted.', 'AbortError'));
                return;
              }
              signal.addEventListener('abort', () => {
                reject(new DOMException('The operation was aborted.', 'AbortError'));
              });
            }
          }),
      );

      // promise를 미리 catch로 잡아 unhandled rejection 방지
      let caughtError: ProxyError | undefined;
      const promise = fetchWithTimeout('upbit', mockSignedRequest).catch(
        (e: ProxyError) => {
          caughtError = e;
        },
      );

      // 타임아웃(10초) 진행
      await vi.advanceTimersByTimeAsync(11_000);

      await promise;

      expect(caughtError).toBeInstanceOf(ProxyError);
      expect(caughtError!.code).toBe('TIMEOUT');
      expect(caughtError!.statusCode).toBe(408);
      expect(caughtError!.message).toContain('10000ms');
    } finally {
      vi.useRealTimers();
    }
  });

  it('HTTP 401 응답 시 AUTH_ERROR를 throw한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
    );

    try {
      await fetchWithTimeout('upbit', mockSignedRequest);
      expect.fail('ProxyError가 발생해야 한다');
    } catch (error) {
      expect(error).toBeInstanceOf(ProxyError);
      expect((error as ProxyError).code).toBe('AUTH_ERROR');
      expect((error as ProxyError).statusCode).toBe(401);
    }
  });

  it('HTTP 403 응답 시 AUTH_ERROR를 throw한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Forbidden', { status: 403, statusText: 'Forbidden' }),
    );

    try {
      await fetchWithTimeout('upbit', mockSignedRequest);
      expect.fail('ProxyError가 발생해야 한다');
    } catch (error) {
      expect(error).toBeInstanceOf(ProxyError);
      expect((error as ProxyError).code).toBe('AUTH_ERROR');
      expect((error as ProxyError).statusCode).toBe(403);
    }
  });

  it('HTTP 429 응답 시 RATE_LIMIT를 throw한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Too Many Requests', { status: 429 }),
    );

    try {
      await fetchWithTimeout('upbit', mockSignedRequest);
      expect.fail('ProxyError가 발생해야 한다');
    } catch (error) {
      expect(error).toBeInstanceOf(ProxyError);
      expect((error as ProxyError).code).toBe('RATE_LIMIT');
      expect((error as ProxyError).statusCode).toBe(429);
    }
  });

  it('HTTP 500 응답 시 SERVER_ERROR를 throw한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal Server Error', { status: 500 }),
    );

    try {
      await fetchWithTimeout('upbit', mockSignedRequest);
      expect.fail('ProxyError가 발생해야 한다');
    } catch (error) {
      expect(error).toBeInstanceOf(ProxyError);
      expect((error as ProxyError).code).toBe('SERVER_ERROR');
      expect((error as ProxyError).statusCode).toBe(500);
    }
  });

  it('HTTP 400 응답 시 CLIENT_ERROR를 throw한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Bad Request', { status: 400, statusText: 'Bad Request' }),
    );

    try {
      await fetchWithTimeout('upbit', mockSignedRequest);
      expect.fail('ProxyError가 발생해야 한다');
    } catch (error) {
      expect(error).toBeInstanceOf(ProxyError);
      expect((error as ProxyError).code).toBe('CLIENT_ERROR');
      expect((error as ProxyError).statusCode).toBe(400);
    }
  });

  it('네트워크 오류 시 NETWORK_ERROR를 throw한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new TypeError('Failed to fetch'),
    );

    try {
      await fetchWithTimeout('upbit', mockSignedRequest);
      expect.fail('ProxyError가 발생해야 한다');
    } catch (error) {
      expect(error).toBeInstanceOf(ProxyError);
      expect((error as ProxyError).code).toBe('NETWORK_ERROR');
    }
  });

  it('fetch에 AbortSignal을 전달한다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    await fetchWithTimeout('upbit', mockSignedRequest);

    const [, options] = fetchSpy.mock.calls[0];
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('ProxyError', () => {
  it('오류 코드와 상태 코드를 포함한다', () => {
    const error = new ProxyError('test error', 'TIMEOUT', 408);

    expect(error.message).toBe('test error');
    expect(error.code).toBe('TIMEOUT');
    expect(error.statusCode).toBe(408);
    expect(error.name).toBe('ProxyError');
  });

  it('상태 코드 없이 생성할 수 있다', () => {
    const error = new ProxyError('network error', 'NETWORK_ERROR');

    expect(error.message).toBe('network error');
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.statusCode).toBeUndefined();
  });

  it('Error를 상속한다', () => {
    const error = new ProxyError('test', 'TEST');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ProxyError);
  });
});
