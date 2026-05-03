/**
 * 김치 프리미엄 데이터 훅 (useKimchiPremium)
 *
 * NestJS 백엔드의 프리미엄 API를 통해 국내 거래소 vs 바이낸스 시세 차이(김치 프리미엄)
 * 데이터를 실시간으로 조회하고 관리한다.
 *
 * 주요 기능:
 * - 주요 코인의 실시간 프리미엄 목록 조회 (국내 거래소 선택 가능)
 * - 특정 코인의 프리미엄 이력 조회 (24시간/7일/30일)
 * - price-store의 실시간 가격 데이터를 보조적으로 활용
 *
 * @see 요구사항 3.1 (거래소 간 실시간 시세 비교 테이블)
 * @see 요구사항 3.2 (가격 차이 절대값, 백분율 계산)
 * @see 요구사항 3.4 (실시간 시세 업데이트)
 * @see 요구사항 3.5 (해외 거래소 김치 프리미엄)
 * @see 요구사항 3.6 (김프 추이 차트 24시간/7일/30일)
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import type { ExchangeType, KimchiPremiumData, KimchiPremiumHistory } from '@bitscope/shared';

// ===== 상수 =====

/**
 * NestJS 백엔드 API 기본 URL
 *
 * 환경 변수를 통해 설정 가능하며, 기본값은 같은 호스트의 port 4000이다.
 */
function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return (
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      `${window.location.protocol}//${window.location.hostname}:4000`
    );
  }
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
}

/** 프리미엄 API 경로 */
const PREMIUM_API_PATH = '/premium';

/** 자동 갱신 간격 (밀리초) - 5초 간격으로 실시간 업데이트 */
const PREMIUM_REFETCH_INTERVAL_MS = 5_000;

/** 이력 조회 자동 갱신 간격 (밀리초) - 1분 */
const HISTORY_REFETCH_INTERVAL_MS = 60_000;

/** 프리미엄 이력 조회 기간 타입 */
export type PremiumHistoryPeriod = '24h' | '7d' | '30d';

// ===== 쿼리 키 팩토리 =====

/**
 * 프리미엄 관련 TanStack Query 키를 생성하는 팩토리
 */
export const premiumQueryKeys = {
  /** 모든 프리미엄 쿼리의 최상위 키 */
  all: ['premium'] as const,

  /** 실시간 프리미엄 목록 쿼리 키 */
  topPremiums: (limit?: number, exchange?: ExchangeType) =>
    ['premium', 'top', limit ?? 20, exchange ?? 'upbit'] as const,

  /** 특정 코인의 실시간 프리미엄 쿼리 키 */
  premium: (symbol: string, exchange?: ExchangeType) =>
    ['premium', 'current', symbol, exchange ?? 'upbit'] as const,

  /** 프리미엄 이력 쿼리 키 */
  history: (symbol: string, period: PremiumHistoryPeriod, exchange?: ExchangeType) =>
    ['premium', 'history', symbol, period, exchange ?? 'upbit'] as const,
} as const;

// ===== API 호출 함수 =====

/**
 * 프리미엄 상위 목록을 조회한다.
 *
 * @param limit 조회할 최대 코인 수
 * @param exchange 비교 기준 국내 거래소 (기본: upbit)
 * @returns 프리미엄 비율 기준 내림차순 정렬된 데이터 배열
 */
async function fetchTopPremiums(
  limit: number,
  exchange: ExchangeType = 'upbit',
): Promise<KimchiPremiumData[]> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${PREMIUM_API_PATH}?limit=${limit}&exchange=${exchange}`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`프리미엄 목록 조회 실패: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  // NestJS TransformInterceptor가 { success, data, timestamp }로 래핑
  return json.data ?? json;
}

/**
 * 특정 코인의 현재 프리미엄을 조회한다.
 *
 * @param symbol 코인 심볼
 * @param exchange 비교 기준 국내 거래소 (기본: upbit)
 * @returns 김치 프리미엄 데이터 또는 null
 */
async function fetchPremium(
  symbol: string,
  exchange: ExchangeType = 'upbit',
): Promise<KimchiPremiumData | null> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${PREMIUM_API_PATH}/${symbol}?exchange=${exchange}`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`프리미엄 조회 실패: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  return json.data ?? json;
}

/**
 * 특정 코인의 프리미엄 이력을 조회한다.
 *
 * @param symbol 코인 심볼
 * @param period 조회 기간 ('24h', '7d', '30d')
 * @param exchange 비교 기준 국내 거래소 (기본: upbit)
 * @returns 프리미엄 이력 배열
 */
