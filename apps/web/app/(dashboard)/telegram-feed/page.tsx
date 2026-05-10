/**
 * 텔레그램 채널 피드 페이지
 *
 * 주요 크립토 텔레그램 채널의 메시지를 한글 요약과 함께 표시한다.
 */

'use client';

import { ExternalLink, Send, Loader2 } from 'lucide-react';

import { useNewsList, getSourceDisplayName, type NewsArticle } from '@/hooks/useNews';
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

function TelegramCard({ article }: { article: NewsArticle }) {
  return (
    <Card className="hover:border-primary/30 transition-colors">
      <CardContent className="p-4 space-y-2">
        {/* 채널명 + 시간 */}
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-[10px] bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400">
            <Send className="h-2.5 w-2.5 mr-1" />
            {getSourceDisplayName(article.source)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {timeAgo(article.publishedAt)}
          </span>
        </div>

        {/* 한글 요약 또는 제목 */}
        <h3 className="text-sm font-semibold text-foreground leading-snug">
          {article.titleKo ?? article.titleEn}
        </h3>

        {/* 요약 본문 */}
        {article.summaryKo && (
          <p className="text-sm text-foreground/80 leading-relaxed">
            {article.summaryKo}
          </p>
        )}

        {/* 원문 (요약이 없으면 전체 텍스트) */}
        {!article.summaryKo && article.contentEn && (
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
          텔레그램에서 보기
        </a>
      </CardContent>
    </Card>
  );
}

export default function TelegramFeedPage() {
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useNewsList('telegram');

  const articles = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <Send className="h-5 w-5 text-sky-500" />
        <h1 className="text-lg font-semibold text-foreground">Telegram Feed</h1>
        <span className="text-xs text-muted-foreground">
          Wu Blockchain / CryptoQuant
        </span>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-destructive">{error.message}</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && articles.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Send className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-sm text-muted-foreground">
              아직 수집된 메시지가 없습니다. 잠시 후 다시 확인해주세요.
            </p>
          </CardContent>
        </Card>
      )}

      {articles.length > 0 && (
        <div className="space-y-3">
          {articles.map((article) => (
            <TelegramCard key={article.id} article={article} />
          ))}
        </div>
      )}

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
