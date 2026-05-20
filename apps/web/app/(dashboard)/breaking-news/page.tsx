/**
 * 뉴스속보 페이지
 *
 * @Coin24Live 등 속보 소스에서 수집한 최신 속보를 실시간으로 표시한다.
 * 30초 간격 polling으로 새 속보 알림 배너를 제공한다.
 */

'use client';

import { useRef, useCallback } from 'react';
import { ExternalLink, Zap, Loader2 } from 'lucide-react';

import { useNewsList, getSourceDisplayName, type NewsArticle } from '@/hooks/useNews';
import { useBreakingNewsPolling } from '@/hooks/useBreakingNewsPolling';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

function timeAgo(dateStr: string): string {
  const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return `${Math.floor(diffHour / 24)}일 전`;
}

function BreakingNewsCard({ article }: { article: NewsArticle }) {
  const { t } = useTranslation();

  return (
    <Card className="hover:border-yellow-500/30 transition-colors">
      <CardContent className="p-4 space-y-2">
        {/* 소스명 + 시간 */}
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-[10px] bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Zap className="h-2.5 w-2.5 mr-1" />
            {getSourceDisplayName(article.source)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {timeAgo(article.publishedAt)}
          </span>
        </div>

        {/* 속보 내용 */}
        <h3 className="text-sm font-semibold text-foreground leading-snug">
          {article.titleKo ?? article.titleEn}
        </h3>

        {/* 본문 (제목과 다른 경우에만 표시) */}
        {article.contentEn && article.contentEn !== article.titleEn && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
            {article.contentEn}
          </p>
        )}

        {/* 원문 링크 */}
        <a
          href={article.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          {t.breakingNews.viewOriginal}
        </a>
      </CardContent>
    </Card>
  );
}

export default function BreakingNewsPage() {
  const { t } = useTranslation();
  const listTopRef = useRef<HTMLDivElement>(null);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    error,
  } = useNewsList('breaking');

  const { newCount, clearNewCount } = useBreakingNewsPolling(true);

  const articles = data?.pages.flatMap((page) => page.items) ?? [];

  const handleNewAlertClick = useCallback(() => {
    clearNewCount();
    refetch();
    listTopRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [clearNewCount, refetch]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 헤더 */}
      <div className="flex items-center gap-2" ref={listTopRef}>
        <Zap className="h-5 w-5 text-yellow-500" />
        <h1 className="text-lg font-semibold text-foreground">
          {t.breakingNews.title}
        </h1>
        <span className="text-xs text-muted-foreground">Coin24Live</span>
      </div>

      {/* 새 속보 알림 배너 */}
      {newCount > 0 && (
        <button
          type="button"
          className="w-full rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 px-4 py-2.5 text-sm font-medium text-yellow-800 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors"
          onClick={handleNewAlertClick}
        >
          <Zap className="inline h-4 w-4 mr-1.5 -mt-0.5" />
          {t.breakingNews.newAlertBanner(newCount)}
        </button>
      )}

      {/* 로딩 */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* 에러 */}
      {error && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-destructive">{t.breakingNews.loadingError}</p>
          </CardContent>
        </Card>
      )}

      {/* 빈 상태 */}
      {!isLoading && articles.length === 0 && !error && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Zap className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-sm text-muted-foreground">
              {t.breakingNews.emptyState}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 속보 카드 리스트 */}
      {articles.length > 0 && (
        <div className="space-y-3">
          {articles.map((article) => (
            <BreakingNewsCard key={article.id} article={article} />
          ))}
        </div>
      )}

      {/* 더보기 */}
      {hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                로딩 중...
              </>
            ) : (
              '더보기'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
