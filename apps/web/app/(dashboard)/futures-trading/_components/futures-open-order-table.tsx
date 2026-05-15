/**
 * 오픈 오더 테이블 컴포넌트
 *
 * useFuturesOpenOrders 훅으로 전체 거래소 오픈 오더를 통합 조회한다.
 * 거래소 필터를 지원하며, API Key 미등록 시 안내 메시지를 표시한다.
 *
 * @see 요구사항 8.1, 8.2, 8.3, 8.4, 8.7
 */

'use client';

import { useMemo } from 'react';
import type { FuturesExchangeType, FuturesOpenOrder } from '@bitscope/shared';
import { FUTURES_EXCHANGES, EXCHANGE_CONFIGS } from '@bitscope/shared';
import { cn } from '@/lib/utils';
import { useFuturesOpenOrders } from '@/hooks/useFuturesApi';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/lib/i18n/i18n-context';

interface FuturesOpenOrderTableProps {
  /** 거래소 필터 */
  exchangeFilter: FuturesExchangeType | 'all';
  /** 필터 변경 핸들러 */
  onFilterChange: (filter: FuturesExchangeType | 'all') => void;
}

export function FuturesOpenOrderTable({
  exchangeFilter,
  onFilterChange,
}: FuturesOpenOrderTableProps) {
  const { t } = useTranslation();
  const { openOrders, isLoading } = useFuturesOpenOrders();

  // 거래소 필터 적용
  const filteredOrders = useMemo(() => {
    if (exchangeFilter === 'all') return openOrders;
    return openOrders.filter((o) => o.exchange === exchangeFilter);
  }, [openOrders, exchangeFilter]);

  return (
    <div className="space-y-3">
      {/* 거래소 필터 */}
      <div className="flex items-center gap-1.5 overflow-x-auto">
        <Button
          variant={exchangeFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onFilterChange('all')}
          className="text-xs h-7"
        >
          {t.futuresTrading.allExchanges}
        </Button>
        {FUTURES_EXCHANGES.map((exchange) => {
          const config = EXCHANGE_CONFIGS[exchange];
          return (
            <Button
              key={exchange}
              variant={exchangeFilter === exchange ? 'default' : 'outline'}
              size="sm"
              onClick={() => onFilterChange(exchange)}
              className="text-xs h-7"
            >
              {config?.nameEn ?? exchange}
            </Button>
          );
        })}
      </div>

      {/* 오더 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px]" role="table" aria-label={t.futuresTrading.openOrder}>
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground" scope="col">
                {t.futuresTrading.filterExchange}
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground" scope="col">
                Symbol
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground" scope="col">
                {t.futuresTrading.direction}
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground" scope="col">
                {t.futuresTrading.orderType}
              </th>
              <th className="px-3 py-2 text-right text-[11px] font-medium text-muted-foreground" scope="col">
                {t.futuresTrading.orderPrice} (USDT)
              </th>
              <th className="px-3 py-2 text-right text-[11px] font-medium text-muted-foreground" scope="col">
                {t.futuresTrading.size}
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground" scope="col">
                {t.futuresTrading.status}
              </th>
              <th className="px-3 py-2 text-right text-[11px] font-medium text-muted-foreground" scope="col">
                {t.futuresTrading.createdAt}
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length > 0 ? (
              filteredOrders.map((order, index) => (
                <OrderRow key={`${order.exchange}-${order.orderId}-${index}`} order={order} />
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center">
                  <p className="text-xs text-muted-foreground">
                    {openOrders.length === 0
                      ? t.futuresTrading.noApiKey
                      : t.futuresTrading.noOrders}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ----- 오더 행 -----

interface OrderRowProps {
  order: FuturesOpenOrder;
}

function OrderRow({ order }: OrderRowProps) {
  const config = EXCHANGE_CONFIGS[order.exchange];
  const isBuy = order.side === 'BUY';

  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors">
      {/* 거래소 */}
      <td className="px-3 py-2">
        <Badge variant="outline" className="text-[10px]">
          {config?.nameEn ?? order.exchange}
        </Badge>
      </td>
      {/* 심볼 */}
      <td className="px-3 py-2 text-xs font-medium text-foreground">
        {order.symbol}
      </td>
      {/* 방향 */}
      <td className="px-3 py-2">
        <span
          className={cn(
            'text-xs font-semibold',
            isBuy ? 'text-profit' : 'text-loss',
          )}
        >
          {order.side} / {order.positionSide}
        </span>
      </td>
      {/* 주문 유형 */}
      <td className="px-3 py-2 text-xs text-foreground">
        {order.orderType}
      </td>
      {/* 가격 */}
      <td className="px-3 py-2 text-right text-xs text-foreground">
        {order.price > 0
          ? order.price.toLocaleString('en-US', { maximumFractionDigits: 4 })
          : 'Market'}
      </td>
      {/* 수량 */}
      <td className="px-3 py-2 text-right text-xs text-foreground">
        {order.quantity.toLocaleString('en-US', { maximumFractionDigits: 4 })}
      </td>
      {/* 상태 */}
      <td className="px-3 py-2">
        <Badge variant="secondary" className="text-[10px]">
          {order.status}
        </Badge>
      </td>
      {/* 생성 시간 */}
      <td className="px-3 py-2 text-right text-xs text-muted-foreground">
        {formatTimestamp(order.createdAt)}
      </td>
    </tr>
  );
}

/**
 * 밀리초 타임스탬프를 날짜/시간 문자열로 변환한다.
 */
function formatTimestamp(ts: number): string {
  if (!ts) return '-';
  const date = new Date(ts);
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
