/**
 * 뉴스/속보 위젯
 *
 * 최신 뉴스를 컴팩트한 목록으로 표시한다.
 */

'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { useTickerNews, getSourceDisplayName } from '@/hooks/useNews';

function timeAgo(dateStr: string): string {
  const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return `${Math.floor(diffHour / 24)}일 전`;
}

export function NewsWidget() {
  const { data: news, isLoading } = useTickerNews();

  return (
    <div className="flex flex-col h-full p-3 overflow-auto">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          News
        </h3>
        <Link href="/news" className="text-[10px] text-primary hover:underline">
          전체보기
        </Link>
      </div>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground">로딩 중...</p>
        </div>
      )}

      {!isLoading && (!news || news.length === 0) && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground">수집된 뉴스가 없습니다</p>
        </div>
      )}

      {news && news.length > 0 && (
        <div className="space-y-2 flex-1">
          {news.slice(0, 8).map((item) => (
            <a
              key={item.id}
              href={item.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block group"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                    {item.titleKo ?? item.titleEn}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-primary/70">{getSourceDisplayName(item.source)}</span>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(item.publishedAt)}</span>
                  </div>
                </div>
                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/50 mt-0.5" />
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
