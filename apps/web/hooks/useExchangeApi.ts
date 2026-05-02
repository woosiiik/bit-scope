/**
 * 거래소 API React Query 훅 (useExchangeApi)
 *
 * TanStack Query(React Query)를 사용하여 거래소 API 호출을 관리한다.
 * 자동 갱신(기본 30초), 수동 새로고침, 로딩/에러 상태 관리,
 * 거래소별 병렬 조회 기능을 제공한다.
 *
 * 핵심 흐름:
 * 1. 암호화된 API Key를 복호화 (EncryptionService 의존)
 * 2. ExchangeApiClient를 통해 서명 생성 및 Route Handler 호출
 * 3. TanStack Query의 캐시 및 자동 갱신 관리
 *
 * 제공 훅:
 * - useExchangeBalance: 단일 거래소 잔고 조회
 * - useAllExchangeBalances: 등록된 모든 거래소 잔고 병렬 조회
 * - useExchangeTicker: 거래소 시세 조회 (공개 API)
 * - useExchangeOrderbook: 거래소 호가 조회 (공개 API)
 * - useExchangeOrderHistory: 거래소 주문 내역 조회
 *
 * @see 요구사항 2.4 (자동 갱신 30초)
 * @see 요구사항 2.5 (수동 새로고침)
 * @see 요구사항 2.11 (거래소별 로딩 상태 개별 표시)
 * @see 요구사항 NF1.3 (병렬 API 호출)
 */

'use client';

import { useCallback, useMemo } from 'react';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ApiKeyPair, ExchangeType } from '@bitscope/shared';
import { DEFAULT_REFRESH_INTERVAL_MS, SUPPORTED_EXCHANGES } from '@bitscope/shared';
import {
  fetchBalance,
  fetchTicker,
  fetchOrderbook,
  fetchOrderHistory,
  fetchBalancesInParallel,
  type BalanceResponse,
  type TickerResponse,
  type OrderbookResponse,
  type OrderHistoryResponse,
  type OrderHistoryParams,
  type ExchangeBalanceResult,
  ExchangeApiError,
} from '../lib/api-client';
import {
  decryptApiKey,
  getCachedEncryptionKey,
  getRegisteredExchanges,
  loadEncryptedKey,
} from '../lib/crypto/encryption-service';

// ===== 쿼리 키 팩토리 =====

/**
 * 거래소 API 관련 TanStack Query 키를 생성하는 팩토리
 *
 * 일관된 쿼리 키 구조를 유지하여 캐시 무효화 및 관리를 용이하게 한다.
 */
export const exchangeQueryKeys = {
  /** 모든 거래소 API 쿼리의 최상위 키 */
  all: ['exchange'] as const,

  /** 특정 거래소의 모든 쿼리 키 */
  exchange: (exchange: ExchangeType) => ['exchange', exchange] as const,

  /** 잔고 조회 쿼리 키 */
  balance: (exchange: ExchangeType) => ['exchange', exchange, 'balance'] as const,

  /** 모든 거래소 통합 잔고 조회 쿼리 키 */
  allBalances: () => ['exchange', 'all-balances'] as const,

  /** 시세 조회 쿼리 키 */
  ticker: (exchange: ExchangeType, symbols?: string[]) =>
    ['exchange', exchange, 'ticker', symbols ?? 'all'] as const,

  /** 호가 조회 쿼리 키 */
  orderbook: (exchange: ExchangeType, symbol: string) =>
    ['exchange', exchange, 'orderbook', symbol] as const,

  /** 주문 내역 조회 쿼리 키 */
  orderHistory: (exchange: ExchangeType, params?: OrderHistoryParams) =>
    ['exchange', exchange, 'orders', params ?? {}] as const,
} as const;

// ===== API Key 복호화 헬퍼 =====

/**
 * 지갑 주소와 거래소에 대한 API Key를 복호화한다.
 *
 * sessionStorage에 캐싱된 암호화 키를 사용하여 localStorage의
 * 암호화된 API Key를 복호화한다.
 *
 * @param walletAddress 지갑 주소
 * @param exchange 거래소 식별자
 * @returns 복호화된 API Key 쌍, 또는 null (복호화 불가 시)
 */
