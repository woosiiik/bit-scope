'use client';

import { useQuery } from '@tanstack/react-query';

export function useFundingHeatmap(period: string) {
  return useQuery({
    queryKey: ['phase2', 'funding-heatmap', period],
    queryFn: async () => {
      const res = await fetch(`/api/futures-dashboard/funding-heatmap?period=${period}`, {
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
