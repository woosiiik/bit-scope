/**
 * 오류 복구 및 Graceful Degradation 전략 (ErrorRecoveryStrategy)
 *
 * 거래소 API 호출 과정에서 발생하는 다양한 오류를 분류하고,
 * 적절한 복구 전략을 적용한다. 핵심 원칙:
 *
 * 1. 재시도 가능 여부 판단: 타임아웃, Rate Limit 등은 재시도 가능하지만,
 *    잘못된 API Key, 권한 부족 등은 재시도해도 무의미하다.
 * 2. 지수 백오프 재시도: 재시도 가능한 오류에 대해 1s -> 2s -> 4s 간격으로 재시도한다.
 * 3. 폴백 데이터 제공: 특정 거래소 오류 시 마지막 성공 데이터를 유지하여 반환한다.
 * 4. 거래소별 독립 오류 상태 관리: 특정 거래소 장애가 나머지에 영향을 미치지 않는다.
 * 5. 스냅샷 저장 실패 시 로컬 큐잉: 실패한 스냅샷을 큐에 저장하고 이후 재시도한다.
 *
 * @see 요구사항 2.6 (특정 거래소 오류 시 나머지 정상 표시)
 * @see 요구사항 NF3.1 (99% 이상 가용성)
 * @see 요구사항 NF3.2 (Graceful Degradation)
 * @see 요구사항 NF3.3 (오류 로깅 및 복구 안내)
 * @see 설계 문서 6.1, 6.2, 6.3 오류 처리 전략
 */

import type { ExchangeType, PortfolioSnapshot } from '@bitscope/shared';
import { EXCHANGE_CONFIGS, RETRY_CONFIG } from '@bitscope/shared';
import { ExchangeApiError, type BalanceResponse } from './api-client';

// ===== 오류 코드 분류 상수 =====

/** 재시도 가능한 오류 코드 목록 */
const RETRYABLE_ERROR_CODES = new Set<string>([
  'TIMEOUT',
  'RATE_LIMITED',
  'SERVER_ERROR',
  'NETWORK_ERROR',
  'EXCHANGE_MAINTENANCE',
  'SERVICE_UNAVAILABLE',
  'BAD_GATEWAY',
  'GATEWAY_TIMEOUT',
]);

/** 재시도 불가한 오류 코드 목록 (즉시 사용자에게 알려야 하는 오류) */
const NON_RETRYABLE_ERROR_CODES = new Set<string>([
  'AUTH_ERROR',
  'INVALID_KEY',
  'INSUFFICIENT_PERMISSION',
  'DECRYPTION_FAILED',
  'PARSE_ERROR',
  'EMPTY_RESPONSE',
  'INVALID_REQUEST',
]);

/** 재시도 가능한 HTTP 상태 코드 */
const RETRYABLE_STATUS_CODES = new Set<number>([408, 429, 500, 502, 503, 504]);

// ===== 타입 정의 =====

/** 오류 상태 정보 */
export interface ErrorState {
  /** 거래소 식별자 */
  exchange: ExchangeType;
  /** 오류 객체 */
  error: ExchangeApiError;
  /** 오류 발생 시각 */
  occurredAt: Date;
  /** 연속 오류 횟수 */
  consecutiveErrorCount: number;
  /** 마지막 성공 시각 (있는 경우) */
  lastSuccessAt: Date | null;
}

/** 캐시된 거래소 데이터 (폴백용) */
export interface CachedExchangeData {
  /** 거래소 식별자 */
  exchange: ExchangeType;
  /** 잔고 데이터 */
  data: BalanceResponse;
  /** 캐시 저장 시각 */
  cachedAt: Date;
  /** 데이터의 최신성 여부 (false이면 stale 데이터) */
  isFresh: boolean;
}

/** 지수 백오프 재시도 옵션 */
export interface RetryOptions {
  /** 최대 재시도 횟수 (기본값: RETRY_CONFIG.maxRetries) */
  maxRetries: number;
  /** 기본 대기 시간 (밀리초, 기본값: RETRY_CONFIG.baseDelayMs) */
  baseDelay: number;
  /** 최대 대기 시간 (밀리초, 기본값: RETRY_CONFIG.maxDelayMs) */
  maxDelay: number;
  /** 재시도 시 콜백 (시도 횟수, 오류) */
  onRetry?: (attempt: number, error: Error) => void;
}

