'use client';

import { useQuery } from '@tanstack/react-query';
import type { MarketScreenerResponse } from '@bitscope/shared';

export function useMarketScreenerTickers() {
  return useQuery<MarketScreenerResponse>({
    queryKey: ['market-screener', 'tickers'],
    queryFn: async () => {
      const res = await fetch('/api/market-screener/tickers', {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    placeholderData: (prev) => prev,
  });
}
