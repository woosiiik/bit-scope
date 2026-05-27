'use client';

import { useQuery } from '@tanstack/react-query';
import type { NewListingsResponse } from '@bitscope/shared';

export function useNewListings() {
  return useQuery<NewListingsResponse>({
    queryKey: ['market-screener', 'new-listings'],
    queryFn: async () => {
      const res = await fetch('/api/market-screener/new-listings', {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      return res.json();
    },
    staleTime: 600_000, // 10분
    retry: 1,
  });
}