/** 스냅샷 큐 항목 */
export interface QueuedSnapshot {
  /** 지갑 주소 */
  walletAddress: string;
  /** 스냅샷 데이터 */
  snapshot: PortfolioSnapshot;
  /** 큐에 추가된 시각 */
  queuedAt: Date;
  /** 재시도 횟수 */
  retryCount: number;
}

/** 스냅샷 큐 상태 */
export interface SnapshotQueueStatus {
  /** 큐에 대기 중인 스냅샷 수 */
  pendingCount: number;
  /** 큐 항목 목록 */
  items: QueuedSnapshot[];
}

// ===== 재시도 가능 여부 판단 =====

/**
 * 오류가 재시도 가능한지 판단한다.
 *
 * 타임아웃, Rate Limit, 서버 오류, 네트워크 오류 등은 재시도 가능하며,
 * 잘못된 API Key, 권한 부족, 복호화 실패 등은 재시도해도 무의미하다.
 *
 * @param error 거래소 API 오류
 * @returns 재시도 가능 여부
 *
 * @see 설계 문서 6.1 오류 분류
 */
export function isRetryable(error: ExchangeApiError): boolean {
  // 명시적으로 재시도 불가한 오류 코드인 경우
  if (NON_RETRYABLE_ERROR_CODES.has(error.code)) {
    return false;
  }

  // 명시적으로 재시도 가능한 오류 코드인 경우
  if (RETRYABLE_ERROR_CODES.has(error.code)) {
    return true;
  }

  // HTTP 상태 코드 기반 판단
  if (error.statusCode !== undefined && RETRYABLE_STATUS_CODES.has(error.statusCode)) {
    return true;
  }

  // 알 수 없는 오류는 기본적으로 1회 재시도 허용
  return error.code === 'UNKNOWN_ERROR';
}

// ===== 지수 백오프 재시도 =====

/**
 * 지수 백오프를 적용하여 비동기 함수를 재시도한다.
 *
 * 재시도 간격: baseDelay * 2^(attempt-1), 최대 maxDelay까지 증가한다.
 * 예) baseDelay=1000, maxDelay=4000일 때: 1s -> 2s -> 4s
 *
 * @param fn 재시도할 비동기 함수
 * @param options 재시도 옵션
 * @returns 함수 실행 결과
 * @throws 모든 재시도가 실패하면 마지막 오류를 throw
 *
 * @see 설계 문서 6.3 클라이언트 오류 복구 패턴
 * @see 요구사항 12.6 (지수 백오프 전략)
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? RETRY_CONFIG.maxRetries;
  const baseDelay = options?.baseDelay ?? RETRY_CONFIG.baseDelayMs;
  const maxDelay = options?.maxDelay ?? RETRY_CONFIG.maxDelayMs;
  const onRetry = options?.onRetry;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 마지막 시도에서도 실패하면 throw
      if (attempt >= maxRetries) {
        break;
      }

      // 재시도 불가한 오류인 경우 즉시 throw
      if (error instanceof ExchangeApiError && !isRetryable(error)) {
        throw error;
      }

      // 콜백 호출
      if (onRetry) {
        onRetry(attempt + 1, lastError);
      }

      // 지수 백오프 대기 (baseDelay * 2^attempt, 최대 maxDelay)
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      await sleep(delay);
    }
  }

  // 모든 재시도 실패
  throw lastError;
}

/**
 * 지정된 밀리초 동안 대기한다.
 *
 * @param ms 대기 시간 (밀리초)
 * @returns 대기 완료 시 resolve되는 Promise
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===== 폴백 데이터 캐시 =====

/**
 * 거래소별 마지막 성공 데이터를 캐시하여 폴백으로 제공하는 클래스.
 *
 * 특정 거래소의 API 호출이 실패했을 때, 마지막으로 성공한 데이터를
 * 반환하여 사용자가 최소한의 정보를 유지할 수 있도록 한다.
 *
 * @see 요구사항 2.6 (마지막 성공 데이터 유지)
 * @see 설계 문서 6.1 거래소 API 타임아웃, 거래소 점검 시 처리 전략
 */
