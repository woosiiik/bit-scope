/**
 * 오픈 포지션 테이블 컴포넌트
 *
 * useFuturesPositions 훅으로 전체 거래소 오픈 포지션을 통합 조회한다.
 * 거래소 필터를 지원하며, API Key 미등록 시 안내 메시지를 표시한다.
 *
 * @see 요구사항 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.11
 */

'use client';

import { useMemo } from 'react';
import type { FuturesExchangeType, FuturesPosition } from '@bitscope/shared';
import { FUTURES_EXCHANGES, EXCHANGE_CONFIGS } from '@bitscope/shared';
import { cn } from '@/lib/utils';
import { useFuturesPositions } from '@/hooks/useFuturesApi';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/lib/i18n/i18n-context';

interface FuturesPositionTableProps {
  /** 거래소 필터 */
  exchangeFilter: FuturesExchangeType | 'all';
  /** 필터 변경 핸들러 */
  onFilterChange: (filter: FuturesExchangeType | 'all') => void;
}

export function FuturesPositionTable({
  exchangeFilter,
  onFilterChange,
}: FuturesPositionTableProps) {
  const { t } = useTranslation();
  const { positions } = useFuturesPositions();

  // 거래소 필터 적용
  const filteredPositions = useMemo(() => {
    if (exchangeFilter === 'all') return positions;
    return positions.filter((p) => p.exchange === exchangeFilter);
  }, [positions, exchangeFilter]);

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

      {/* 포지션 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]" role="table" aria-label={t.futuresTrading.openPosition}>
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
              <th className="px-3 py-2 text-right text-[11px] font-medium text-muted-foreground" scope="col">
                {t.futuresTrading.entryPrice}
              </th>
              <th className="px-3 py-2 text-right text-[11px] font-medium text-muted-foreground" scope="col">
                {t.futuresTrading.markPrice}
              </th>
              <th className="px-3 py-2 text-right text-[11px] font-medium text-muted-foreground" scope="col">
                {t.futuresTrading.size}
              </th>
              <th className="px-3 py-2 text-right text-[11px] font-medium text-muted-foreground" scope="col">
                {t.futuresTrading.unrealizedPnl}
              </th>
              <th className="px-3 py-2 text-right text-[11px] font-medium text-muted-foreground" scope="col">
                {t.futuresTrading.leverage}
              </th>
              <th className="px-3 py-2 text-right text-[11px] font-medium text-muted-foreground" scope="col">
                {t.futuresTrading.liquidationPrice}
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredPositions.length > 0 ? (
              filteredPositions.map((position, index) => (
                <PositionRow key={`${position.exchange}-${position.symbol}-${index}`} position={position} />
              ))
            ) : (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center">
                  <p className="text-xs text-muted-foreground">
                    {positions.length === 0
                      ? t.futuresTrading.noApiKey
                      : t.futuresTrading.noPositions}
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

// ----- 포지션 행 -----

interface PositionRowProps {
  position: FuturesPosition;
}

function PositionRow({ position }: PositionRowProps) {
  const config = EXCHANGE_CONFIGS[position.exchange];
  const isLong = position.side === 'LONG';
  const isPnlPositive = position.unrealizedPnl >= 0;

  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors">
      {/* 거래소 */}
      <td className="px-3 py-2">
        <Badge variant="outline" className="text-[10px]">
          {config?.nameEn ?? position.exchange}
        </Badge>
      </td>
      {/* 심볼 */}
      <td className="px-3 py-2 text-xs font-medium text-foreground">
        {position.symbol}
      </td>
      {/* 방향 */}
      <td className="px-3 py-2">
        <span
          className={cn(
            'text-xs font-semibold',
            isLong ? 'text-profit' : 'text-loss',
          )}
        >
          {isLong ? 'Long' : 'Short'}
        </span>
      </td>
      {/* 진입가 */}
      <td className="px-3 py-2 text-right text-xs text-foreground">
        {position.entryPrice.toLocaleString('en-US', { maximumFractionDigits: 4 })}
      </td>
      {/* 현재가 */}
      <td className="px-3 py-2 text-right text-xs text-foreground">
        {position.markPrice.toLocaleString('en-US', { maximumFractionDigits: 4 })}
      </td>
      {/* 수량 */}
      <td className="px-3 py-2 text-right text-xs text-foreground">
        {position.quantity.toLocaleString('en-US', { maximumFractionDigits: 4 })}
      </td>
      {/* 미실현 PnL */}
      <td className="px-3 py-2 text-right">
        <span
          className={cn(
            'text-xs font-medium',
            isPnlPositive ? 'text-profit' : 'text-loss',
          )}
        >
          {isPnlPositive ? '+' : ''}
          {position.unrealizedPnl.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDT
        </span>
      </td>
      {/* 레버리지 */}
      <td className="px-3 py-2 text-right text-xs text-foreground">
        {position.leverage}x
      </td>
      {/* 청산가 */}
      <td className="px-3 py-2 text-right text-xs text-muted-foreground">
        {position.liquidationPrice > 0
          ? position.liquidationPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })
          : '-'}
      </td>
    </tr>
  );
}
