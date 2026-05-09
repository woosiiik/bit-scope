/**
 * 인플루언서 위젯
 *
 * 유튜브 크립토 인플루언서의 최신 영상을 컴팩트하게 표시한다.
 */

'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { useTickerNews, getSourceDisplayName } from '@/hooks/useNews';
import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/api-url';
import type { NewsArticle } from '@/hooks/useNews';

function timeAgo(dateStr: string): string {
  const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return `${Math.floor(diffHour / 24)}일 전`;
}

export function InfluencerWidget() {
  const { data: videos, isLoading } = useQuery<NewsArticle[]>({
    queryKey: ['news', 'influencer-widget'],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/news?limit=6&sourceType=youtube`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return [];
      const json = await res.json();
      const inner = json.data?.data ? json.data : json;
      return inner.data ?? [];
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  return (
    <div className="flex flex-col h-full p-3 overflow-auto">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Influencer
        </h3>
        <Link href="/influencer" className="text-[10px] text-primary hover:underline">
          전체보기
        </Link>
      </div>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground">로딩 중...</p>
        </div>
      )}

      {!isLoading && (!videos || videos.length === 0) && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground">수집된 영상이 없습니다</p>
        </div>
      )}

      {videos && videos.length > 0 && (
        <div className="space-y-2.5 flex-1">
          {videos.slice(0, 5).map((item) => (
            <a
              key={item.id}
              href={item.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-2 group"
            >
              {/* 썸네일 */}
              {item.thumbnailUrl && (
                <div className="relative w-20 shrink-0">
                  <img
                    src={item.thumbnailUrl}
                    alt=""
                    className="w-full rounded aspect-video object-cover"
                    loading="lazy"
                  />
                  <div className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-[8px] px-1 rounded">
                    ▶
                  </div>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                  {item.titleKo ?? item.titleEn}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-red-500">{getSourceDisplayName(item.source)}</span>
                  <span className="text-[10px] text-muted-foreground">{timeAgo(item.publishedAt)}</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