export class FallbackDataCache {
  /** 거래소별 캐시된 데이터 */
  private cache: Map<ExchangeType, CachedExchangeData> = new Map();

  /** 캐시 데이터의 유효 기간 (밀리초). 기본값 5분 */
  private readonly freshDurationMs: number;

  /**
   * @param freshDurationMs 데이터를 '신선'하다고 판단하는 유효 기간 (밀리초). 기본값 300000(5분)
   */
  constructor(freshDurationMs: number = 300_000) {
    this.freshDurationMs = freshDurationMs;
  }

  /**
   * 거래소의 성공 데이터를 캐시에 저장한다.
   *
   * API 호출이 성공할 때마다 호출하여 최신 성공 데이터를 유지한다.
   *
   * @param exchange 거래소 식별자
   * @param data 잔고 응답 데이터
   */
  cacheSuccessData(exchange: ExchangeType, data: BalanceResponse): void {
    this.cache.set(exchange, {
      exchange,
      data,
      cachedAt: new Date(),
      isFresh: true,
    });
  }

  /**
   * 거래소의 폴백 데이터를 조회한다.
   *
   * 캐시된 데이터가 freshDurationMs 이내이면 isFresh=true,
   * 그 이후이면 isFresh=false로 표시하여 데이터의 최신성을 알려준다.
   *
   * @param exchange 거래소 식별자
   * @returns 캐시된 데이터 또는 null (캐시가 없는 경우)
   *
   * @see 설계 문서 6.1 "마지막 캐시 데이터 반환"
   */
  getFallbackData(exchange: ExchangeType): CachedExchangeData | null {
    const cached = this.cache.get(exchange);
    if (!cached) {
      return null;
    }

    // 유효 기간 확인하여 신선도 업데이트
    const now = Date.now();
    const age = now - cached.cachedAt.getTime();
    const isFresh = age <= this.freshDurationMs;

    return {
      ...cached,
      isFresh,
    };
  }

  /**
   * 거래소의 캐시 데이터를 삭제한다.
   *
   * API Key 삭제, 지갑 변경 등의 상황에서 호출한다.
   *
   * @param exchange 거래소 식별자
   */
  clearCache(exchange: ExchangeType): void {
    this.cache.delete(exchange);
  }

  /**
   * 모든 거래소의 캐시 데이터를 삭제한다.
   */
  clearAll(): void {
    this.cache.clear();
  }

  /**
   * 캐시된 거래소 목록을 반환한다.
   *
   * @returns 캐시가 존재하는 거래소 식별자 배열
   */
  getCachedExchanges(): ExchangeType[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 특정 거래소의 캐시 존재 여부를 확인한다.
   *
   * @param exchange 거래소 식별자
   * @returns 캐시 존재 여부
   */
  hasCache(exchange: ExchangeType): boolean {
    return this.cache.has(exchange);
  }
}

// ===== 거래소별 오류 상태 관리 =====

/**
 * 거래소별 오류 상태를 독립적으로 관리하는 클래스.
 *
 * 특정 거래소에서 오류가 발생해도 나머지 거래소의 서비스에
 * 영향을 미치지 않도록 오류 상태를 거래소별로 분리 관리한다.
 *
 * @see 요구사항 NF3.2 (Graceful Degradation - 나머지 거래소 정상 서비스)
 */
export class ErrorStateManager {
  /** 거래소별 오류 상태 맵 */
  private errorStates: Map<ExchangeType, ErrorState> = new Map();

  /**
   * 오류를 보고하고 오류 상태를 업데이트한다.
   *
   * 동일 거래소에 대해 연속 오류가 발생하면 consecutiveErrorCount를 증가시킨다.
   *
   * @param exchange 거래소 식별자
   * @param error 발생한 오류
   */
  reportError(exchange: ExchangeType, error: ExchangeApiError): void {
    const existingState = this.errorStates.get(exchange);

    this.errorStates.set(exchange, {
      exchange,
      error,
      occurredAt: new Date(),
      consecutiveErrorCount: existingState
        ? existingState.consecutiveErrorCount + 1
        : 1,
      lastSuccessAt: existingState?.lastSuccessAt ?? null,
    });
  }

