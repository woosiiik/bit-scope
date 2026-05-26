/**
 * 선물 거래 전용 React Query 훅 (useFuturesApi)
 *
 * TanStack Query를 사용하여 선물 거래소 API 호출을 관리한다.
 * 선물 오더북 자동 갱신(2초), 포지션/오픈 오더 조회 기능을 제공한다.
 *
 * 제공 훅:
 * - useFuturesOrderbook: 선물 오더북 조회 (공개 API, 2초 간격)
 * - useFuturesPositions: 선물 포지션 조회 (30초 간격, useQueries 병렬 조회)
 * - useFuturesOpenOrders: 선물 오픈 오더 조회 (30초 간격, useQueries 병렬 조회)
 *
 * @see 요구사항 5.7 (오더북 주기적 갱신)
 * @see 요구사항 7.1 (오픈 포지션 조회)
 * @see 요구사항 8.1 (오픈 오더 조회)
 */

'use client';

import { useMemo, useCallback } from 'react';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import type { FuturesExchangeType, FuturesPosition, FuturesOpenOrder, ExchangeType } from '@bitscope/shared';
import {
  fetchFuturesOrderbook,
  fetchFuturesPositions,
  fetchFuturesOpenOrders,
  signFuturesPositionsRequest,
  signFuturesOpenOrdersRequest,
  type FuturesOrderbookResponse,
  type FuturesPositionsResponse,
  type FuturesOpenOrdersResponse,
  ExchangeApiError,
} from '../lib/api-client';
import { decryptApiKeyForExchange } from './useExchangeApi';

// ===== 상수 =====

/** 선물 포지션/오더 지원 거래소 (API Key 기반 조회 대상) */
const FUTURES_API_EXCHANGES: FuturesExchangeType[] = ['binance', 'bybit', 'okx', 'gate', 'bitget', 'hyperliquid'];

/** 포지션/오더 자동 갱신 주기: 30초 */
const FUTURES_REFETCH_INTERVAL = 30_000;

// ===== 쿼리 키 팩토리 =====

/**
 * 선물 거래 API 관련 TanStack Query 키를 생성하는 팩토리
 */
export const futuresQueryKeys = {
  /** 모든 선물 쿼리의 최상위 키 */
  all: ['futures'] as const,

  /** 선물 오더북 쿼리 키 */
  orderbook: (exchange: FuturesExchangeType, symbol: string) =>
    ['futures', exchange, 'orderbook', symbol] as const,

  /** 특정 거래소의 선물 포지션 쿼리 키 */
  positions: (exchange: FuturesExchangeType) =>
    ['futures', exchange, 'positions'] as const,

  /** 전체 거래소 통합 포지션 쿼리 키 */
  allPositions: () => ['futures', 'all-positions'] as const,

  /** 특정 거래소의 선물 오픈 오더 쿼리 키 */
  openOrders: (exchange: FuturesExchangeType) =>
    ['futures', exchange, 'open-orders'] as const,

  /** 전체 거래소 통합 오픈 오더 쿼리 키 */
  allOpenOrders: () => ['futures', 'all-open-orders'] as const,
} as const;

// ===== useFuturesOrderbook =====

/** useFuturesOrderbook 훅 옵션 */
export interface UseFuturesOrderbookOptions {
  /** 선물 거래소 식별자 */
  exchange: FuturesExchangeType;
  /** baseAsset 심볼 (예: 'BTC') */
  symbol: string;
  /** 쿼리 활성화 여부 (기본: true) */
  enabled?: boolean;
  /** 자동 갱신 주기 (밀리초, 기본: 2000) */
  refetchInterval?: number;
}

/**
 * 선물 오더북을 조회하는 React Query 훅
 *
 * 선물 오더북 데이터는 공개 API이므로 API Key 없이 조회한다.
 * 기본 2초 간격으로 자동 갱신한다.
 *
 * @param options 훅 옵션
 * @returns TanStack Query 결과 (오더북 데이터, 로딩 상태, 에러)
 *
 * @see 요구사항 5.7 (1~3초 간격 오더북 갱신)
 */