export function decryptApiKeyForExchange(
  walletAddress: string,
  exchange: ExchangeType,
): ApiKeyPair | null {
  const encryptionKey = getCachedEncryptionKey();
  if (!encryptionKey) {
    return null;
  }

  const storedData = loadEncryptedKey(walletAddress, exchange);
  if (!storedData) {
    return null;
  }

  try {
    return decryptApiKey(
      {
        encryptedAccessKey: storedData.encryptedAccessKey,
        encryptedSecretKey: storedData.encryptedSecretKey,
        iv: storedData.iv,
      },
      encryptionKey,
    );
  } catch {
    return null;
  }
}

/**
 * 등록된 모든 거래소에 대한 API Key를 일괄 복호화한다.
 *
 * @param walletAddress 지갑 주소
 * @returns 거래소별 복호화된 API Key 맵 (복호화 가능한 것만 포함)
 */
export function decryptAllApiKeys(
  walletAddress: string,
): Partial<Record<ExchangeType, ApiKeyPair>> {
  const registeredExchanges = getRegisteredExchanges(walletAddress);
  const result: Partial<Record<ExchangeType, ApiKeyPair>> = {};

  for (const exchange of registeredExchanges) {
    const apiKey = decryptApiKeyForExchange(walletAddress, exchange);
    if (apiKey) {
      result[exchange] = apiKey;
    }
  }

  return result;
}

// ===== React Query 훅 =====

/** useExchangeBalance 훅 옵션 */
export interface UseExchangeBalanceOptions {
  /** 거래소 식별자 */
  exchange: ExchangeType;
  /** 지갑 주소 */
  walletAddress: string;
  /** 쿼리 활성화 여부 (기본: true) */
  enabled?: boolean;
  /** 자동 갱신 주기 (밀리초). 0이면 자동 갱신 비활성화 */
  refetchInterval?: number;
}

/**
 * 단일 거래소의 잔고를 조회하는 React Query 훅
 *
 * API Key를 자동으로 복호화하고, 서명 생성 후 Route Handler를 통해
 * 거래소 잔고를 조회한다. 자동 갱신(기본 30초)을 지원한다.
 *
 * @param options 훅 옵션
 * @returns TanStack Query 결과 (데이터, 로딩 상태, 에러 등)
 *
 * @example
 * ```tsx
 * const { data, isLoading, error, refetch } = useExchangeBalance({
 *   exchange: 'upbit',
 *   walletAddress: '0x1234...',
 * });
 * ```
 *
 * @see 요구사항 2.4 (자동 갱신 30초)
 * @see 요구사항 2.5 (수동 새로고침 - refetch 함수)
 */
export function useExchangeBalance(
  options: UseExchangeBalanceOptions,
): UseQueryResult<BalanceResponse, ExchangeApiError> {
  const {
    exchange,
    walletAddress,
    enabled = true,
    refetchInterval = DEFAULT_REFRESH_INTERVAL_MS,
  } = options;

  return useQuery<BalanceResponse, ExchangeApiError>({
    queryKey: exchangeQueryKeys.balance(exchange),
    queryFn: async () => {
      const apiKey = decryptApiKeyForExchange(walletAddress, exchange);
      if (!apiKey) {
        throw new ExchangeApiError(
          'API 키를 복호화할 수 없습니다. 지갑 서명을 다시 진행해주세요.',
          'DECRYPTION_FAILED',
          exchange,
        );
      }
      return fetchBalance(exchange, apiKey);
    },
    enabled: enabled && !!walletAddress,
    refetchInterval: refetchInterval > 0 ? refetchInterval : false,
    // 브라우저 포커스 시 자동 갱신
    refetchOnWindowFocus: true,
    // 이전 데이터를 유지하여 깜박임 방지
    placeholderData: (previousData) => previousData,
    // 네트워크 오류 시 재시도 (최대 2회)
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 4000),
    // 캐시에서 데이터를 제공하되, 백그라운드에서 갱신
    staleTime: 10_000,
  });
}

/** useAllExchangeBalances 훅 옵션 */
export interface UseAllExchangeBalancesOptions {
  /** 지갑 주소 */
  walletAddress: string;
  /** 쿼리 활성화 여부 (기본: true) */
  enabled?: boolean;
  /** 자동 갱신 주기 (밀리초). 0이면 자동 갱신 비활성화 */
  refetchInterval?: number;
}

