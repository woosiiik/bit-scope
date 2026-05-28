'use client';

import { useQuery } from '@tanstack/react-query';

export function useBasis(symbol: string, period: string) {
  return useQuery({
    queryKey: ['phase2', 'basis', symbol, period],
    queryFn: async () => {
      const res = await fetch(`/api/futures-dashboard/basis?symbol=${symbol}&period=${period}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 300_000,
    retry: 1,
    placeholderData: (prev: unknown) => prev,
  });
}
