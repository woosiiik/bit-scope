/**
 * 뉴스 티커 컴포넌트
 *
 * 대시보드 상단에 최신 뉴스 헤드라인을 흐르는 텍스트로 표시한다.
 * 마우스 호버 시 애니메이션이 일시 정지되며, 클릭 시 뉴스 페이지로 이동한다.
 */

'use client';

import Link from 'next/link';
import { Newspaper } from 'lucide-react';

import { useTickerNews, getSourceDisplayName } from '@/hooks/useNews';

/**
 * 발행 시간을 상대적 시간으로 표시한다 (예: "3시간 전")
 */
function timeAgo(dateStr: string): string {
  const now = Date.now();
  const published = new Date(dateStr).getTime();
  const diffMin = Math.floor((now - published) / 60_000);

  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}일 전`;
}

export function NewsTicker() {
  const { data: news } = useTickerNews();

  if (!news?.length) return null;

  // 뉴스를 2번 반복하여 끊김 없는 무한 스크롤 효과
  const tickerItems = [...news, ...news];

  return (
    <Link href="/news" className="block">
      <div className="group relative overflow-hidden rounded-lg border border-border bg-card px-3 py-2 hover:border-primary/50 transition-colors">
        <div className="flex items-center gap-2">
          <Newspaper className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="overflow-hidden flex-1">
            <div className="flex gap-8 animate-marquee group-hover:[animation-play-state:paused] whitespace-nowrap">
              {tickerItems.map((item, i) => (
                <span key={`${item.id}-${i}`} className="inline-flex items-center gap-2 text-sm">
                  <span className="text-[10px] font-medium text-primary/70">
                    {getSourceDisplayName(item.source)}
                  </span>
                  <span className="text-foreground">
                    {item.titleKo ?? item.titleEn}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {timeAgo(item.publishedAt)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
