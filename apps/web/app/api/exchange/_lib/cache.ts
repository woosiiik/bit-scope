/**
 * TTL 기반 인메모리 캐시
 *
 * 거래소 API 응답을 일시적으로 캐시하여 동일 데이터에 대한 반복 요청 시
 * 불필요한 거래소 API 호출을 줄인다.
 *
 * - 기본 TTL: 10초 (DEFAULT_CACHE_TTL_MS)
 * - 만료된 항목은 조회 시 lazy 삭제 및 주기적 정리(cleanup)를 통해 제거된다.
 * - 거래소 점검/장애 시 마지막 캐시 데이터를 반환하는 스테일 데이터 조회를 지원한다.
 *
 * @see 요구사항 12.5 (캐싱 전략, 기본 TTL 10초)
 * @see 요구사항 12.8 (거래소 점검 시 마지막 캐시 데이터 반환)
 * @see 설계 문서 3.2.1 ExchangeProxyHandler
 */

import { DEFAULT_CACHE_TTL_MS } from '@bitscope/shared';

/** 캐시에 저장되는 단일 항목 */
export interface CacheEntry<T = unknown> {
  /** 저장된 데이터 */
  data: T;
  /** 캐시에 저장된 시각 (밀리초 타임스탬프) */
  storedAt: number;
  /** 만료 시각 (밀리초 타임스탬프) */
  expiresAt: number;
}

/** 캐시 조회 결과 */
export interface CacheResult<T = unknown> {
  /** 캐시 히트 여부 */
  hit: boolean;
  /** 캐시된 데이터 (히트 시) */
  data: T | null;
  /** 데이터의 최신 여부 (TTL 만료 전이면 true, 스테일 데이터면 false) */
  isFresh: boolean;
  /** 데이터가 저장된 시각 */
  storedAt: number | null;
}

/** 인메모리 캐시 클래스 */
export class InMemoryCache {
  /** 캐시 저장소 */
  private readonly store: Map<string, CacheEntry> = new Map();
  /** 기본 TTL (밀리초) */
  private readonly defaultTtlMs: number;
  /** 정리(cleanup) 주기 (밀리초) */
  private readonly cleanupIntervalMs: number;
  /** 정리 타이머 ID */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * InMemoryCache 인스턴스를 생성한다.
   *
   * @param defaultTtlMs 기본 TTL (밀리초). 기본값은 10초.
   * @param cleanupIntervalMs 만료 항목 정리 주기 (밀리초). 기본값은 60초.
   */
  constructor(
    defaultTtlMs: number = DEFAULT_CACHE_TTL_MS,
    cleanupIntervalMs: number = 60_000,
  ) {
    this.defaultTtlMs = defaultTtlMs;
    this.cleanupIntervalMs = cleanupIntervalMs;
  }