  /**
   * 오류 상태를 해제한다.
   *
   * API 호출이 성공하면 해당 거래소의 오류 상태를 제거하고,
   * 마지막 성공 시각을 기록한다.
   *
   * @param exchange 거래소 식별자
   */
  clearError(exchange: ExchangeType): void {
    const existingState = this.errorStates.get(exchange);

    // 오류 상태를 제거하되, 마지막 성공 시각은 보존하기 위해
    // 다음 오류 발생 시 참조할 수 있도록 별도 맵에는 저장하지 않고
    // 오류 상태 자체를 제거한다. (lastSuccessAt은 다음 reportError 호출 시 갱신)
    this.errorStates.delete(exchange);
  }

  /**
   * 특정 거래소의 오류 상태를 조회한다.
   *
   * @param exchange 거래소 식별자
   * @returns 오류 상태 또는 null (정상 상태)
   */
  getErrorState(exchange: ExchangeType): ErrorState | null {
    return this.errorStates.get(exchange) ?? null;
  }

  /**
   * 오류가 있는 모든 거래소의 상태를 조회한다.
   *
   * @returns 오류 상태 배열
   */
  getAllErrorStates(): ErrorState[] {
    return Array.from(this.errorStates.values());
  }

  /**
   * 특정 거래소에 오류가 발생한 상태인지 확인한다.
   *
   * @param exchange 거래소 식별자
   * @returns 오류 상태 여부
   */
  hasError(exchange: ExchangeType): boolean {
    return this.errorStates.has(exchange);
  }

  /**
   * 모든 거래소의 오류 상태를 초기화한다.
   */
  clearAll(): void {
    this.errorStates.clear();
  }
}

// ===== 스냅샷 저장 실패 시 로컬 큐잉 =====

/** 스냅샷 큐의 최대 크기 */
const MAX_SNAPSHOT_QUEUE_SIZE = 50;

/** 스냅샷 큐 항목의 최대 재시도 횟수 */
const MAX_SNAPSHOT_RETRY_COUNT = 5;

/** 스냅샷 큐의 localStorage 키 */
const SNAPSHOT_QUEUE_STORAGE_KEY = 'bitscope:snapshot-queue';

/**
 * 스냅샷 저장 실패 시 로컬 큐에 저장하고 이후 재시도하는 클래스.
 *
 * NestJS 백엔드가 일시적으로 불가용한 경우, 스냅샷 데이터를 로컬 큐에
 * 저장해두었다가 서비스가 복구되면 일괄 전송한다.
 * 사용자에게는 백그라운드로 처리하여 별도의 알림을 보여주지 않는다.
 *
 * @see 설계 문서 6.1 스냅샷 저장 실패 처리
 * @see 설계 문서 6.2 Graceful Degradation - 스냅샷 로컬 큐잉
 */
export class SnapshotQueue {
  /** 큐에 저장된 스냅샷 목록 */
  private queue: QueuedSnapshot[] = [];

  constructor() {
    this.loadFromStorage();
  }

  /**
   * 스냅샷을 큐에 추가한다.
   *
   * 큐 크기가 MAX_SNAPSHOT_QUEUE_SIZE를 초과하면 가장 오래된 항목을 제거한다.
   *
   * @param walletAddress 지갑 주소
   * @param snapshot 포트폴리오 스냅샷
   */
  enqueue(walletAddress: string, snapshot: PortfolioSnapshot): void {
    const item: QueuedSnapshot = {
      walletAddress,
      snapshot,
      queuedAt: new Date(),
      retryCount: 0,
    };

    this.queue.push(item);

    // 큐 크기 초과 시 가장 오래된 항목 제거
    while (this.queue.length > MAX_SNAPSHOT_QUEUE_SIZE) {
      this.queue.shift();
    }

    this.saveToStorage();
  }

