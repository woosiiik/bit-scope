'use client';

import { useQuery } from '@tanstack/react-query';
import type { KlineChangesResponse, ChartPeriod } from '@bitscope/shared';

export function useKlineChanges(period: ChartPeriod) {
  return useQuery<KlineChangesResponse>({
    queryKey: ['market-screener', 'kline-changes', period],
    queryFn: async () => {
      const res = await fetch(`/api/market-screener/kline-changes?period=${period}`, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      return res.json();
    },
    enabled: period !== '1d', // 1d는 tickers 데이터 사용
    staleTime: 300_000, // 5분
    retry: 1,
  });
}