  /**
   * 주기적 정리 타이머를 시작한다.
   *
   * 서버 시작 시 호출하여 만료된 캐시 항목을 주기적으로 제거한다.
   */
  startCleanup(): void {
    if (this.cleanupTimer !== null) {
      return;
    }

    this.cleanupTimer = setInterval(() => {
      this.removeExpiredEntries();
    }, this.cleanupIntervalMs);

    // Node.js에서 타이머가 프로세스 종료를 막지 않도록 unref 처리
    if (typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * 주기적 정리 타이머를 중지한다.
   */
  stopCleanup(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 캐시에 데이터를 저장한다.
   *
   * @param key 캐시 키
   * @param data 저장할 데이터
   * @param ttlMs TTL (밀리초). 생략 시 기본 TTL을 사용한다.
   */
  set<T>(key: string, data: T, ttlMs?: number): void {
    const now = Date.now();
    const ttl = ttlMs ?? this.defaultTtlMs;

    this.store.set(key, {
      data,
      storedAt: now,
      expiresAt: now + ttl,
    });
  }

  /**
   * 캐시에서 유효한(만료되지 않은) 데이터를 조회한다.
   *
   * TTL이 만료된 항목은 캐시에서 제거되고 null을 반환한다.
   *
   * @param key 캐시 키
   * @returns 캐시된 데이터 또는 null
   */
  get<T>(key: string): CacheResult<T> {
    const entry = this.store.get(key);

    if (!entry) {
      return { hit: false, data: null, isFresh: false, storedAt: null };
    }

    const now = Date.now();

    if (now < entry.expiresAt) {
      // 캐시 히트: TTL 유효
      return {
        hit: true,
        data: entry.data as T,
        isFresh: true,
        storedAt: entry.storedAt,
      };
    }

    // TTL 만료: lazy 삭제
    this.store.delete(key);
    return { hit: false, data: null, isFresh: false, storedAt: null };
  }

  /**
   * 스테일(만료) 데이터를 포함하여 캐시에서 조회한다.
   *
   * 거래소 API 장애 시 마지막 캐시된 데이터를 반환하기 위한 메서드이다.
   * TTL이 만료된 데이터도 삭제하지 않고 isFresh=false로 반환한다.
   *
   * @param key 캐시 키
   * @returns 캐시 조회 결과 (스테일 데이터 포함)
   */
  getWithStale<T>(key: string): CacheResult<T> {
    const entry = this.store.get(key);

    if (!entry) {
      return { hit: false, data: null, isFresh: false, storedAt: null };
    }

    const now = Date.now();
    const isFresh = now < entry.expiresAt;

    return {
      hit: true,
      data: entry.data as T,
      isFresh,
      storedAt: entry.storedAt,
    };
  }

  /**
   * 캐시에서 특정 항목을 삭제한다.
   *
   * @param key 삭제할 캐시 키
   * @returns 삭제 성공 여부
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * 캐시의 모든 항목을 삭제한다.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * 캐시에 해당 키의 유효한 항목이 존재하는지 확인한다.
   *
   * @param key 확인할 캐시 키
   * @returns 유효한 항목 존재 여부
   */
  has(key: string): boolean {
    const result = this.get(key);
    return result.hit;
  }

  /**
   * 현재 캐시에 저장된 항목 수를 반환한다.
   *
   * 만료된 항목도 포함될 수 있다 (lazy 삭제 전까지).
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * 만료된 캐시 항목들을 모두 제거한다.
   *
   * 주기적 정리(cleanup) 또는 수동으로 호출할 수 있다.
   *
   * @returns 제거된 항목 수
   */
  removeExpiredEntries(): number {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.expiresAt) {
        this.store.delete(key);
        removedCount++;
      }
    }

    return removedCount;
  }
}

/**
 * 캐시 키 생성 유틸리티
 *
 * 거래소 타입과 엔드포인트, 쿼리 파라미터를 조합하여 고유한 캐시 키를 생성한다.
 *
 * @param exchange 거래소 식별자
 * @param endpoint API 엔드포인트 경로
 * @param params 쿼리 파라미터 (선택)
 * @returns 캐시 키 문자열
 *
 * @example
 * ```typescript
 * const key = buildCacheKey('upbit', '/v1/ticker', { markets: 'KRW-BTC' });
 * // => "upbit:/v1/ticker?markets=KRW-BTC"
 * ```
 */
export function buildCacheKey(
  exchange: string,
  endpoint: string,
  params?: Record<string, string>,
): string {
  let key = `${exchange}:${endpoint}`;

  if (params && Object.keys(params).length > 0) {
    // 파라미터를 키 순서로 정렬하여 동일한 파라미터 조합이 같은 키를 생성하도록 한다
    const sortedParams = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&');
    key += `?${sortedParams}`;
  }

  return key;
}

/**
 * 전역 캐시 인스턴스
 *
 * Next.js Route Handler에서 공유하는 싱글턴 캐시이다.
 * 기본 TTL 10초, 정리 주기 60초로 설정된다.
 */
let globalCache: InMemoryCache | null = null;

/**
 * 전역 캐시 인스턴스를 반환한다.
 *
 * 최초 호출 시 인스턴스를 생성하고 정리 타이머를 시작한다.
 * 이후 호출 시 동일 인스턴스를 반환한다 (싱글턴).
 *
 * @returns InMemoryCache 전역 인스턴스
 */
export function getGlobalCache(): InMemoryCache {
  if (!globalCache) {
    globalCache = new InMemoryCache();
    globalCache.startCleanup();
  }
  return globalCache;
}

/**
 * 전역 캐시 인스턴스를 초기화(재생성)한다.
 *
 * 테스트 또는 개발 환경에서 캐시를 리셋하기 위한 용도이다.
 */
export function resetGlobalCache(): void {
  if (globalCache) {
    globalCache.stopCleanup();
    globalCache.clear();
    globalCache = null;
  }
}