/** useAllExchangeBalances 반환 타입 */
export interface UseAllExchangeBalancesReturn {
  /** 거래소별 조회 결과 */
  results: ExchangeBalanceResult[];
  /** 전체 로딩 중 여부 (하나라도 로딩 중이면 true) */
  isLoading: boolean;
  /** 거래소별 로딩 상태 맵 */
  loadingStates: Partial<Record<ExchangeType, boolean>>;
  /** 전체 에러 여부 (모든 거래소가 에러인 경우) */
  isAllError: boolean;
  /** 부분 에러 여부 (일부 거래소만 에러인 경우) */
  hasPartialError: boolean;
  /** 거래소별 에러 맵 */
  errors: Partial<Record<ExchangeType, ExchangeApiError>>;
  /** 모든 거래소 데이터 수동 새로고침 */
  refetchAll: () => void;
  /** 특정 거래소 데이터 수동 새로고침 */
  refetchExchange: (exchange: ExchangeType) => void;
  /** 마지막 업데이트 시각 (가장 최근 성공 시각) */
  lastUpdated: Date | null;
}

/**
 * 등록된 모든 거래소의 잔고를 병렬로 조회하는 React Query 훅
 *
 * useQueries를 사용하여 거래소별로 독립적인 쿼리를 실행한다.
 * 이를 통해 거래소별 로딩 상태를 개별적으로 관리하고,
 * 특정 거래소 오류 시 나머지 거래소 데이터는 정상적으로 표시할 수 있다.
 *
 * @param options 훅 옵션
 * @returns 통합 조회 결과 (거래소별 결과, 로딩 상태, 에러 상태, 새로고침 함수)
 *
 * @example
 * ```tsx
 * const {
 *   results,
 *   isLoading,
 *   loadingStates,
 *   hasPartialError,
 *   errors,
 *   refetchAll,
 * } = useAllExchangeBalances({
 *   walletAddress: '0x1234...',
 * });
 * ```
 *
 * @see 요구사항 2.6 (특정 거래소 실패 시 나머지 정상 표시)
 * @see 요구사항 2.11 (거래소별 로딩 상태 개별 표시)
 * @see 요구사항 NF1.3 (병렬 API 호출)
 */
