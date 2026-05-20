/**
 * 뉴스속보 위젯 (크립토 데스크용)
 */

'use client';

import Link from 'next/link';
import { Zap } from 'lucide-react';
import { getSourceDisplayName } from '@/hooks/useNews';
import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/api-url';
import type { NewsArticle } from '@/hooks/useNews';
import { useTranslation } from '@/lib/i18n/i18n-context';

function timeAgo(dateStr: string): string {
  const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return `${Math.floor(diffHour / 24)}일 전`;
}

export function BreakingNewsWidget() {
  const { t } = useTranslation();

  const { data: messages, isLoading } = useQuery<NewsArticle[]>({
    queryKey: ['news', 'breaking-widget'],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/news?limit=8&sourceType=breaking`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return [];
      const json = await res.json();
      const inner = json.data?.data ? json.data : json;
      return inner.data ?? [];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return (
    <div className="flex flex-col h-full p-3 overflow-auto">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Zap className="h-3 w-3 text-yellow-500" />
          {t.breakingNews.title}
        </h3>
        <Link href="/breaking-news" className="text-[10px] text-primary hover:underline">
          {t.breakingNews.viewAll}
        </Link>
      </div>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground">로딩 중...</p>
        </div>
      )}

      {!isLoading && (!messages || messages.length === 0) && (
        <div className="flex-1 flex flex-col items-center justify-center gap-1">
          <Zap className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-[10px] text-muted-foreground">{t.breakingNews.emptyState}</p>
        </div>
      )}

      {messages && messages.length > 0 && (
        <div className="space-y-2 flex-1">
          {messages.slice(0, 6).map((item) => (
            <a
              key={item.id}
              href={item.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block group"
            >
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Zap className="h-2.5 w-2.5 text-yellow-500" />
                  <span className="text-[10px] text-yellow-600 dark:text-yellow-400">
                    {getSourceDisplayName(item.source)}
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {timeAgo(item.publishedAt)}
                  </span>
                </div>
                <p className="text-xs text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                  {item.titleKo ?? item.titleEn}
                </p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
