/**
 * 뉴스 피드 훅
 *
 * NestJS 뉴스 API를 호출하여 티커 뉴스와 뉴스 목록을 조회한다.
 */

'use client';

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';

import { getApiBaseUrl } from '@/lib/api-url';

/** 뉴스 기사 응답 타입 */
export interface NewsArticle {
  id: string;
  source: string;
  titleEn: string;
  contentEn: string | null;
  titleKo: string | null;
  summaryKo: string | null;
  thumbnailUrl: string | null;
  originalUrl: string;
  publishedAt: string;
  summaryStatus: string;
  createdAt: string;
}

/** 뉴스 소스 표시명 매핑 */
const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  coindesk: 'CoinDesk',
  cointelegraph: 'CoinTelegraph',
  theblock: 'The Block',
  blockmedia: '블록미디어',
  'yt-coinbureau': 'Coin Bureau',
  'yt-benjamin-cowen': 'Benjamin Cowen',
  'yt-krown': 'Krown',
  'yt-hs-academy': '이효석아카데미',
  'yt-ohtaemin': '오태민',
  'tg-wu-blockchain': 'Wu Blockchain',
  'tg-cryptoquant': 'CryptoQuant',
};

/** 유튜브 소스인지 확인 */
export function isYouTubeSource(source: string): boolean {
  return source.startsWith('yt-');
}

export function isTelegramSource(source: string): boolean {
  return source.startsWith('tg-');
}

/** 소스 표시명을 반환한다 */
export function getSourceDisplayName(source: string): string {
  return SOURCE_DISPLAY_NAMES[source] ?? source;
}

/**
 * 티커용 최신 뉴스를 조회하는 훅
 */
export function useTickerNews(enabled: boolean = true) {
  return useQuery<NewsArticle[]>({
    queryKey: ['news', 'ticker'],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/news/ticker?limit=10`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error('뉴스 조회 실패');
      const json = await res.json();
      // NestJS 글로벌 인터셉터가 { success, data } 로 래핑할 수 있음
      const payload = json.data?.data ?? json.data ?? [];
      return Array.isArray(payload) ? payload : [];
    },
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 2,
  });
}

/**
 * 뉴스 목록을 커서 기반 무한 스크롤로 조회하는 훅
 */
export function useNewsList(sourceType?: 'news' | 'youtube' | 'telegram', enabled: boolean = true) {
  return useInfiniteQuery<{
    items: NewsArticle[];
    nextCursor: string | null;
  }>({
    queryKey: ['news', 'list', sourceType],
    queryFn: async ({ pageParam }) => {
      const baseUrl = getApiBaseUrl();
      const params = new URLSearchParams({ limit: '20' });
      if (pageParam) params.set('cursor', pageParam as string);
      if (sourceType) params.set('sourceType', sourceType);

      const res = await fetch(`${baseUrl}/news?${params}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error('뉴스 목록 조회 실패');
      const json = await res.json();
      // NestJS 글로벌 인터셉터가 { success, data } 로 래핑할 수 있음
      const inner = json.data?.data ? json.data : json;
      return {
        items: inner.data ?? [],
        nextCursor: inner.nextCursor ?? null,
      };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled,
    staleTime: 30_000,
    retry: 2,
  });
}
