/**
 * 크립토 인플루언서 페이지
 *
 * 유튜브 크립토 인플루언서의 최신 영상을 표시한다.
 * 썸네일 + 제목 + AI 요약으로 구성된다.
 */

'use client';

import { ExternalLink, CirclePlay, Loader2 } from 'lucide-react';

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

function InfluencerCard({ article }: { article: NewsArticle }) {
  return (
    <Card className="hover:border-primary/30 transition-colors overflow-hidden">
      <a href={article.originalUrl} target="_blank" rel="noopener noreferrer" className="block">
        {/* 썸네일 */}
        {article.thumbnailUrl && (
          <div className="relative">
            <img
              src={article.thumbnailUrl}
              alt={article.titleEn}
              className="w-full object-cover aspect-video"
              loading="lazy"
            />
            <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
              ▶ YouTube
            </div>
          </div>
        )}
      </a>

      <CardContent className="p-3 space-y-2">
        {/* 채널명 + 시간 */}
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-[10px] bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            {getSourceDisplayName(article.source)}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {timeAgo(article.publishedAt)}
          </span>
        </div>

        {/* 제목 */}
        <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
          {article.titleKo ?? article.titleEn}
        </h3>

        {/* AI 요약 */}
        {article.summaryKo && (
          <p className="text-xs text-foreground/80 leading-relaxed line-clamp-3">
            {article.summaryKo}
          </p>
        )}

        {/* 영상 보기 링크 */}
        <a
          href={article.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
          영상 보기
        </a>
      </CardContent>
    </Card>
  );
}

export default function InfluencerPage() {
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useNewsList('youtube');

  const articles = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <CirclePlay className="h-5 w-5 text-red-500" aria-hidden="true" />
        <h1 className="text-lg font-semibold text-foreground">Crypto Influencers</h1>
        <span className="text-xs text-muted-foreground">
          Coin Bureau / Benjamin Cowen / Krown / 이효석아카데미 / 오태민
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

      {/* 빈 상태 */}
      {!isLoading && articles.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CirclePlay className="h-12 w-12 text-muted-foreground/50" aria-hidden="true" />
            <p className="mt-4 text-sm text-muted-foreground">
              아직 수집된 영상이 없습니다. 잠시 후 다시 확인해주세요.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 영상 그리드 */}
      {articles.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {articles.map((article) => (
            <InfluencerCard key={article.id} article={article} />
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