export function useFuturesOrderbook(
  options: UseFuturesOrderbookOptions,
): UseQueryResult<FuturesOrderbookResponse, ExchangeApiError> {
  const {
    exchange,
    symbol,
    enabled = true,
    refetchInterval = 2000,
  } = options;

  return useQuery<FuturesOrderbookResponse, ExchangeApiError>({
    queryKey: futuresQueryKeys.orderbook(exchange, symbol),
    queryFn: () => fetchFuturesOrderbook(exchange, symbol),
    enabled: enabled && !!symbol,
    refetchInterval: refetchInterval > 0 ? refetchInterval : false,
    refetchOnWindowFocus: true,
    // 이전 데이터를 유지하여 깜박임 방지
    placeholderData: (previousData) => previousData,
    // 네트워크 오류 시 재시도 (최대 2회)
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 4000),
    // 캐시에서 데이터를 제공하되, 백그라운드에서 갱신
    staleTime: 1_000,
  });
}

// ===== useFuturesPositions =====

/** useFuturesPositions 반환 타입 */
export interface UseFuturesPositionsReturn {
  /** 전체 거래소의 포지션 목록 */
  positions: FuturesPosition[];
  /** 로딩 중 여부 */
  isLoading: boolean;
  /** API Key가 등록된 선물 거래소가 있는지 여부 */
  hasRegisteredExchanges: boolean;
  /** 거래소별 에러 맵 */
  errors: Partial<Record<FuturesExchangeType, ExchangeApiError>>;
  /** 전체 거래소 새로고침 */
  refetchAll: () => void;
}

/**
 * 선물 포지션을 조회하는 React Query 훅
 *
 * 등록된 모든 선물 거래소(Binance, Gate.io, Bitget)에 대해 병렬로
 * 포지션을 조회하고 통합된 결과를 반환한다.
 * 30초 간격으로 자동 갱신된다.
 *
 * @returns 통합 포지션 목록, 로딩 상태, 에러 맵, 새로고침 함수
 */
