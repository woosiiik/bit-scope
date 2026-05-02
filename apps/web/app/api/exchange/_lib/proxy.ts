/**
 * 거래소 API 프록시 릴레이
 *
 * 클라이언트가 서명한 거래소 API 요청을 거래소 서버에 그대로 릴레이(전달)하고
 * 응답을 반환한다. API Key 원문은 서버로 전송되지 않으며,
 * 서명된 요청(헤더 및 페이로드)만 전달받아 릴레이한다.
 *
 * - 타임아웃: 10초 (거래소별 설정에 따름)
 * - 캐싱: InMemoryCache를 통한 TTL 기반 캐싱
 * - Rate Limit: ExchangeRateLimiter를 통한 요청 제한 및 지수 백오프 재시도
 *
 * @see 요구사항 12.3 (서명된 요청 릴레이 및 응답 반환)
 * @see 요구사항 12.7 (10초 타임아웃)
 * @see 요구사항 12.8 (거래소 점검 시 마지막 캐시 데이터 반환)
 * @see 요구사항 8.15, 8.16 (API Key 원문 서버 전송 금지)
 * @see 설계 문서 3.2.1 ExchangeProxyHandler
 */

import type { ExchangeType, SignedRequest } from '@bitscope/shared';
import { EXCHANGE_CONFIGS } from '@bitscope/shared';
import { getGlobalCache, buildCacheKey } from './cache';
import { getGlobalRateLimiter, retryWithBackoff, RateLimitError } from './rate-limiter';

/** 프록시 요청 옵션 */
export interface ProxyRequestOptions {
  /** 거래소 식별자 */
  exchange: ExchangeType;
  /** 클라이언트가 서명한 요청 */
  signedRequest: SignedRequest;
  /** 캐시 키 생성에 사용될 엔드포인트 경로 */
  cacheEndpoint?: string;
  /** 캐시 키 생성에 사용될 쿼리 파라미터 */
  cacheParams?: Record<string, string>;
  /** 캐시 사용 여부 (기본: true) */
  useCache?: boolean;
  /** 캐시 TTL (밀리초). 생략 시 기본 TTL 사용 */
  cacheTtlMs?: number;
}

/** 프록시 응답 */
export interface ProxyResponse<T = unknown> {
  /** 성공 여부 */
  success: boolean;
  /** 응답 데이터 */
  data: T | null;
  /** 캐시 히트 여부 */
  cached: boolean;
  /** 스테일(만료) 데이터 여부 */
  stale: boolean;
  /** 데이터의 저장 시각 (캐시 데이터인 경우) */
  dataTimestamp: number | null;
  /** 오류 정보 (실패 시) */
  error?: {
    message: string;
    code: string;
    statusCode?: number;
  };
}

/** 프록시 오류 클래스 */
export class ProxyError extends Error {
  /** 오류 코드 */
  readonly code: string;
  /** HTTP 상태 코드 */
  readonly statusCode?: number;