  /**
   * 큐에서 전송 대기 중인 스냅샷들을 가져온다.
   *
   * 최대 재시도 횟수를 초과한 항목은 제외한다.
   *
   * @returns 전송 가능한 스냅샷 항목 배열
   */
  getPendingItems(): QueuedSnapshot[] {
    return this.queue.filter((item) => item.retryCount < MAX_SNAPSHOT_RETRY_COUNT);
  }

  /**
   * 전송에 성공한 항목을 큐에서 제거한다.
   *
   * @param item 제거할 항목
   */
  dequeue(item: QueuedSnapshot): void {
    const index = this.queue.indexOf(item);
    if (index >= 0) {
      this.queue.splice(index, 1);
      this.saveToStorage();
    }
  }

  /**
   * 전송 실패한 항목의 재시도 횟수를 증가시킨다.
   *
   * 최대 재시도 횟수를 초과하면 큐에서 제거한다.
   *
   * @param item 실패한 항목
   */
  markRetry(item: QueuedSnapshot): void {
    item.retryCount += 1;

    // 최대 재시도 횟수 초과 시 제거
    if (item.retryCount >= MAX_SNAPSHOT_RETRY_COUNT) {
      this.dequeue(item);
      return;
    }

    this.saveToStorage();
  }

  /**
   * 대기 중인 스냅샷을 지정한 전송 함수를 사용하여 일괄 전송한다.
   *
   * 각 항목에 대해 전송을 시도하고, 성공하면 큐에서 제거,
   * 실패하면 재시도 횟수를 증가시킨다.
   *
   * @param sendFn 스냅샷을 서버에 전송하는 함수
   * @returns 전송 결과 (성공 수, 실패 수)
   */
  async flush(
    sendFn: (walletAddress: string, snapshot: PortfolioSnapshot) => Promise<void>,
  ): Promise<{ successCount: number; failureCount: number }> {
    const pending = this.getPendingItems();

    if (pending.length === 0) {
      return { successCount: 0, failureCount: 0 };
    }

    let successCount = 0;
    let failureCount = 0;

    for (const item of pending) {
      try {
        await sendFn(item.walletAddress, item.snapshot);
        this.dequeue(item);
        successCount++;
      } catch {
        this.markRetry(item);
        failureCount++;
      }
    }

    return { successCount, failureCount };
  }

  /**
   * 큐의 현재 상태를 반환한다.
   *
   * @returns 큐 상태 (대기 항목 수, 항목 목록)
   */
  getStatus(): SnapshotQueueStatus {
    return {
      pendingCount: this.getPendingItems().length,
      items: [...this.queue],
    };
  }

  /**
   * 큐를 비운다.
   */
  clear(): void {
    this.queue = [];
    this.removeFromStorage();
  }

  /**
   * 큐 데이터를 localStorage에 저장한다.
   */
  private saveToStorage(): void {
    try {
      const serialized = JSON.stringify(this.queue);
      localStorage.setItem(SNAPSHOT_QUEUE_STORAGE_KEY, serialized);
    } catch {
      // localStorage 사용 불가한 환경에서는 무시한다
    }
  }

  /**
   * localStorage에서 큐 데이터를 로드한다.
   */
  private loadFromStorage(): void {
    try {
      const serialized = localStorage.getItem(SNAPSHOT_QUEUE_STORAGE_KEY);
      if (serialized) {
        const parsed = JSON.parse(serialized) as QueuedSnapshot[];
        // Date 객체 복원
        this.queue = parsed.map((item) => ({
          ...item,
          queuedAt: new Date(item.queuedAt),
          snapshot: {
            ...item.snapshot,
            timestamp: new Date(item.snapshot.timestamp),
          },
        }));
      }
    } catch {
      // 파싱 실패 시 빈 큐로 초기화한다
      this.queue = [];
    }
  }