export function useAllExchangeBalances(
  options: UseAllExchangeBalancesOptions,
): UseAllExchangeBalancesReturn {
  const {
    walletAddress,
    enabled = true,
    refetchInterval = DEFAULT_REFRESH_INTERVAL_MS,
  } = options;

  const queryClient = useQueryClient();

  // 등록된 거래소 목록 조회
  const registeredExchanges = useMemo(() => {
    if (!walletAddress) return [];
    return getRegisteredExchanges(walletAddress);
  }, [walletAddress]);

  // 거래소별 독립 쿼리 실행 (useQueries)
  const queries = useQueries({
    queries: registeredExchanges.map((exchange) => ({
      queryKey: exchangeQueryKeys.balance(exchange),
      queryFn: async (): Promise<BalanceResponse> => {
        const apiKey = decryptApiKeyForExchange(walletAddress, exchange);
        if (!apiKey) {
          throw new ExchangeApiError(
            'API 키를 복호화할 수 없습니다. 지갑 서명을 다시 진행해주세요.',
            'DECRYPTION_FAILED',
            exchange,
          );
        }
        return fetchBalance(exchange, apiKey);
      },
      enabled: enabled && !!walletAddress,
      refetchInterval: refetchInterval > 0 ? refetchInterval : false,
      refetchOnWindowFocus: true,
      placeholderData: (previousData: BalanceResponse | undefined) => previousData,
      retry: 2,
      retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 4000),
      staleTime: 10_000,
    })),
  });

  // 결과 집계
  const results: ExchangeBalanceResult[] = useMemo(() => {
    return registeredExchanges.map((exchange, index) => {
      const query = queries[index];
      if (!query) {
        return {
          exchange,
          data: null,
          error: null,
          status: 'success' as const,
        };
      }
      if (query.data) {
        return {
          exchange,
          data: query.data,
          error: null,
          status: 'success' as const,
        };
      }
      if (query.error) {
        const error = query.error instanceof ExchangeApiError
          ? query.error
          : new ExchangeApiError(
              query.error instanceof Error ? query.error.message : String(query.error),
              'UNKNOWN_ERROR',
              exchange,
            );
        return {
          exchange,
          data: null,
          error,
          status: 'error' as const,
        };
      }
      // 아직 로딩 중이거나 enabled=false인 경우
      return {
        exchange,
        data: null,
        error: null,
        status: 'success' as const,
      };
    });
  }, [registeredExchanges, queries]);

  // 로딩 상태 집계
  const isLoading = queries.some((q) => q.isLoading);
  const loadingStates: Partial<Record<ExchangeType, boolean>> = useMemo(() => {
    const states: Partial<Record<ExchangeType, boolean>> = {};
    registeredExchanges.forEach((exchange, index) => {
      const query = queries[index];
      if (query) {
        states[exchange] = query.isLoading || query.isFetching;
      }
    });
    return states;
  }, [registeredExchanges, queries]);

  // 에러 상태 집계
  const errors: Partial<Record<ExchangeType, ExchangeApiError>> = useMemo(() => {
    const errorMap: Partial<Record<ExchangeType, ExchangeApiError>> = {};
    registeredExchanges.forEach((exchange, index) => {
      const query = queries[index];
      if (query?.error) {
        errorMap[exchange] = query.error instanceof ExchangeApiError
          ? query.error
          : new ExchangeApiError(
              query.error instanceof Error ? query.error.message : String(query.error),
              'UNKNOWN_ERROR',
              exchange,
            );
      }
    });
    return errorMap;
  }, [registeredExchanges, queries]);

  const errorCount = Object.keys(errors).length;
  const isAllError = errorCount > 0 && errorCount === registeredExchanges.length;
  const hasPartialError = errorCount > 0 && errorCount < registeredExchanges.length;

  // 마지막 업데이트 시각 (가장 최근 성공 시각)
  const lastUpdated = useMemo(() => {
    const timestamps = queries
      .filter((q) => q.data)
      .map((q) => q.dataUpdatedAt)
      .filter((t) => t > 0);

    if (timestamps.length === 0) return null;
    return new Date(Math.max(...timestamps));
  }, [queries]);

  // 모든 거래소 새로고침
  const refetchAll = useCallback(() => {
    queries.forEach((q) => q.refetch());
  }, [queries]);

  // 특정 거래소 새로고침
  const refetchExchange = useCallback(
    (exchange: ExchangeType) => {
      const index = registeredExchanges.indexOf(exchange);
      if (index >= 0 && queries[index]) {
        queries[index].refetch();
      }
    },
    [registeredExchanges, queries],
  );

  return {
    results,
    isLoading,
    loadingStates,
    isAllError,
    hasPartialError,
    errors,
    refetchAll,
    refetchExchange,
    lastUpdated,
  };
}

/** useExchangeTicker 훅 옵션 */
export interface UseExchangeTickerOptions {
  /** 거래소 식별자 */
  exchange: ExchangeType;
  /** 조회할 코인 심볼 배열 (선택) */
  symbols?: string[];
  /** 쿼리 활성화 여부 (기본: true) */
  enabled?: boolean;
  /** 자동 갱신 주기 (밀리초). 0이면 자동 갱신 비활성화 */
  refetchInterval?: number;
}

/**
 * 거래소 시세(Ticker)를 조회하는 React Query 훅
 *
 * 시세 데이터는 공개 API이므로 API Key 없이 조회한다.
 *
 * @param options 훅 옵션
 * @returns TanStack Query 결과
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useExchangeTicker({
 *   exchange: 'upbit',
 *   symbols: ['BTC', 'ETH'],
 * });
 * ```
 */
export function useExchangeTicker(
  options: UseExchangeTickerOptions,
): UseQueryResult<TickerResponse, ExchangeApiError> {
  const {
    exchange,
    symbols,
    enabled = true,
    refetchInterval = DEFAULT_REFRESH_INTERVAL_MS,
  } = options;

  return useQuery<TickerResponse, ExchangeApiError>({
    queryKey: exchangeQueryKeys.ticker(exchange, symbols),
    queryFn: () => fetchTicker(exchange, symbols),
    enabled,
    refetchInterval: refetchInterval > 0 ? refetchInterval : false,
    refetchOnWindowFocus: true,
    placeholderData: (previousData) => previousData,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 4000),
    staleTime: 10_000,
  });
}

