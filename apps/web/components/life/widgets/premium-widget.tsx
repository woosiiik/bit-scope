/**
 * 김치 프리미엄 위젯
 *
 * 주요 코인의 김프 비율을 게이지 바와 함께 실시간으로 표시한다.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Flame } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/api-url';

interface PremiumData {
  symbol: string;
  premiumRate: number;
  domesticPrice: number;
  binanceKrwPrice: number;
}

/** 김프 비율에 따른 색상 */
function getPremiumColor(rate: number): string {
  if (rate >= 5) return 'text-red-500';
  if (rate >= 3) return 'text-orange-500';
  if (rate >= 1) return 'text-profit';
  if (rate >= 0) return 'text-muted-foreground';
  if (rate >= -2) return 'text-blue-400';
  return 'text-blue-600';
}

function getPremiumBgColor(rate: number): string {
  if (rate >= 5) return 'bg-red-500';
  if (rate >= 3) return 'bg-orange-500';
  if (rate >= 1) return 'bg-profit';
  if (rate >= 0) return 'bg-muted-foreground/50';
  if (rate >= -2) return 'bg-blue-400';
  return 'bg-blue-600';
}

function getPremiumLabel(rate: number): string {
  if (rate >= 5) return '매우 높음';
  if (rate >= 3) return '높음';
  if (rate >= 1) return '보통';
  if (rate >= 0) return '낮음';
  return '역프';
}

interface PremiumWidgetProps {
  exchange?: string;
}

export function PremiumWidget({ exchange = 'upbit' }: PremiumWidgetProps) {
  const { data: premiums, isLoading } = useQuery<PremiumData[]>({
    queryKey: ['premium', 'widget', exchange],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/premium?exchange=${exchange}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? json ?? [];
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  // 평균 김프
  const avgPremium = premiums && premiums.length > 0
    ? premiums.reduce((sum, p) => sum + p.premiumRate, 0) / premiums.length
    : 0;

  return (
    <div className="flex flex-col h-full p-3 overflow-auto">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Kimchi Premium
        </h3>
        <Link href="/premium" className="text-[10px] text-primary hover:underline">
          상세보기
        </Link>
      </div>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground">로딩 중...</p>
        </div>
      )}

      {!isLoading && (!premiums || premiums.length === 0) && (
        <div className="flex-1 flex items-center justify-center">
          <Flame className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground ml-2">김프 데이터 없음</p>
        </div>
      )}

      {premiums && premiums.length > 0 && (
        <>
          {/* 평균 김프 헤더 */}
          <div className="flex items-center gap-2 mb-3 rounded-lg bg-muted/50 px-3 py-2">
            <Flame className={cn('h-5 w-5 shrink-0', getPremiumColor(avgPremium))} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">평균 김프</span>
                <span className={cn('text-sm font-bold', getPremiumColor(avgPremium))}>
                  {avgPremium >= 0 ? '+' : ''}{avgPremium.toFixed(2)}%
                </span>
              </div>
              <span className={cn('text-[10px]', getPremiumColor(avgPremium))}>
                {getPremiumLabel(avgPremium)}
              </span>
            </div>
          </div>

          {/* 코인별 김프 */}
          <div className="space-y-2 flex-1">
            {premiums.slice(0, 8).map((item) => {
              const isPositive = item.premiumRate >= 0;
              // 게이지 바 폭: -10% ~ +10% 범위를 0~100%로 매핑
              const barWidth = Math.min(Math.max((item.premiumRate + 10) / 20 * 100, 2), 98);
              const centerPos = 50; // 0%의 위치

              return (
                <div key={item.symbol} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      {isPositive
                        ? <TrendingUp className={cn('h-3 w-3', getPremiumColor(item.premiumRate))} />
                        : <TrendingDown className={cn('h-3 w-3', getPremiumColor(item.premiumRate))} />
                      }
                      <span className="font-medium text-foreground">{item.symbol}</span>
                    </div>
                    <span className={cn('font-bold tabular-nums', getPremiumColor(item.premiumRate))}>
                      {isPositive ? '+' : ''}{item.premiumRate.toFixed(2)}%
                    </span>
                  </div>
                  {/* 게이지 바 (중앙이 0%) */}
                  <div className="relative h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="absolute top-0 h-full w-px bg-border"
                      style={{ left: `${centerPos}%` }}
                    />
                    <div
                      className={cn('absolute top-0 h-full rounded-full transition-all duration-500', getPremiumBgColor(item.premiumRate))}
                      style={
                        isPositive
                          ? { left: `${centerPos}%`, width: `${barWidth - centerPos}%` }
                          : { left: `${barWidth}%`, width: `${centerPos - barWidth}%` }
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
