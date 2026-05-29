'use client';

import { useQuery } from '@tanstack/react-query';

const SUPPORTED_COINS = ['BTC', 'ETH'];

export function useBasis(symbol: string, period: string) {
  return useQuery({
    queryKey: ['phase2', 'basis', symbol, period],
    queryFn: async () => {
      const res = await fetch(`/api/futures-dashboard/basis?symbol=${encodeURIComponent(symbol)}&period=${encodeURIComponent(period)}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const json = await res.json();
      // NestJS TransformInterceptor가 { success, data, timestamp }으로 감쌈 → data만 추출
      return json?.data ?? json;
    },
    enabled: SUPPORTED_COINS.includes(symbol), // BTC/ETH만 호출
    staleTime: 60_000,
    refetchInterval: 300_000,
    retry: 1,
    placeholderData: (prev: unknown) => prev,
  });
}
