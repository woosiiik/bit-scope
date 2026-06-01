/**
 * 주식·선물 비교 데이터 TanStack Query 훅
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import type { ComparisonRange, ComparisonResponse } from '@bitscope/shared';

interface UseStockPerpComparisonOptions {
  enabled?: boolean;
}

export function useStockPerpComparison(
  pair: string,
  range: ComparisonRange,
  options?: UseStockPerpComparisonOptions,
) {
  return useQuery<ComparisonResponse>({
    queryKey: ['stock-perp-comparison', pair, range],
    queryFn: async () => {
      const params = new URLSearchParams({ pair, range });

      const res = await fetch(`/api/stock-perp-comparison?${params}`, {
        signal: AbortSignal.timeout(15_000),
      });

      const json = await res.json();

      // Route Handler는 실패 시 { success: false, error: { message, code } } 형태로 응답한다.
      if (!res.ok || json?.success === false) {
        const message =
          json?.error?.message ?? `Failed to fetch stock-perp-comparison: ${res.status}`;
        throw new Error(message);
      }

      return json as ComparisonResponse;
    },
    enabled: options?.enabled !== false && !!pair,
    staleTime: getStaleTime(range),
    refetchInterval: false,
    refetchOnWindowFocus: true,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    // 페어/범위 전환 시 깜빡임 방지(R1.5).
    placeholderData: (prev) => prev,
  });
}

function getStaleTime(range: ComparisonRange): number {
  if (range === '1d' || range === '5d') return 60_000;
  return 600_000;
}