async function fetchPremiumHistory(
  symbol: string,
  period: PremiumHistoryPeriod,
  exchange: ExchangeType = 'upbit',
): Promise<KimchiPremiumHistory[]> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${PREMIUM_API_PATH}/${symbol}/history?period=${period}&exchange=${exchange}`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(
      `프리미엄 이력 조회 실패: ${res.status} ${res.statusText}`,
    );
  }

  const json = await res.json();
  // NestJS TransformInterceptor가 { success, data, timestamp }로 래핑
  const data = json.data ?? json;

  // recordedAt 문자열을 Date 객체로 변환
  return (Array.isArray(data) ? data : []).map((item: KimchiPremiumHistory & { recordedAt: string }) => ({
    ...item,
    recordedAt: new Date(item.recordedAt),
  }));
}

// ===== 훅: 프리미엄 상위 목록 =====

/** useTopPremiums 옵션 */
export interface UseTopPremiumsOptions {
  /** 조회할 최대 코인 수 (기본: 20) */
  limit?: number;
  /** 비교 기준 국내 거래소 (기본: upbit) */
  exchange?: ExchangeType;
  /** 자동 갱신 활성화 여부 (기본: true) */
  enabled?: boolean;
  /** 자동 갱신 간격 (밀리초, 기본: 5_000) */
  refetchInterval?: number;
}

/**
 * 프리미엄 상위 목록을 실시간으로 조회하는 React Query 훅
 *
 * NestJS 프리미엄 API를 통해 프리미엄 비율이 높은 코인 목록을 조회한다.
 * 기본 5초 간격으로 자동 갱신되어 실시간에 가까운 데이터를 제공한다.
 *
 * @param options 훅 옵션
 * @returns TanStack Query 결과 (data, isLoading, error 등)
 */
export function useTopPremiums(options: UseTopPremiumsOptions = {}) {
  const {
    limit = 20,
    exchange = 'upbit',
    enabled = true,
    refetchInterval = PREMIUM_REFETCH_INTERVAL_MS,
  } = options;

  return useQuery<KimchiPremiumData[]>({
    queryKey: premiumQueryKeys.topPremiums(limit, exchange),
    queryFn: () => fetchTopPremiums(limit, exchange),
    enabled,
    refetchInterval,
    staleTime: 3_000,
    retry: 2,
  });
}

// ===== 훅: 특정 코인 프리미엄 =====

/** usePremium 옵션 */
export interface UsePremiumOptions {
  /** 코인 심볼 */
  symbol: string;
  /** 비교 기준 국내 거래소 (기본: upbit) */
  exchange?: ExchangeType;
  /** 활성화 여부 (기본: true) */
  enabled?: boolean;
  /** 자동 갱신 간격 (밀리초, 기본: 5_000) */
  refetchInterval?: number;
}

/**
 * 특정 코인의 현재 프리미엄을 실시간으로 조회하는 React Query 훅
 *
 * @param options 훅 옵션
 * @returns TanStack Query 결과
 */
export function usePremium(options: UsePremiumOptions) {
  const {
    symbol,
    exchange = 'upbit',
    enabled = true,
    refetchInterval = PREMIUM_REFETCH_INTERVAL_MS,
  } = options;

  return useQuery<KimchiPremiumData | null>({
    queryKey: premiumQueryKeys.premium(symbol, exchange),
    queryFn: () => fetchPremium(symbol, exchange),
    enabled: enabled && !!symbol,
    refetchInterval,
    staleTime: 3_000,
    retry: 2,
  });
}

// ===== 훅: 프리미엄 이력 =====

/** usePremiumHistory 옵션 */
export interface UsePremiumHistoryOptions {
  /** 코인 심볼 */
  symbol: string;
  /** 조회 기간 */
  period: PremiumHistoryPeriod;
  /** 비교 기준 국내 거래소 (기본: upbit) */
  exchange?: ExchangeType;
  /** 활성화 여부 (기본: true) */
  enabled?: boolean;
}

/**
 * 특정 코인의 프리미엄 이력을 조회하는 React Query 훅
 *
 * 24시간/7일/30일 기간의 김치 프리미엄 추이를 DB에서 조회한다.
 * 1분 간격으로 자동 갱신되어 차트에 최신 데이터를 반영한다.
 *
 * @param options 훅 옵션
 * @returns TanStack Query 결과
 *
 * @see 요구사항 3.6 (김프 추이 차트 24시간/7일/30일)
 */
export function usePremiumHistory(options: UsePremiumHistoryOptions) {
  const { symbol, period, exchange = 'upbit', enabled = true } = options;

  return useQuery<KimchiPremiumHistory[]>({
    queryKey: premiumQueryKeys.history(symbol, period, exchange),
    queryFn: () => fetchPremiumHistory(symbol, period, exchange),
    enabled: enabled && !!symbol,
    refetchInterval: HISTORY_REFETCH_INTERVAL_MS,
    staleTime: 30_000,
    retry: 2,
  });
}
