/**
 * 거래소별 Rate Limit 관리 및 지수 백오프 재시도
 *
 * 각 거래소의 API Rate Limit을 준수하기 위한 토큰 버킷(Token Bucket) 기반
 * Rate Limiter와, Rate Limit 초과 시 지수 백오프(Exponential Backoff) 재시도를
 * 제공한다.
 *
 * - 토큰 버킷: 초당 최대 요청 수 기준으로 토큰을 관리한다.
 * - 지수 백오프: 최대 3회 재시도, 1s -> 2s -> 4s 대기 후 재시도한다.
 *
 * @see 요구사항 12.6 (Rate Limit 지수 백오프 재시도)
 * @see 요구사항 NF1.4 (거래소 API Rate Limit 준수)
 * @see 설계 문서 3.2.2 RateLimiter
 */

import type { ExchangeType } from '@bitscope/shared';
import { EXCHANGE_CONFIGS, RETRY_CONFIG } from '@bitscope/shared';

/** Rate Limiter 오류 클래스 */
export class RateLimitError extends Error {
  /** 거래소 식별자 */
  readonly exchange: ExchangeType;
  /** 다음 요청 가능 시간까지 남은 밀리초 */
  readonly retryAfterMs: number;

  constructor(exchange: ExchangeType, retryAfterMs: number) {
    super(`Rate limit exceeded for ${exchange}. Retry after ${retryAfterMs}ms`);
    this.name = 'RateLimitError';
    this.exchange = exchange;
    this.retryAfterMs = retryAfterMs;
  }
}

/** 지수 백오프 재시도 옵션 */
export interface RetryOptions {
  /** 최대 재시도 횟수 (기본: 3) */
  maxRetries?: number;
  /** 기본 대기 시간 (밀리초, 기본: 1000) */
  baseDelayMs?: number;
  /** 최대 대기 시간 (밀리초, 기본: 4000) */
  maxDelayMs?: number;
  /** 재시도 시 호출되는 콜백 */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
  /** 재시도 가능 여부를 판단하는 함수 */
  isRetryable?: (error: Error) => boolean;
}

/** 토큰 버킷 상태 */
interface TokenBucket {
  /** 현재 사용 가능한 토큰 수 */
  tokens: number;
  /** 최대 토큰 수 (초당 최대 요청 수) */
  maxTokens: number;
  /** 마지막 토큰 충전 시각 (밀리초 타임스탬프) */
  lastRefillAt: number;
  /** 초당 토큰 충전 속도 */
  refillRate: number;
}

/**
 * 거래소별 Rate Limit을 관리하는 토큰 버킷 기반 Rate Limiter
 *
 * 각 거래소의 초당 최대 요청 수(requestsPerSecond)를 기준으로
 * 토큰 버킷을 운영하여 Rate Limit을 준수한다.
 */
export class ExchangeRateLimiter {
  /** 거래소별 토큰 버킷 */
  private readonly buckets: Map<ExchangeType, TokenBucket> = new Map();

  constructor() {
    this.initializeBuckets();
  }

  /**
   * EXCHANGE_CONFIGS 기반으로 각 거래소의 토큰 버킷을 초기화한다.
   */
  private initializeBuckets(): void {
    for (const [exchange, config] of Object.entries(EXCHANGE_CONFIGS)) {
      const maxTokens = config.rateLimit.requestsPerSecond;
      this.buckets.set(exchange as ExchangeType, {
        tokens: maxTokens,
        maxTokens,
        lastRefillAt: Date.now(),
        refillRate: maxTokens,
      });
    }
  }

  /**
   * 토큰 버킷을 시간 경과에 따라 충전한다.
   *
   * @param bucket 토큰 버킷
   * @param now 현재 시각 (밀리초 타임스탬프)
   */
  private refillBucket(bucket: TokenBucket, now: number): void {
    const elapsed = now - bucket.lastRefillAt;
    const tokensToAdd = (elapsed / 1000) * bucket.refillRate;
    bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefillAt = now;
  }

  /**
   * 지정된 거래소의 토큰을 획득한다.
   *
   * 토큰이 충분하면 즉시 반환하고, 부족하면 RateLimitError를 발생시킨다.
   * 요청 전에 호출하여 Rate Limit을 준수한다.
   *
   * @param exchange 거래소 식별자
   * @throws {RateLimitError} 토큰이 부족한 경우
   */
  acquireToken(exchange: ExchangeType): void {
    const bucket = this.buckets.get(exchange);

    if (!bucket) {
      throw new Error(`지원하지 않는 거래소입니다: ${exchange}`);
    }

    const now = Date.now();
    this.refillBucket(bucket, now);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return;
    }

