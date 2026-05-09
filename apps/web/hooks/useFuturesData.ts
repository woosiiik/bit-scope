/**
 * 선물 마켓 데이터 훅
 *
 * NestJS API에서 선물 지표를 조회한다.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import type { CachedFuturesData } from '@bitscope/shared';
import { getApiBaseUrl } from '@/lib/api-url';

/**
 * 특정 심볼의 선물 지표를 조회하는 훅
 */
export function useFuturesIndicators(symbol: string = 'BTCUSDT', enabled: boolean = true) {
  return useQuery<CachedFuturesData | null>({
    queryKey: ['futures', 'indicators', symbol],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/futures/indicators?symbol=${symbol}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      const json = await res.json();
      // NestJS 글로벌 인터셉터 이중 래핑 처리
      const inner = json.data?.data?.symbol ? json.data.data : json.data?.symbol ? json.data : null;
      return inner;
    },
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 2,
  });
}

/**
 * 지원하는 선물 심볼 목록을 조회하는 훅
 */
export function useFuturesSymbols() {
  return useQuery<string[]>({
    queryKey: ['futures', 'symbols'],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/futures/symbols`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return [];
      const json = await res.json();
      return json.data?.data ?? json.data ?? [];
    },
    staleTime: 300_000,
  });
}
