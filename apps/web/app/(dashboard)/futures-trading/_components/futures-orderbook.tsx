/**
 * 선물 오더북 컴포넌트
 *
 * useFuturesOrderbook 훅을 사용하여 선물 오더북 데이터를 조회한다.
 * 매도 호가(Ask)를 상단 빨간색, 매수 호가(Bid)를 하단 초록색으로 표시한다.
 * 각 호가에 가격, 수량을 표시하고, 배경 바로 수량 비중을 시각화한다.
 *
 * @see 요구사항 5.1, 5.2, 5.3, 5.6, 5.7
 */

'use client';

import type { FuturesExchangeType } from '@bitscope/shared';
import { useFuturesOrderbook } from '@/hooks/useFuturesApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { RefreshCw } from 'lucide-react';

interface FuturesOrderbookProps {
  /** 선물 거래소 */
  exchange: FuturesExchangeType;
  /** baseAsset 심볼 (예: 'BTC') */
  symbol: string;
}

export function FuturesOrderbook({ exchange, symbol }: FuturesOrderbookProps) {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useFuturesOrderbook({
    exchange,
    symbol,
    enabled: !!symbol,
    refetchInterval: 2000,
  });

  const orderbook = data?.orderbook;

  // 로딩 스켈레톤
  if (isLoading && !orderbook) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-sm font-medium">{t.market.orderbookTitle}</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="space-y-1.5" role="status" aria-label={t.market.orderbookLoading}>
            {Array.from({ length: 14 }).map((_, i) => (
              <Skeleton key={`ob-skel-${i}`} className="h-5 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // 에러 상태
  if (error && !orderbook) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-sm font-medium">{t.market.orderbookTitle}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center px-3 pb-3 py-8 gap-3">
          <p className="text-xs text-muted-foreground text-center">
            {t.market.orderbookNoData}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="text-xs"
          >
            <RefreshCw className="mr-1 h-3 w-3" aria-hidden="true" />
            {t.common.retry}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // 데이터 없음
  if (!orderbook) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-sm font-medium">{t.market.orderbookTitle}</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <p className="text-xs text-muted-foreground text-center py-4">
            {t.market.orderbookNoData}
          </p>
        </CardContent>
      </Card>
    );
  }

  // 매도 호가 (가격 내림차순으로 표시 -> 가장 낮은 매도가가 아래에 위치)
  const asks = orderbook.asks.slice(0, 7).reverse();
  // 매수 호가 (가격 내림차순)
  const bids = orderbook.bids.slice(0, 7);

  // 최대 수량 (바 너비 기준)
  const allEntries = [...asks, ...bids];
  const maxQuantity = allEntries.length > 0
    ? Math.max(...allEntries.map((e) => e.quantity))
    : 1;

  // 스프레드 계산 (가장 낮은 매도가 - 가장 높은 매수가)
  const lowestAsk = asks.length > 0 ? asks[asks.length - 1]!.price : 0;
  const highestBid = bids.length > 0 ? bids[0]!.price : 0;
  const spread = lowestAsk > 0 && highestBid > 0 ? lowestAsk - highestBid : 0;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-sm font-medium">{t.market.orderbookTitle}</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="space-y-0.5" role="table" aria-label={`${symbol} futures orderbook`}>
          {/* 헤더 */}
          <div className="flex items-center justify-between px-1 pb-1.5 text-[10px] text-muted-foreground" role="row">
            <span role="columnheader">{t.futuresTrading.orderPrice} (USDT)</span>
            <span role="columnheader">{t.futuresTrading.size}</span>
          </div>

          {/* 매도 호가 (빨간색) */}
          {asks.map((entry, index) => (
            <div
              key={`ask-${index}`}
              className="relative flex items-center justify-between rounded px-1 py-0.5"
              role="row"
            >
              <div
                className="absolute inset-y-0 right-0 bg-loss/10 rounded"
                style={{ width: `${(entry.quantity / maxQuantity) * 100}%` }}
                aria-hidden="true"
              />
              <span className="relative text-[11px] font-medium text-loss" aria-label="Ask">
                {formatOrderbookPrice(entry.price)}
              </span>
              <span className="relative text-[11px] text-muted-foreground">
                {formatOrderbookQty(entry.quantity)}
              </span>
            </div>
          ))}

          {/* 스프레드 구분선 */}
          {spread > 0 && (
            <div className="flex items-center justify-center py-1">
              <div className="h-px flex-1 bg-border" aria-hidden="true" />
              <span className="mx-2 text-[10px] font-medium text-muted-foreground">
                {formatOrderbookPrice(spread)}
              </span>
              <div className="h-px flex-1 bg-border" aria-hidden="true" />
            </div>
          )}

          {/* 매수 호가 (녹색) */}
          {bids.map((entry, index) => (
            <div
              key={`bid-${index}`}
              className="relative flex items-center justify-between rounded px-1 py-0.5"
              role="row"
            >
              <div
                className="absolute inset-y-0 right-0 bg-profit/10 rounded"
                style={{ width: `${(entry.quantity / maxQuantity) * 100}%` }}
                aria-hidden="true"
              />
              <span className="relative text-[11px] font-medium text-profit" aria-label="Bid">
                {formatOrderbookPrice(entry.price)}
              </span>
              <span className="relative text-[11px] text-muted-foreground">
                {formatOrderbookQty(entry.quantity)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 오더북 가격을 포맷팅한다.
 * 높은 가격(1000+)은 소수점 2자리, 낮은 가격은 적절한 소수점을 표시한다.
 */
function formatOrderbookPrice(price: number): string {
  if (price >= 1000) {
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (price >= 1) {
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }
  return price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

/**
 * 오더북 수량을 포맷팅한다.
 */
function formatOrderbookQty(qty: number): string {
  if (qty >= 1000) {
    return qty.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  if (qty >= 1) {
    return qty.toLocaleString('en-US', { maximumFractionDigits: 3 });
  }
  return qty.toLocaleString('en-US', { maximumFractionDigits: 4 });
}
