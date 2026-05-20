/**
 * 새 속보 존재 여부를 주기적으로 확인하는 훅
 *
 * 30초 간격으로 GET /news/breaking/count?since={lastCheckedAt}를 호출하여
 * 새 속보 건수를 반환한다.
 */

'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/api-url';

export function useBreakingNewsPolling(enabled: boolean = true) {
  const [lastCheckedAt, setLastCheckedAt] = useState(() => new Date().toISOString());

  const { data } = useQuery<{ count: number }>({
    queryKey: ['breaking-news', 'count', lastCheckedAt],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(
        `${baseUrl}/news/breaking/count?since=${encodeURIComponent(lastCheckedAt)}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) return { count: 0 };
      const json = await res.json();
      const inner = json.data?.data ? json.data : json;
      return { count: inner.data?.count ?? 0 };
    },
    enabled,
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  });

  const newCount = data?.count ?? 0;

  const clearNewCount = useCallback(() => {
    setLastCheckedAt(new Date().toISOString());
  }, []);

  return { newCount, clearNewCount, lastCheckedAt };
}
