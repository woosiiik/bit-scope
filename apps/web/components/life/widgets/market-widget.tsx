/**
 * 마켓 시세 위젯
 *
 * 업비트 기준 주요 코인의 실시간 시세를 표시한다.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface TickerItem {
  symbol: string;
  currentPrice: number;
  changeRate: number;
}

interface MarketWidgetProps {
  exchange?: string;
}

export function MarketWidget({ exchange = 'binance' }: MarketWidgetProps) {
  const { data: tickers, isLoading } = useQuery<TickerItem[]>({
    queryKey: ['market', 'widget', exchange],
    queryFn: async () => {
      const res = await fetch(`/api/exchange/${exchange}/ticker`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return [];
      const json = await res.json();
      const raw = json?.data?.tickers ?? [];
      return raw
        .filter((t: TickerItem) => t.currentPrice > 0)
        .sort((a: TickerItem, b: TickerItem) => b.currentPrice * b.changeRate - a.currentPrice * a.changeRate)
        .slice(0, 15);
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  return (
    <div className="flex flex-col h-full p-3 overflow-auto">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Market <span className="text-[10px] font-normal">({exchange.charAt(0).toUpperCase() + exchange.slice(1)})</span>
        </h3>
        <Link href="/market" className="text-[10px] text-primary hover:underline">
          전체보기
        </Link>
      </div>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground">로딩 중...</p>
        </div>
      )}

      {!isLoading && (!tickers || tickers.length === 0) && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground">시세 데이터 없음</p>
        </div>
      )}

      {tickers && tickers.length > 0 && (
        <div className="space-y-1.5 flex-1">
          {tickers.map((item) => {
            const isPositive = item.changeRate >= 0;
            return (
              <div key={item.symbol} className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{item.symbol}</span>
                <div className="text-right flex items-center gap-2">
                  <span className="text-foreground tabular-nums">
                    {item.currentPrice.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}
                  </span>
                  <span className={cn('flex items-center gap-0.5 w-16 justify-end tabular-nums', isPositive ? 'text-profit' : 'text-loss')}>
                    {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {isPositive ? '+' : ''}{item.changeRate.toFixed(2)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