/** useExchangeOrderbook 훅 옵션 */
export interface UseExchangeOrderbookOptions {
  /** 거래소 식별자 */
  exchange: ExchangeType;
  /** 코인 심볼 */
  symbol: string;
  /** 쿼리 활성화 여부 (기본: true) */
  enabled?: boolean;
  /** 자동 갱신 주기 (밀리초). 0이면 자동 갱신 비활성화 */
  refetchInterval?: number;
}

/**
 * 거래소 호가(Orderbook)를 조회하는 React Query 훅
 *
 * 호가 데이터는 공개 API이므로 API Key 없이 조회한다.
 *
 * @param options 훅 옵션
 * @returns TanStack Query 결과
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useExchangeOrderbook({
 *   exchange: 'upbit',
 *   symbol: 'BTC',
 * });
 * ```
 */
export function useExchangeOrderbook(
  options: UseExchangeOrderbookOptions,
): UseQueryResult<OrderbookResponse, ExchangeApiError> {
  const {
    exchange,
    symbol,
    enabled = true,
    refetchInterval = DEFAULT_REFRESH_INTERVAL_MS,
  } = options;

  return useQuery<OrderbookResponse, ExchangeApiError>({
    queryKey: exchangeQueryKeys.orderbook(exchange, symbol),
    queryFn: () => fetchOrderbook(exchange, symbol),
    enabled: enabled && !!symbol,
    refetchInterval: refetchInterval > 0 ? refetchInterval : false,
    refetchOnWindowFocus: true,
    placeholderData: (previousData) => previousData,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 4000),
    staleTime: 10_000,
  });
}

/** useExchangeOrderHistory 훅 옵션 */
export interface UseExchangeOrderHistoryOptions {
  /** 거래소 식별자 */
  exchange: ExchangeType;
  /** 지갑 주소 */
  walletAddress: string;
  /** 주문 내역 조회 파라미터 */
  params?: OrderHistoryParams;
  /** 쿼리 활성화 여부 (기본: true) */
  enabled?: boolean;
}

/**
 * 거래소 주문 내역을 조회하는 React Query 훅
 *
 * 주문 내역은 인증이 필요한 API이므로 API Key를 복호화하여 서명을 생성한다.
 *
 * @param options 훅 옵션
 * @returns TanStack Query 결과
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useExchangeOrderHistory({
 *   exchange: 'upbit',
 *   walletAddress: '0x1234...',
 *   params: { symbol: 'BTC', limit: 50 },
 * });
 * ```
 */
export function useExchangeOrderHistory(
  options: UseExchangeOrderHistoryOptions,
): UseQueryResult<OrderHistoryResponse, ExchangeApiError> {
  const {
    exchange,
    walletAddress,
    params,
    enabled = true,
  } = options;

  return useQuery<OrderHistoryResponse, ExchangeApiError>({
    queryKey: exchangeQueryKeys.orderHistory(exchange, params),
    queryFn: async () => {
      const apiKey = decryptApiKeyForExchange(walletAddress, exchange);
      if (!apiKey) {
        throw new ExchangeApiError(
          'API 키를 복호화할 수 없습니다. 지갑 서명을 다시 진행해주세요.',
          'DECRYPTION_FAILED',
          exchange,
        );
      }
      return fetchOrderHistory(exchange, apiKey, params);
    },
    enabled: enabled && !!walletAddress,
    // 주문 내역은 자동 갱신 비활성화 (요청 시에만 조회)
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 30_000,
  });
}

/**
 * 모든 거래소 관련 쿼리를 무효화하는 함수를 제공하는 훅
 *
 * 지갑 변경, API Key 재등록 등의 상황에서 전체 캐시를 무효화할 때 사용한다.
 *
 * @returns invalidateAll 함수
 */
export function useInvalidateExchangeQueries(): {
  /** 모든 거래소 쿼리를 무효화하고 다시 조회한다 */
  invalidateAll: () => Promise<void>;
  /** 특정 거래소의 쿼리를 무효화하고 다시 조회한다 */
  invalidateExchange: (exchange: ExchangeType) => Promise<void>;
} {
  const queryClient = useQueryClient();

  const invalidateAll = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: exchangeQueryKeys.all,
    });
  }, [queryClient]);

  const invalidateExchange = useCallback(
    async (exchange: ExchangeType) => {
      await queryClient.invalidateQueries({
        queryKey: exchangeQueryKeys.exchange(exchange),
      });
    },
    [queryClient],
  );

  return { invalidateAll, invalidateExchange };
}