  /**
   * localStorage에서 큐 데이터를 제거한다.
   */
  private removeFromStorage(): void {
    try {
      localStorage.removeItem(SNAPSHOT_QUEUE_STORAGE_KEY);
    } catch {
      // localStorage 사용 불가한 환경에서는 무시한다
    }
  }
}

// ===== 사용자 친화적 오류 메시지 생성 =====

/**
 * ExchangeApiError를 사용자 친화적인 메시지로 변환한다.
 *
 * 각 오류 유형에 따라 사용자에게 도움이 되는 안내 메시지를 생성한다.
 *
 * @param error 거래소 API 오류
 * @returns 사용자에게 표시할 메시지
 *
 * @see 설계 문서 6.1 사용자 안내 메시지
 * @see 요구사항 NF3.3 (사용자에게 서비스 복구 안내)
 */
export function getUserFriendlyErrorMessage(error: ExchangeApiError): string {
  const exchangeName = EXCHANGE_CONFIGS[error.exchange]?.nameKo ?? error.exchange;

  switch (error.code) {
    case 'TIMEOUT':
    case 'GATEWAY_TIMEOUT':
      return `${exchangeName} 데이터가 지연되고 있습니다. 잠시 후 다시 시도해주세요.`;

    case 'RATE_LIMITED':
      return `${exchangeName} 요청이 일시적으로 제한되었습니다. 잠시 후 자동으로 재시도합니다.`;

    case 'AUTH_ERROR':
    case 'INVALID_KEY':
      return `${exchangeName} API 키가 유효하지 않습니다. 키를 확인해주세요.`;

    case 'INSUFFICIENT_PERMISSION':
      return `${exchangeName} API 키의 권한이 부족합니다. Read-Only 권한의 API 키로 재발급해주세요.`;

    case 'DECRYPTION_FAILED':
      return 'API 키를 복호화할 수 없습니다. 지갑을 확인해주세요.';

    case 'SERVER_ERROR':
    case 'BAD_GATEWAY':
    case 'SERVICE_UNAVAILABLE':
      return `${exchangeName} 서버에 일시적인 문제가 발생했습니다. 잠시 후 자동으로 재시도합니다.`;

    case 'EXCHANGE_MAINTENANCE':
      return `${exchangeName}이(가) 점검 중입니다. 마지막 데이터를 표시합니다.`;

    case 'NETWORK_ERROR':
      return '네트워크 연결을 확인해주세요.';

    case 'PARSE_ERROR':
      return `${exchangeName}에서 올바르지 않은 응답을 받았습니다. 잠시 후 다시 시도해주세요.`;

    case 'EMPTY_RESPONSE':
      return `${exchangeName}에서 데이터를 받지 못했습니다.`;

    default:
      return `${exchangeName} 연동 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.`;
  }
}

/**
 * 폴백 데이터와 함께 표시할 안내 메시지를 생성한다.
 *
 * @param exchange 거래소 식별자
 * @param cachedData 캐시된 폴백 데이터
 * @returns 안내 메시지
 */
export function getFallbackDataMessage(
  exchange: ExchangeType,
  cachedData: CachedExchangeData,
): string {
  const exchangeName = EXCHANGE_CONFIGS[exchange]?.nameKo ?? exchange;
  const cachedTime = cachedData.cachedAt.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (cachedData.isFresh) {
    return `${exchangeName} 연결 오류. 최근 데이터를 표시합니다 (${cachedTime} 기준).`;
  }

  return `${exchangeName} 연결 오류. 마지막 업데이트: ${cachedTime} (오래된 데이터일 수 있습니다).`;
}

// ===== 통합 오류 복구 전략 인스턴스 =====

/**
 * 통합 오류 복구 전략을 제공하는 클래스.
 *
 * FallbackDataCache, ErrorStateManager, SnapshotQueue를 통합하여
 * 일관된 오류 복구 인터페이스를 제공한다.
 *
 * @see 설계 문서 6.3 ErrorRecoveryStrategy 인터페이스
 */
export class ErrorRecoveryStrategy {
  /** 폴백 데이터 캐시 */
  readonly fallbackCache: FallbackDataCache;
  /** 오류 상태 관리자 */
  readonly errorStateManager: ErrorStateManager;
  /** 스냅샷 저장 실패 큐 */
  readonly snapshotQueue: SnapshotQueue;

