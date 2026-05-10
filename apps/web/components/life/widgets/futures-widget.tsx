/**
 * 선물 마켓 데이터 위젯
 *
 * 선택한 코인의 핵심 선물 지표를 요약 표시한다.
 */

'use client';

import Link from 'next/link';
import { Activity, TrendingUp, TrendingDown, DollarSign, Zap } from 'lucide-react';

import { useFuturesIndicators } from '@/hooks/useFuturesData';
import { cn } from '@/lib/utils';

interface FuturesWidgetProps {
  symbol?: string;
}

function formatCompact(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function FuturesWidget({ symbol = 'BTCUSDT' }: FuturesWidgetProps) {
  const { data: indicators, isLoading } = useFuturesIndicators(symbol);
  const coinName = symbol.replace(/USDT$/i, '');

  const longShortRatio = indicators?.longShortRatio ?? [];
  const fundingRateData = indicators?.fundingRate ?? [];
  const openInterestData = indicators?.openInterest ?? [];
  const topTraderData = indicators?.topTraderRatio ?? [];
  const takerBuySellData = indicators?.takerBuySell ?? [];

  const latestLongShort = longShortRatio[longShortRatio.length - 1];
  const latestFunding = fundingRateData[fundingRateData.length - 1];
  const latestOI = openInterestData[openInterestData.length - 1];
  const latestTopTrader = topTraderData[topTraderData.length - 1];
  const latestTaker = takerBuySellData[takerBuySellData.length - 1];

  return (
    <div className="flex flex-col h-full p-3 overflow-auto">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Futures <span className="text-primary">{coinName}</span>
        </h3>
        <Link href="/futures" className="text-[10px] text-primary hover:underline">
          상세보기
        </Link>
      </div>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground">로딩 중...</p>
        </div>
      )}

      {!isLoading && !indicators && (
        <div className="flex-1 flex flex-col items-center justify-center gap-1">
          <Activity className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-[10px] text-muted-foreground">데이터 수집 중...</p>
        </div>
      )}

      {indicators && (
        <div className="space-y-3 flex-1">
          {/* 롱숏 비율 게이지 */}
          {latestLongShort && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="h-3 w-3 text-profit" />
                <span className="text-[10px] text-muted-foreground">롱/숏 비율</span>
              </div>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-profit font-medium">{(latestLongShort.longAccount * 100).toFixed(1)}%</span>
                <span className="text-loss font-medium">{(latestLongShort.shortAccount * 100).toFixed(1)}%</span>
              </div>
              <div className="h-2 rounded-full bg-loss overflow-hidden">
                <div className="h-full rounded-full bg-profit" style={{ width: `${latestLongShort.longAccount * 100}%` }} />
              </div>
            </div>
          )}

          {/* 펀딩 비율 */}
          {latestFunding && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <DollarSign className="h-3 w-3 text-primary" />
                <span className="text-[10px] text-muted-foreground">펀딩 비율</span>
              </div>
              <span className={cn('text-xs font-bold', latestFunding.fundingRate >= 0 ? 'text-profit' : 'text-loss')}>
                {(latestFunding.fundingRate * 100).toFixed(4)}%
              </span>
            </div>
          )}

          {/* 미결제 약정 */}
          {latestOI && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Activity className="h-3 w-3 text-orange-500" />
                <span className="text-[10px] text-muted-foreground">미결제 약정</span>
              </div>
              <span className="text-xs font-bold text-foreground">
                {formatCompact(latestOI.sumOpenInterestValue)}
              </span>
            </div>
          )}

          {/* 매수/매도 비율 */}
          {latestTaker && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Zap className="h-3 w-3 text-red-500" />
                <span className="text-[10px] text-muted-foreground">매수/매도</span>
              </div>
              <span className={cn('text-xs font-bold', latestTaker.buySellRatio >= 1 ? 'text-profit' : 'text-loss')}>
                {latestTaker.buySellRatio.toFixed(2)}
              </span>
            </div>
          )}

          {/* 탑 트레이더 */}
          {latestTopTrader && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingDown className="h-3 w-3 text-purple-500" />
                <span className="text-[10px] text-muted-foreground">탑 트레이더</span>
              </div>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="text-profit">L {(latestTopTrader.longAccount * 100).toFixed(1)}%</span>
                <span className="text-loss">S {(latestTopTrader.shortAccount * 100).toFixed(1)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-loss overflow-hidden">
                <div className="h-full rounded-full bg-profit" style={{ width: `${latestTopTrader.longAccount * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
