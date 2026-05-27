/**
 * 멀티 거래소 지표 데이터 TanStack Query 훅
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import type { FuturesDashboardIndicator, Period, MultiExchangeResponse } from '@bitscope/shared';
import { SNAPSHOT_INDICATORS, KLINE_INDICATORS } from '@bitscope/shared';

interface UseMultiExchangeIndicatorOptions {
  period?: Period;
  enabled?: boolean;
}

export function useMultiExchangeIndicator<T = unknown>(
  indicator: FuturesDashboardIndicator,
  coin: string,
  options?: UseMultiExchangeIndicatorOptions,
) {
  const staleTime = getStaleTime(indicator);

  return useQuery<MultiExchangeResponse<T>>({
    queryKey: ['futures-dashboard', indicator, coin, options?.period],
    queryFn: async () => {
      const params = new URLSearchParams({ coin });
      if (options?.period) params.set('period', options.period);

      const res = await fetch(`/api/futures-dashboard/${indicator}?${params}`, {
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch ${indicator}: ${res.status}`);
      }

      return res.json();
    },
    enabled: options?.enabled !== false && !!coin,
    staleTime,
    refetchInterval: getRefetchInterval(indicator),
    refetchOnWindowFocus: true,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    placeholderData: (prev) => prev,
  });
}

function getStaleTime(indicator: FuturesDashboardIndicator): number {
  if (SNAPSHOT_INDICATORS.includes(indicator)) return 30_000;
  if (KLINE_INDICATORS.includes(indicator)) return 600_000;
  return 300_000;
}

function getRefetchInterval(indicator: FuturesDashboardIndicator): number | false {
  if (SNAPSHOT_INDICATORS.includes(indicator)) return 30_000;
  return false; // 히스토리/Kline 지표는 자동 갱신 안 함
}