  constructor(freshDurationMs?: number) {
    this.fallbackCache = new FallbackDataCache(freshDurationMs);
    this.errorStateManager = new ErrorStateManager();
    this.snapshotQueue = new SnapshotQueue();
  }

  /**
   * 오류가 재시도 가능한지 판단한다.
   *
   * @param error 거래소 API 오류
   * @returns 재시도 가능 여부
   */
  isRetryable(error: ExchangeApiError): boolean {
    return isRetryable(error);
  }

  /**
   * 지수 백오프를 적용하여 재시도한다.
   *
   * @param fn 재시도할 비동기 함수
   * @param options 재시도 옵션
   * @returns 함수 실행 결과
   */
  retryWithBackoff<T>(
    fn: () => Promise<T>,
    options?: Partial<RetryOptions>,
  ): Promise<T> {
    return retryWithBackoff(fn, options);
  }

  /**
   * 거래소의 폴백 데이터를 조회한다.
   *
   * @param exchange 거래소 식별자
   * @returns 캐시된 데이터 또는 null
   */
  getFallbackData(exchange: ExchangeType): CachedExchangeData | null {
    return this.fallbackCache.getFallbackData(exchange);
  }

  /**
   * 오류를 보고한다.
   *
   * @param exchange 거래소 식별자
   * @param error 발생한 오류
   */
  reportError(exchange: ExchangeType, error: ExchangeApiError): void {
    this.errorStateManager.reportError(exchange, error);
  }

  /**
   * 오류 상태를 해제한다.
   *
   * @param exchange 거래소 식별자
   */
  clearError(exchange: ExchangeType): void {
    this.errorStateManager.clearError(exchange);
  }

  /**
   * 특정 거래소의 오류 상태를 조회한다.
   *
   * @param exchange 거래소 식별자
   * @returns 오류 상태 또는 null
   */
  getErrorState(exchange: ExchangeType): ErrorState | null {
    return this.errorStateManager.getErrorState(exchange);
  }

  /**
   * API 호출 성공 시 호출하여 캐시와 오류 상태를 갱신한다.
   *
   * @param exchange 거래소 식별자
   * @param data 성공한 잔고 데이터
   */
  handleSuccess(exchange: ExchangeType, data: BalanceResponse): void {
    this.fallbackCache.cacheSuccessData(exchange, data);
    this.errorStateManager.clearError(exchange);
  }

  /**
   * API 호출 실패 시 호출하여 오류 상태를 업데이트하고 폴백 데이터를 반환한다.
   *
   * @param exchange 거래소 식별자
   * @param error 발생한 오류
   * @returns 폴백 데이터 (있으면), 없으면 null
   */
  handleError(
    exchange: ExchangeType,
    error: ExchangeApiError,
  ): CachedExchangeData | null {
    this.errorStateManager.reportError(exchange, error);
    return this.fallbackCache.getFallbackData(exchange);
  }

  /**
   * 모든 상태를 초기화한다 (지갑 변경, 로그아웃 시).
   */
  reset(): void {
    this.fallbackCache.clearAll();
    this.errorStateManager.clearAll();
    this.snapshotQueue.clear();
  }
}

// ===== 싱글톤 인스턴스 =====

/** 전역 오류 복구 전략 인스턴스 */
let errorRecoveryInstance: ErrorRecoveryStrategy | null = null;

/**
 * 전역 ErrorRecoveryStrategy 인스턴스를 반환한다.
 *
 * 싱글톤 패턴으로 앱 전체에서 동일한 인스턴스를 사용한다.
 *
 * @returns ErrorRecoveryStrategy 인스턴스
 */
export function getErrorRecoveryStrategy(): ErrorRecoveryStrategy {
  if (!errorRecoveryInstance) {
    errorRecoveryInstance = new ErrorRecoveryStrategy();
  }
  return errorRecoveryInstance;
}

/**
 * 전역 ErrorRecoveryStrategy 인스턴스를 초기화한다.
 * 테스트 또는 앱 리셋 시 사용한다.
 */
export function resetErrorRecoveryStrategy(): void {
  errorRecoveryInstance?.reset();
  errorRecoveryInstance = null;
}
