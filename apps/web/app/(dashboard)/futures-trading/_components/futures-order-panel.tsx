/**
 * 선물 주문창 컴포넌트 (Coming Soon)
 *
 * 레버리지 설정(슬라이더), 롱/숏 방향 선택(토글), 주문 유형(지정가/시장가 탭),
 * 가격 입력, 수량 입력, 마진 정보 필드 UI를 구현한다.
 * 주문 실행은 Coming Soon 상태이며, 버튼 클릭 시 안내 메시지를 표시한다.
 *
 * @see 요구사항 6.1, 6.2, 6.3, 6.4, 6.5
 */

'use client';

import { useState, useMemo } from 'react';
import type { FuturesExchangeType } from '@bitscope/shared';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/lib/i18n/i18n-context';

interface FuturesOrderPanelProps {
  /** 선물 심볼 (예: 'BTCUSDT') */
  symbol: string;
  /** 거래소 */
  exchange: FuturesExchangeType;
  /** 현재 가격 (오더북에서 가져온 현재가) */
  currentPrice: number;
}

/** 레버리지 프리셋 */
const LEVERAGE_PRESETS = [1, 5, 10, 20, 50, 100, 125] as const;

export function FuturesOrderPanel({
  symbol,
  exchange,
  currentPrice,
}: FuturesOrderPanelProps) {
  const { t } = useTranslation();

  // UI 상태
  const [direction, setDirection] = useState<'long' | 'short'>('long');
  const [orderType, setOrderType] = useState<'limit' | 'market'>('limit');
  const [leverage, setLeverage] = useState(10);
  const [price, setPrice] = useState('');
  const [size, setSize] = useState('');
  const [showComingSoon, setShowComingSoon] = useState(false);

  // 표시 가격 (빈 입력 시 현재가 사용)
  const displayPrice = price || (currentPrice > 0 ? currentPrice.toString() : '');

  // 마진 계산 (가격 x 수량 / 레버리지)
  const margin = useMemo(() => {
    const p = parseFloat(displayPrice) || 0;
    const s = parseFloat(size) || 0;
    if (p <= 0 || s <= 0 || leverage <= 0) return 0;
    return (p * s) / leverage;
  }, [displayPrice, size, leverage]);

  // 주문 버튼 클릭 핸들러
  const handlePlaceOrder = () => {
    setShowComingSoon(true);
    setTimeout(() => setShowComingSoon(false), 2500);
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2 pt-3 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{t.futuresTrading.placeOrder}</CardTitle>
          <Badge variant="secondary" className="text-[10px]">
            Coming Soon
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col px-3 pb-3 gap-2.5">
        {/* 레버리지 설정 */}
        <div>
          <label className="text-[11px] text-muted-foreground">
            {t.futuresTrading.leverage}
          </label>
          <div className="flex items-center gap-1 mt-1">
            {/* 레버리지 프리셋 버튼 */}
            <div className="flex gap-0.5 flex-wrap flex-1">
              {LEVERAGE_PRESETS.map((lev) => (
                <Button
                  key={lev}
                  variant={leverage === lev ? 'default' : 'outline'}
                  size="sm"
                  className="text-[10px] h-6 px-1.5 min-w-0"
                  onClick={() => setLeverage(lev)}
                >
                  {lev}x
                </Button>
              ))}
            </div>
          </div>
          {/* 레버리지 슬라이더 */}
          <input
            type="range"
            min={1}
            max={125}
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            className="w-full h-1.5 mt-2 accent-primary cursor-pointer"
            aria-label={`${t.futuresTrading.leverage}: ${leverage}x`}
          />
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[10px] text-muted-foreground">1x</span>
            <span className="text-[11px] font-semibold text-foreground">{leverage}x</span>
            <span className="text-[10px] text-muted-foreground">125x</span>
          </div>
        </div>

        {/* 롱/숏 방향 선택 */}
        <div className="grid grid-cols-2 gap-1">
          <Button
            variant={direction === 'long' ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'text-xs h-8',
              direction === 'long' && 'bg-profit hover:bg-profit/90 text-white',
            )}
            onClick={() => setDirection('long')}
          >
            {t.futuresTrading.long}
          </Button>
          <Button
            variant={direction === 'short' ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'text-xs h-8',
              direction === 'short' && 'bg-loss hover:bg-loss/90 text-white',
            )}
            onClick={() => setDirection('short')}
          >
            {t.futuresTrading.short}
          </Button>
        </div>

        {/* 주문 유형 탭 (지정가/시장가) */}
        <div className="flex border-b border-border">
          <button
            type="button"
            className={cn(
              'flex-1 pb-1.5 text-xs text-center transition-colors',
              orderType === 'limit'
                ? 'border-b-2 border-primary font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setOrderType('limit')}
          >
            {t.futuresTrading.limitOrder}
          </button>
          <button
            type="button"
            className={cn(
              'flex-1 pb-1.5 text-xs text-center transition-colors',
              orderType === 'market'
                ? 'border-b-2 border-primary font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setOrderType('market')}
          >
            {t.futuresTrading.marketOrder}
          </button>
        </div>

        {/* 가격 입력 (지정가일 때만) */}
        {orderType === 'limit' && (
          <div>
            <label className="text-[11px] text-muted-foreground">
              {t.futuresTrading.orderPrice} (USDT)
            </label>
            <Input
              type="number"
              placeholder={currentPrice > 0 ? currentPrice.toLocaleString() : '0'}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="h-8 text-xs mt-0.5"
            />
          </div>
        )}

        {/* 수량 입력 */}
        <div>
          <label className="text-[11px] text-muted-foreground">
            {t.futuresTrading.orderSize}
          </label>
          <Input
            type="number"
            placeholder="0"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="h-8 text-xs mt-0.5"
          />
        </div>

        {/* 비율 버튼 */}
        <div className="flex gap-1">
          {['25%', '50%', '75%', '100%'].map((pct) => (
            <Button
              key={pct}
              variant="outline"
              size="sm"
              className="flex-1 text-[10px] h-6 px-0"
            >
              {pct}
            </Button>
          ))}
        </div>

        {/* 마진 정보 */}
        <div className="flex items-center justify-between py-1 border-t border-border">
          <span className="text-[11px] text-muted-foreground">{t.futuresTrading.margin}</span>
          <span className="text-xs font-medium">
            {margin > 0 ? `${margin.toFixed(2)} USDT` : '-'}
          </span>
        </div>

        {/* 스페이서 */}
        <div className="flex-1" />

        {/* 주문 버튼 */}
        <div className="relative">
          <Button
            className={cn(
              'w-full text-sm h-9',
              direction === 'long'
                ? 'bg-profit hover:bg-profit/90 text-white'
                : 'bg-loss hover:bg-loss/90 text-white',
            )}
            onClick={handlePlaceOrder}
          >
            {direction === 'long'
              ? t.futuresTrading.placeLongOrder
              : t.futuresTrading.placeShortOrder}
            {' '}{symbol.replace('USDT', '')}
          </Button>

          {/* Coming Soon 오버레이 */}
          {showComingSoon && (
            <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/90 border border-border">
              <span className="text-xs font-medium text-muted-foreground">
                {t.futuresTrading.comingSoon}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