    // 토큰 부족: 다음 토큰이 채워질 때까지의 대기 시간 계산
    const deficit = 1 - bucket.tokens;
    const retryAfterMs = Math.ceil((deficit / bucket.refillRate) * 1000);
    throw new RateLimitError(exchange, retryAfterMs);
  }

  /**
   * 지정된 거래소의 토큰을 비동기로 획득한다.
   *
   * 토큰이 부족하면 충분한 토큰이 채워질 때까지 대기한 후 획득한다.
   *
   * @param exchange 거래소 식별자
   */
  async acquireTokenAsync(exchange: ExchangeType): Promise<void> {
    const bucket = this.buckets.get(exchange);

    if (!bucket) {
      throw new Error(`지원하지 않는 거래소입니다: ${exchange}`);
    }

    const now = Date.now();
    this.refillBucket(bucket, now);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return;
    }

    // 토큰이 채워질 때까지 대기
    const deficit = 1 - bucket.tokens;
    const waitMs = Math.ceil((deficit / bucket.refillRate) * 1000);

    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));

    // 대기 후 다시 refill 시도
    this.refillBucket(bucket, Date.now());
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
    }
  }

  /**
   * 지정된 거래소가 현재 Rate Limited 상태인지 확인한다.
   *
   * @param exchange 거래소 식별자
   * @returns Rate Limited 상태 여부
   */
  isRateLimited(exchange: ExchangeType): boolean {
    const bucket = this.buckets.get(exchange);

    if (!bucket) {
      return false;
    }

    const now = Date.now();
    this.refillBucket(bucket, now);
    return bucket.tokens < 1;
  }

  /**
   * 지정된 거래소의 현재 사용 가능한 토큰 수를 반환한다.
   *
   * @param exchange 거래소 식별자
   * @returns 사용 가능한 토큰 수
   */
  getAvailableTokens(exchange: ExchangeType): number {
    const bucket = this.buckets.get(exchange);

    if (!bucket) {
      return 0;
    }

    this.refillBucket(bucket, Date.now());
    return bucket.tokens;
  }

  /**
   * 모든 거래소의 토큰 버킷을 초기 상태로 리셋한다.
   *
   * 테스트 또는 오류 복구 시 사용한다.
   */
  reset(): void {
    this.buckets.clear();
    this.initializeBuckets();
  }
}

/**
 * 지수 백오프(Exponential Backoff) 전략으로 함수를 재시도한다.
 *
 * 함수 실행이 실패할 경우 지수적으로 증가하는 대기 시간 후 재시도한다.
 * 기본 설정: 최대 3회 재시도, 1s -> 2s -> 4s 대기.
 *
 * @param fn 재시도할 비동기 함수
 * @param options 재시도 옵션
 * @returns 함수 실행 결과
 * @throws 모든 재시도가 실패한 경우 마지막 오류를 throw
 *
 * @example
 * ```typescript
 * const result = await retryWithBackoff(
 *   () => fetchExchangeData(exchange),
 *   {
 *     maxRetries: 3,
 *     baseDelayMs: 1000,
 *     onRetry: (attempt, error) => console.log(`재시도 ${attempt}:`, error.message),
 *   }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? RETRY_CONFIG.maxRetries;
  const baseDelayMs = options?.baseDelayMs ?? RETRY_CONFIG.baseDelayMs;
  const maxDelayMs = options?.maxDelayMs ?? RETRY_CONFIG.maxDelayMs;
  const onRetry = options?.onRetry;
  const isRetryable = options?.isRetryable ?? defaultIsRetryable;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 마지막 시도이거나 재시도 불가능한 오류면 즉시 throw
      if (attempt >= maxRetries || !isRetryable(lastError)) {
        throw lastError;
      }

      // 지수 백오프 대기 시간 계산: baseDelay * 2^attempt
      const delayMs = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);

      if (onRetry) {
        onRetry(attempt + 1, lastError, delayMs);
      }

      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // 이론적으로 도달할 수 없지만 TypeScript 타입 안전성을 위해 추가
  throw lastError ?? new Error('retryWithBackoff: unexpected error');
}

/**
 * 기본 재시도 가능 여부 판단 함수
 *
 * Rate Limit 오류, 네트워크 오류, 서버 오류(5xx)는 재시도 가능으로 판단하고,
 * 인증 오류(401, 403), 잘못된 요청(400) 등은 재시도 불가능으로 판단한다.
 *
 * @param error 발생한 오류
 * @returns 재시도 가능 여부
 */
function defaultIsRetryable(error: Error): boolean {
  // Rate Limit 오류는 재시도 가능
  if (error instanceof RateLimitError) {
    return true;
  }

  // 네트워크 오류 관련 메시지는 재시도 가능
  const networkErrorPatterns = [
    'fetch failed',
    'network error',
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'timeout',
    'aborted',
  ];

  const message = error.message.toLowerCase();
  if (networkErrorPatterns.some((pattern) => message.includes(pattern.toLowerCase()))) {
    return true;
  }

  // HTTP 상태 코드 기반 판단 (커스텀 오류에 statusCode가 있는 경우)
  const statusCode = (error as { statusCode?: number }).statusCode;
  if (statusCode !== undefined) {
    // 5xx 서버 오류, 429 Too Many Requests는 재시도 가능
    if (statusCode >= 500 || statusCode === 429) {
      return true;
    }
    // 4xx 클라이언트 오류는 재시도 불가능
    if (statusCode >= 400 && statusCode < 500) {
      return false;
    }
  }

  return false;
}

/**
 * 전역 Rate Limiter 인스턴스
 *
 * Next.js Route Handler에서 공유하는 싱글턴 Rate Limiter이다.
 */
let globalRateLimiter: ExchangeRateLimiter | null = null;

/**
 * 전역 Rate Limiter 인스턴스를 반환한다.
 *
 * 최초 호출 시 인스턴스를 생성하고 이후 동일 인스턴스를 반환한다 (싱글턴).
 *
 * @returns ExchangeRateLimiter 전역 인스턴스
 */
export function getGlobalRateLimiter(): ExchangeRateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = new ExchangeRateLimiter();
  }
  return globalRateLimiter;
}

/**
 * 전역 Rate Limiter 인스턴스를 초기화(재생성)한다.
 *
 * 테스트 또는 개발 환경에서 Rate Limiter를 리셋하기 위한 용도이다.
 */
export function resetGlobalRateLimiter(): void {
  if (globalRateLimiter) {
    globalRateLimiter.reset();
    globalRateLimiter = null;
  }
}
