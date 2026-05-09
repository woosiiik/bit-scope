/**
 * 크립토 뉴스 페이지
 *
 * CoinDesk, CoinTelegraph, The Block에서 수집한 뉴스를
 * 한글 요약과 영어 원문으로 표시한다.
 * 커서 기반 페이지네이션으로 "더보기" 기능을 제공한다.
 */

'use client';

import { ExternalLink, Newspaper, Loader2 } from 'lucide-react';

import { useNewsList, getSourceDisplayName, type NewsArticle } from '@/hooks/useNews';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/**
 * 발행 시간을 한국어 상대 시간으로 표시한다
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

/**
 * 발행 시간을 날짜 형식으로 표시한다
 */
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 소스별 뱃지 색상 */
function getSourceColor(source: string): string {
  switch (source) {
    case 'coindesk': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    case 'cointelegraph': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 'theblock': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
    case 'blockmedia': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
    default: return '';
  }
}

/**
 * 뉴스 카드 컴포넌트
 */
function NewsCard({ article }: { article: NewsArticle }) {
  return (
    <Card className="hover:border-primary/30 transition-colors">
      <CardContent className="p-4 space-y-3">
        {/* 상단: 소스 + 시간 */}
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className={`text-[10px] ${getSourceColor(article.source)}`}>
            {getSourceDisplayName(article.source)}
          </Badge>
          <span className="text-xs text-muted-foreground" title={formatDate(article.publishedAt)}>
            {timeAgo(article.publishedAt)}
          </span>
        </div>

        {/* 한글 제목 */}
        <h3 className="text-sm font-semibold text-foreground leading-snug">
          {article.titleKo ?? article.titleEn}
        </h3>

        {/* 한글 요약 */}
        {article.summaryKo && (
          <p className="text-sm text-foreground/80 leading-relaxed">
            {article.summaryKo}
          </p>
        )}

        {/* 영어 원문 제목 */}
        <p className="text-xs text-muted-foreground italic">
          {article.titleEn}
        </p>

        {/* 원문 링크 */}
        <a
          href={article.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
          원문 보기
        </a>
      </CardContent>
    </Card>
  );
}

export default function NewsPage() {
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useNewsList();

  const articles = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <Newspaper className="h-5 w-5 text-primary" aria-hidden="true" />
        <h1 className="text-lg font-semibold text-foreground">Crypto News</h1>
        <span className="text-xs text-muted-foreground">
          CoinDesk / CoinTelegraph / The Block / 블록미디어
        </span>
      </div>

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
            <p className="text-sm text-destructive">{error.message}</p>
          </CardContent>
        </Card>
      )}

      {/* 뉴스 목록 */}
      {!isLoading && articles.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Newspaper className="h-12 w-12 text-muted-foreground/50" aria-hidden="true" />
            <p className="mt-4 text-sm text-muted-foreground">
              아직 수집된 뉴스가 없습니다. 잠시 후 다시 확인해주세요.
            </p>
          </CardContent>
        </Card>
      )}

      {articles.length > 0 && (
        <div className="space-y-3">
          {articles.map((article) => (
            <NewsCard key={article.id} article={article} />
          ))}
        </div>
      )}

      {/* 더보기 버튼 */}
      {hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
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
