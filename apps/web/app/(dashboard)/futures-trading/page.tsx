/**
 * 선물 거래 페이지
 *
 * 해외 거래소(Binance, Bybit, OKX, Gate, Bitget)의 선물 차트, 오더북,
 * 오픈 포지션 및 오픈 오더 조회 기능을 제공한다.
 *
 * 레이아웃:
 * - 상단: 코인 콤보박스 + 거래소 탭
 * - 중앙 2열: TradingView 차트(flex) + 오더북(240px)
 * - 하단: 오픈 포지션 / 오픈 오더 탭 + 테이블
 *
 * @see 요구사항 1, 2, 3, 4, 5, 6, 7, 8, 12
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
import type { FuturesExchangeType } from '@bitscope/shared';
import {
  FUTURES_DEFAULT_EXCHANGE,
  FUTURES_DEFAULT_COIN,
  FUTURES_COINS,
  getTradingViewFuturesSymbol,
} from '@bitscope/shared';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { TradingViewChart } from '@/components/life/widgets/tradingview-chart-widget';
import { Card, CardContent } from '@/components/ui/card';

// 하위 컴포넌트
import { FuturesCoinSelector } from './_components/futures-coin-selector';
import { FuturesExchangeTabs } from './_components/futures-exchange-tabs';
import { FuturesOrderbook } from './_components/futures-orderbook';
import { FuturesPositionTable } from './_components/futures-position-table';
import { FuturesOpenOrderTable } from './_components/futures-open-order-table';

/** 하단 탭 타입 */
type BottomTab = 'positions' | 'orders';

export default function FuturesTradingPage() {
  const { t } = useTranslation();

  // 페이지 상태
  const [selectedCoin, setSelectedCoin] = useState(FUTURES_DEFAULT_COIN);
  const [selectedExchange, setSelectedExchange] = useState<FuturesExchangeType>(FUTURES_DEFAULT_EXCHANGE);
  const [activeTab, setActiveTab] = useState<BottomTab>('positions');
  const [positionFilter, setPositionFilter] = useState<FuturesExchangeType | 'all'>('all');
  const [orderFilter, setOrderFilter] = useState<FuturesExchangeType | 'all'>('all');

  // 코인 정보 추출
  const coinInfo = useMemo(
    () => FUTURES_COINS.find((c) => c.symbol === selectedCoin),
    [selectedCoin],
  );
  const baseAsset = coinInfo?.baseAsset ?? selectedCoin.replace('USDT', '');

  // TradingView 차트 심볼
  const tradingViewSymbol = useMemo(
    () => getTradingViewFuturesSymbol(selectedExchange, baseAsset),
    [selectedExchange, baseAsset],
  );

  // 코인 변경 핸들러
  const handleSelectCoin = useCallback((coin: string) => {
    setSelectedCoin(coin);
  }, []);

  // 거래소 변경 핸들러
  const handleSelectExchange = useCallback((exchange: FuturesExchangeType) => {
    setSelectedExchange(exchange);
  }, []);

  // 포지션/오더 심볼 클릭 핸들러: 차트를 해당 거래소+코인으로 전환
  const handleSymbolClick = useCallback((exchange: FuturesExchangeType, symbol: string) => {
    // 심볼에서 baseAsset 추출: BTCUSDT -> BTC, BTC -> BTC
    const base = symbol.replace(/USDT$/, '').replace(/USD$/, '');
    // FUTURES_COINS에서 매칭되는 코인 찾기
    const coin = FUTURES_COINS.find((c) => c.baseAsset === base);
    if (coin) {
      setSelectedCoin(coin.symbol);
    }
    setSelectedExchange(exchange);
  }, []);

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* 상단: 타이틀 + 코인 선택 + 거래소 탭 */}
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-foreground">
          {t.futuresTrading.title}
        </h1>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <FuturesCoinSelector
            selectedCoin={selectedCoin}
            onSelectCoin={handleSelectCoin}
          />
          <FuturesExchangeTabs
            selectedExchange={selectedExchange}
            onSelectExchange={handleSelectExchange}
          />
        </div>
      </div>

      {/* 중앙 2열: 차트 + 오더북 */}
      {/* 데스크탑: 2열, 모바일: 수직 스택 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_240px]">
        {/* TradingView 차트 */}
        <Card className="overflow-hidden">
          <CardContent className="p-0 h-[300px] md:h-[360px] lg:h-[420px]">
            <TradingViewChart
              symbol={tradingViewSymbol}
              interval="60"
              containerId={`futures-chart-${selectedExchange}-${baseAsset}`}
            />
          </CardContent>
        </Card>

        {/* 선물 오더북 */}
        <FuturesOrderbook
          exchange={selectedExchange}
          symbol={baseAsset}
        />
      </div>

      {/* 하단: 오픈 포지션 / 오픈 오더 탭 */}
      <Card>
        <CardContent className="p-4">
          {/* 탭 헤더 */}
          <div className="flex items-center border-b border-border mb-4">
            <button
              type="button"
              className={cn(
                'px-4 pb-2 text-sm transition-colors',
                activeTab === 'positions'
                  ? 'border-b-2 border-primary font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setActiveTab('positions')}
            >
              {t.futuresTrading.openPosition}
            </button>
            <button
              type="button"
              className={cn(
                'px-4 pb-2 text-sm transition-colors',
                activeTab === 'orders'
                  ? 'border-b-2 border-primary font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setActiveTab('orders')}
            >
              {t.futuresTrading.openOrder}
            </button>
          </div>

          {/* 탭 콘텐츠 */}
          {activeTab === 'positions' ? (
            <FuturesPositionTable
              exchangeFilter={positionFilter}
              onFilterChange={setPositionFilter}
              onSymbolClick={handleSymbolClick}
            />
          ) : (
            <FuturesOpenOrderTable
              exchangeFilter={orderFilter}
              onFilterChange={setOrderFilter}
              onSymbolClick={handleSymbolClick}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