export function useFuturesPositions(): UseFuturesPositionsReturn {
  const { address } = useAccount();
  const walletAddress = address ?? '';
  const queryClient = useQueryClient();

  // 각 선물 거래소에 대해 API Key가 있는지 확인하여 활성화할 거래소 결정
  const exchangeApiKeys = useMemo(() => {
    if (!walletAddress) return [];

    return FUTURES_API_EXCHANGES
      .map((exchange) => {
        const apiKey = decryptApiKeyForExchange(walletAddress, exchange as ExchangeType);
        return apiKey ? { exchange, apiKey } : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [walletAddress]);

  const queries = useQueries({
    queries: exchangeApiKeys.map(({ exchange, apiKey }) => ({
      queryKey: futuresQueryKeys.positions(exchange),
      queryFn: async (): Promise<FuturesPositionsResponse> => {
        const signedRequest = signFuturesPositionsRequest(exchange as ExchangeType, apiKey);
        if (!signedRequest) {
          throw new ExchangeApiError(
            '서명을 생성할 수 없습니다.',
            'SIGN_FAILED',
            exchange as ExchangeType,
          );
        }
        return fetchFuturesPositions(exchange, signedRequest);
      },
      enabled: !!walletAddress,
      refetchInterval: FUTURES_REFETCH_INTERVAL,
      refetchOnWindowFocus: true,
      placeholderData: (previousData: FuturesPositionsResponse | undefined) => previousData,
      retry: 2,
      retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 4000),
      staleTime: 10_000,
    })),
  });

  // 결과 집계
  const positions = useMemo(() => {
    const allPositions: FuturesPosition[] = [];
    for (const query of queries) {
      if (query.data?.positions) {
        allPositions.push(...query.data.positions);
      }
    }
    return allPositions;
  }, [queries]);

  const isLoading = queries.some((q) => q.isLoading);

  const errors = useMemo(() => {
    const errorMap: Partial<Record<FuturesExchangeType, ExchangeApiError>> = {};
    exchangeApiKeys.forEach(({ exchange }, index) => {
      const query = queries[index];
      if (query?.error) {
        errorMap[exchange] = query.error instanceof ExchangeApiError
          ? query.error
          : new ExchangeApiError(
              query.error instanceof Error ? query.error.message : String(query.error),
              'UNKNOWN_ERROR',
              exchange as ExchangeType,
            );
      }
    });
    return errorMap;
  }, [exchangeApiKeys, queries]);

  const refetchAll = useCallback(() => {
    for (const exchange of FUTURES_API_EXCHANGES) {
      queryClient.invalidateQueries({ queryKey: futuresQueryKeys.positions(exchange) });
    }
  }, [queryClient]);

  return {
    positions,
    isLoading,
    hasRegisteredExchanges: exchangeApiKeys.length > 0,
    errors,
    refetchAll,
  };
}

// ===== useFuturesOpenOrders =====

/** useFuturesOpenOrders 반환 타입 */
export interface UseFuturesOpenOrdersReturn {
  /** 전체 거래소의 오픈 오더 목록 */
  openOrders: FuturesOpenOrder[];
  /** 로딩 중 여부 */
  isLoading: boolean;
  /** API Key가 등록된 선물 거래소가 있는지 여부 */
  hasRegisteredExchanges: boolean;
  /** 거래소별 에러 맵 */
  errors: Partial<Record<FuturesExchangeType, ExchangeApiError>>;
  /** 전체 거래소 새로고침 */
  refetchAll: () => void;
}

/**
 * 선물 오픈 오더를 조회하는 React Query 훅
 *
 * 등록된 모든 선물 거래소(Binance, Gate.io, Bitget)에 대해 병렬로
 * 오픈 오더를 조회하고 통합된 결과를 반환한다.
 * 30초 간격으로 자동 갱신된다.
 *
 * @returns 통합 오픈 오더 목록, 로딩 상태, 에러 맵, 새로고침 함수
 */
export function useFuturesOpenOrders(): UseFuturesOpenOrdersReturn {
  const { address } = useAccount();
  const walletAddress = address ?? '';
  const queryClient = useQueryClient();

  // 각 선물 거래소에 대해 API Key가 있는지 확인하여 활성화할 거래소 결정
  const exchangeApiKeys = useMemo(() => {
    if (!walletAddress) return [];

    return FUTURES_API_EXCHANGES
      .map((exchange) => {
        const apiKey = decryptApiKeyForExchange(walletAddress, exchange as ExchangeType);
        return apiKey ? { exchange, apiKey } : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [walletAddress]);

  const queries = useQueries({
    queries: exchangeApiKeys.map(({ exchange, apiKey }) => ({
      queryKey: futuresQueryKeys.openOrders(exchange),
      queryFn: async (): Promise<FuturesOpenOrdersResponse> => {
        const signedRequest = signFuturesOpenOrdersRequest(exchange as ExchangeType, apiKey);
        if (!signedRequest) {
          throw new ExchangeApiError(
            '서명을 생성할 수 없습니다.',
            'SIGN_FAILED',
            exchange as ExchangeType,
          );
        }
        return fetchFuturesOpenOrders(exchange, signedRequest);
      },
      enabled: !!walletAddress,
      refetchInterval: FUTURES_REFETCH_INTERVAL,
      refetchOnWindowFocus: true,
      placeholderData: (previousData: FuturesOpenOrdersResponse | undefined) => previousData,
      retry: 2,
      retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 4000),
      staleTime: 10_000,
    })),
  });

  // 결과 집계
  const openOrders = useMemo(() => {
    const allOrders: FuturesOpenOrder[] = [];
    for (const query of queries) {
      if (query.data?.openOrders) {
        allOrders.push(...query.data.openOrders);
      }
    }
    return allOrders;
  }, [queries]);

  const isLoading = queries.some((q) => q.isLoading);

  const errors = useMemo(() => {
    const errorMap: Partial<Record<FuturesExchangeType, ExchangeApiError>> = {};
    exchangeApiKeys.forEach(({ exchange }, index) => {
      const query = queries[index];
      if (query?.error) {
        errorMap[exchange] = query.error instanceof ExchangeApiError
          ? query.error
          : new ExchangeApiError(
              query.error instanceof Error ? query.error.message : String(query.error),
              'UNKNOWN_ERROR',
              exchange as ExchangeType,
            );
      }
    });
    return errorMap;
  }, [exchangeApiKeys, queries]);

  const refetchAll = useCallback(() => {
    for (const exchange of FUTURES_API_EXCHANGES) {
      queryClient.invalidateQueries({ queryKey: futuresQueryKeys.openOrders(exchange) });
    }
  }, [queryClient]);

  return {
    openOrders,
    isLoading,
    hasRegisteredExchanges: exchangeApiKeys.length > 0,
    errors,
    refetchAll,
  };
}