  constructor(message: string, code: string, statusCode?: number) {
    super(message);
    this.name = 'ProxyError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * 서명된 거래소 API 요청을 릴레이하고 응답을 반환한다.
 *
 * 다음 순서로 처리한다:
 * 1. 캐시 확인: 유효한 캐시 데이터가 있으면 즉시 반환
 * 2. Rate Limit 확인: 토큰 획득 가능 여부 확인
 * 3. 거래소 API 호출: 서명된 요청을 그대로 릴레이
 * 4. 응답 캐시 저장: 성공 응답을 캐시에 저장
 * 5. 오류 시 스테일 데이터 반환 시도
 *
 * @param options 프록시 요청 옵션
 * @returns 프록시 응답
 */
export async function relayRequest<T = unknown>(
  options: ProxyRequestOptions,
): Promise<ProxyResponse<T>> {
  const {
    exchange,
    signedRequest,
    cacheEndpoint,
    cacheParams,
    useCache = true,
    cacheTtlMs,
  } = options;

  const cache = getGlobalCache();
  const rateLimiter = getGlobalRateLimiter();

  // 캐시 키 생성
  const cacheKey = cacheEndpoint
    ? buildCacheKey(exchange, cacheEndpoint, cacheParams)
    : buildCacheKey(exchange, signedRequest.url);

  // 1. 캐시 확인 (캐시 사용 시)
  // getWithStale()을 사용하여 TTL 만료된 데이터도 보존한다.
  // 이를 통해 이후 거래소 API 호출 실패 시 스테일 데이터를 반환할 수 있다.
  if (useCache) {
    const cacheResult = cache.getWithStale<T>(cacheKey);
    if (cacheResult.hit && cacheResult.isFresh && cacheResult.data !== null) {
      return {
        success: true,
        data: cacheResult.data,
        cached: true,
        stale: false,
        dataTimestamp: cacheResult.storedAt,
      };
    }
  }

  // 2. Rate Limit 토큰 획득 및 거래소 API 호출 (지수 백오프 재시도)
  try {
    const data = await retryWithBackoff<T>(
      async () => {
        // Rate Limit 토큰 획득
        rateLimiter.acquireToken(exchange);

        // 거래소 API 호출 (타임아웃 적용)
        return await fetchWithTimeout<T>(exchange, signedRequest);
      },
      {
        onRetry: (attempt, error, delayMs) => {
          console.warn(
            `[Proxy] ${exchange} 재시도 ${attempt}회 (${delayMs}ms 후): ${error.message}`,
          );
        },
      },
    );

    // 성공 응답 캐시 저장
    if (useCache) {
      cache.set(cacheKey, data, cacheTtlMs);
    }

    return {
      success: true,
      data,
      cached: false,
      stale: false,
      dataTimestamp: Date.now(),
    };
  } catch (error) {
    // 오류 시 스테일 데이터 반환 시도
    if (useCache) {
      const staleResult = cache.getWithStale<T>(cacheKey);
      if (staleResult.hit && staleResult.data !== null) {
        console.warn(
          `[Proxy] ${exchange} API 호출 실패, 스테일 캐시 데이터 반환: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );

        return {
          success: true,
          data: staleResult.data,
          cached: true,
          stale: true,
          dataTimestamp: staleResult.storedAt,
          error: {
            message: error instanceof Error ? error.message : String(error),
            code: 'STALE_DATA',
          },
        };
      }
    }

    // 스테일 데이터도 없으면 오류 반환
    const proxyError = toProxyError(error);
    return {
      success: false,
      data: null,
      cached: false,
      stale: false,
      dataTimestamp: null,
      error: {
        message: proxyError.message,
        code: proxyError.code,
        statusCode: proxyError.statusCode,
      },
    };
  }
}

/**
 * 타임아웃이 적용된 HTTP 요청을 수행한다.
 *
 * 거래소별 설정된 타임아웃 시간(기본 10초) 내에 응답이 없으면
 * AbortError를 발생시킨다.
 *
 * @param exchange 거래소 식별자
 * @param signedRequest 서명된 요청 정보
 * @returns 거래소 API 응답 데이터
 * @throws {ProxyError} 타임아웃, HTTP 오류 등
 */
export async function fetchWithTimeout<T = unknown>(
  exchange: ExchangeType,
  signedRequest: SignedRequest,
): Promise<T> {
  const config = EXCHANGE_CONFIGS[exchange];
  const timeoutMs = config?.timeoutMs ?? 10_000;

  // AbortController를 사용한 타임아웃 구현
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchOptions: RequestInit = {
      method: signedRequest.method,
      headers: signedRequest.headers,
      signal: controller.signal,
    };

    // GET이 아닌 요청에 body 포함
    if (signedRequest.body && signedRequest.method !== 'GET') {
      fetchOptions.body = signedRequest.body;
    }

    const response = await fetch(signedRequest.url, fetchOptions);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new ProxyError(
        `거래소 API 응답 오류: ${response.status} ${response.statusText} - ${errorBody}`,
        mapHttpStatusToErrorCode(response.status),
        response.status,
      );
    }

    const data = (await response.json()) as T;
    return data;
  } catch (error) {
    if (error instanceof ProxyError) {
      throw error;
    }

    // AbortController에 의한 타임아웃
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ProxyError(
        `거래소 API 응답 타임아웃 (${timeoutMs}ms): ${exchange}`,
        'TIMEOUT',
        408,
      );
    }

    // AbortError가 일반 Error로 전달되는 환경 처리
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ProxyError(
        `거래소 API 응답 타임아웃 (${timeoutMs}ms): ${exchange}`,
        'TIMEOUT',
        408,
      );
    }

    // 네트워크 오류
    throw new ProxyError(
      `거래소 API 네트워크 오류: ${error instanceof Error ? error.message : String(error)}`,
      'NETWORK_ERROR',
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * HTTP 상태 코드를 오류 코드 문자열로 매핑한다.
 *
 * @param statusCode HTTP 상태 코드
 * @returns 오류 코드 문자열
 */
function mapHttpStatusToErrorCode(statusCode: number): string {
  if (statusCode === 401 || statusCode === 403) {
    return 'AUTH_ERROR';
  }
  if (statusCode === 429) {
    return 'RATE_LIMIT';
  }
  if (statusCode >= 500) {
    return 'SERVER_ERROR';
  }
  if (statusCode >= 400) {
    return 'CLIENT_ERROR';
  }
  return 'UNKNOWN_ERROR';
}

/**
 * 다양한 오류 타입을 ProxyError로 변환한다.
 *
 * @param error 원본 오류
 * @returns ProxyError 인스턴스
 */
function toProxyError(error: unknown): ProxyError {
  if (error instanceof ProxyError) {
    return error;
  }

  if (error instanceof RateLimitError) {
    return new ProxyError(error.message, 'RATE_LIMIT', 429);
  }

  if (error instanceof Error) {
    return new ProxyError(error.message, 'UNKNOWN_ERROR');
  }

  return new ProxyError(String(error), 'UNKNOWN_ERROR');
}
