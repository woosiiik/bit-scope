/**
 * 마켓 시세 페이지
 *
 * 거래소별 전체 코인 시세(현재가, 24시간 변동률, 거래량)를 실시간으로 표시한다.
 * 주요 기능:
 * - 거래소별 전체 코인 시세 목록 (WebSocket 실시간 업데이트)
 * - 코인명/티커 검색 필터
 * - 거래량 상위, 상승률 상위, 하락률 상위 하이라이트 섹션
 * - 특정 코인 선택 시 상세 정보 (가격 차트, 호가 정보, 최근 체결 내역)
 *
 * @see 요구사항 5.1 (거래소별 전체 코인 시세 목록)
 * @see 요구사항 5.2 (실시간 시세 업데이트)
 * @see 요구사항 5.3 (코인명/티커 검색)
 * @see 요구사항 5.4 (가격 차트, 호가 정보, 최근 체결 내역)
 * @see 요구사항 5.5 (거래량 상위, 상승률/하락률 상위 하이라이트)
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Search,
  TrendingUp,
  TrendingDown,
  BarChart3,
  ArrowLeft,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { ExchangeType, Ticker, Orderbook } from '@bitscope/shared';
import {
  SUPPORTED_EXCHANGES,
  DOMESTIC_EXCHANGES,
  FOREIGN_EXCHANGES,
  MAJOR_COIN_SYMBOLS,
  MAJOR_COINS,
  formatVolume,
  formatCompactKRW,
} from '@bitscope/shared';
import { cn, getExchangeName, getCoinName } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { useRealTimePrice } from '@/hooks/useRealTimePrice';
import { usePriceStore } from '@/store/price-store';
import {
  useExchangeTicker,
  useExchangeOrderbook,
} from '@/hooks/useExchangeApi';
import { fetchTicker, getUsdtKrwRate } from '@/lib/api-client';
import { TradingViewChart } from '@/components/life/widgets/tradingview-chart-widget';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  FormattedCurrency,
  FormattedPercent,
  FormattedPrice,
} from '@/components/ui/formatted-number';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Skeleton, TableRowSkeleton } from '@/components/ui/skeleton';

// ===== 상수 =====

/** 하이라이트 섹션에 기본 표시할 코인 수 */
const HIGHLIGHT_COUNT = 5;

/** 거래량 합산에 기본 표시할 코인 수 */
const VOLUME_DEFAULT_COUNT = 10;

/** 거래량 합산에서 "더 보기" 시 표시할 코인 수 */
const VOLUME_EXPANDED_COUNT = 30;

/** 거래량 합산 대상 거래소 (하이퍼리퀴드 제외 - USDC 기준, 거래량 형식 상이) */
const VOLUME_EXCHANGES: ExchangeType[] = [
  ...(DOMESTIC_EXCHANGES as unknown as ExchangeType[]),
  ...(FOREIGN_EXCHANGES as unknown as ExchangeType[]),
];

/** 기본 선택 거래소 */
const DEFAULT_EXCHANGE: ExchangeType = 'upbit';

// ===== 마켓 페이지 메인 =====

export default function MarketPage() {
  const { t, locale } = useTranslation();

  // 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedExchange, setSelectedExchange] = useState<ExchangeType>(DEFAULT_EXCHANGE);
  const [selectedCoin, setSelectedCoin] = useState<string | null>(null);

  // 실시간 시세 구독 (주요 코인)
  const { connectionStatus, isPollingMode, reconnect } = useRealTimePrice({
    symbols: MAJOR_COIN_SYMBOLS as unknown as string[],
    enabled: true,
  });

  // REST API를 통한 시세 조회 (선택된 거래소 전체)
  const { data: tickerData, isLoading: isTickerLoading, refetch: refetchTicker } = useExchangeTicker({
    exchange: selectedExchange,
    enabled: true,
    refetchInterval: 10_000, // 10초 간격 자동 갱신
  });

  // 전체 거래소 시세 병렬 조회 (거래량 합산용)
  const allTickerQueries = useQueries({
    queries: VOLUME_EXCHANGES.map((exchange) => ({
      queryKey: ['exchange', exchange, 'ticker', 'volume-agg'] as const,
      queryFn: () => fetchTicker(exchange),
      refetchInterval: 30_000,
      staleTime: 20_000,
      retry: 1,
    })),
  });

  // USDT/KRW 환율 조회 (해외 거래소 거래량 KRW 환산용)
  const { data: usdtKrwRate = 0 } = useQuery({
    queryKey: ['usdtKrwRate'],
    queryFn: getUsdtKrwRate,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // 국내+해외 전체 거래소 심볼별 거래량 합산 (KRW 기준, 스테이블코인 제외)
  const aggregatedVolumes = useMemo(() => {
    const volumeMap = new Map<string, number>();
    const foreignSet = new Set(FOREIGN_EXCHANGES as unknown as string[]);
    const stablecoins = new Set(['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FDUSD']);

    for (let i = 0; i < VOLUME_EXCHANGES.length; i++) {
      const exchange = VOLUME_EXCHANGES[i]!;
      const query = allTickerQueries[i];
      const tickers = query?.data?.tickers;
      if (!tickers) continue;

      const isForeign = foreignSet.has(exchange);
      const rate = isForeign ? usdtKrwRate : 1;

      for (const ticker of tickers) {
        if (stablecoins.has(ticker.symbol)) continue;
        const vol = ticker.volumeAmount24h || ticker.volume24h * ticker.currentPrice;
        if (vol <= 0) continue;
        const volKrw = vol * rate;
        volumeMap.set(ticker.symbol, (volumeMap.get(ticker.symbol) || 0) + volKrw);
      }
    }

    return Array.from(volumeMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([symbol, totalVolume]) => ({ symbol, totalVolume }));
  }, [allTickerQueries, usdtKrwRate]);

  const isAggregatedLoading = allTickerQueries.some((q) => q.isLoading) && aggregatedVolumes.length === 0;

  // 실시간 가격 데이터 (store에서 가져온다)
  const pricesByExchange = usePriceStore((s) => s.getPricesByExchange);

  // REST 응답에서 받은 ticker 목록과 실시간 데이터를 병합한다.
  const tickers: Ticker[] = useMemo(() => {
    if (!tickerData?.tickers) return [];
    return tickerData.tickers;
  }, [tickerData]);

  // 실시간 가격을 반영한 ticker 목록
  const enrichedTickers = useMemo(() => {
    const realtimePrices = pricesByExchange(selectedExchange);
    const priceMap = new Map(realtimePrices.map((p) => [p.symbol, p]));

    return tickers.map((ticker) => {
      const realtime = priceMap.get(ticker.symbol);
      if (realtime && realtime.timestamp > ticker.timestamp) {
        return {
          ...ticker,
          currentPrice: realtime.price,
          changeRate: realtime.changeRate,
          volume24h: realtime.volume24h,
          timestamp: realtime.timestamp,
        };
      }
      return ticker;
    });
  }, [tickers, pricesByExchange, selectedExchange]);

  // 검색 필터 적용
  const filteredTickers = useMemo(() => {
    if (!searchQuery.trim()) return enrichedTickers;

    const query = searchQuery.trim().toUpperCase();
    // MAJOR_COINS에서 한글 이름도 검색 가능하도록 한다.
    const coinNameMap = new Map(
      MAJOR_COINS.map((c) => [c.symbol, c]),
    );

    return enrichedTickers.filter((ticker) => {
      const symbol = ticker.symbol.toUpperCase();
      const coinInfo = coinNameMap.get(symbol);
      return (
        symbol.includes(query) ||
        (coinInfo && getCoinName(coinInfo, locale).toUpperCase().includes(query))
      );
    });
  }, [enrichedTickers, searchQuery, locale]);

  // 하이라이트 데이터 계산 (상승률/하락률은 선택된 거래소 기준)
  const highlights = useMemo(() => {
    if (enrichedTickers.length === 0) return { topGainers: [], topLosers: [] };

    const sorted = [...enrichedTickers];

    const topGainers = [...sorted]
      .sort((a, b) => b.changeRate - a.changeRate)
      .slice(0, HIGHLIGHT_COUNT);

    const topLosers = [...sorted]
      .sort((a, b) => a.changeRate - b.changeRate)
      .slice(0, HIGHLIGHT_COUNT);

    return { topGainers, topLosers };
  }, [enrichedTickers]);

  // 코인 선택 핸들러
  const handleSelectCoin = useCallback((symbol: string) => {
    setSelectedCoin(symbol);
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedCoin(null);
  }, []);

  // 코인 상세 모드
  if (selectedCoin) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <CoinDetailView
          symbol={selectedCoin}
          exchange={selectedExchange}
          onBack={handleBackToList}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 헤더 */}
      <MarketHeader
        connectionStatus={connectionStatus}
        isPollingMode={isPollingMode}
        isLoading={isTickerLoading}
        onReconnect={reconnect}
        onRefresh={() => refetchTicker()}
      />

      {/* 거래량 합산 (전체 거래소) */}
      <AggregatedVolumeCard
        items={aggregatedVolumes}
        isLoading={isAggregatedLoading}
        onSelect={handleSelectCoin}
      />

      {/* 거래소 탭 + 검색 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 overflow-x-auto">
          {SUPPORTED_EXCHANGES.map((exchange) => {
            const isActive = selectedExchange === exchange;
            return (
              <Button
                key={exchange}
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedExchange(exchange)}
                aria-pressed={isActive}
                aria-label={`${getExchangeName(exchange, locale)} 시세 보기`}
              >
                {getExchangeName(exchange, locale)}
              </Button>
            );
          })}
        </div>

        {/* 검색 입력 */}
        <div className="relative w-full sm:w-64">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="text"
            placeholder={t.market.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            aria-label={t.common.search}
          />
        </div>
      </div>

      {/* 상승률/하락률 (선택된 거래소 기준) */}
      {enrichedTickers.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <HighlightCard
            title={t.market.topGainers}
            icon={TrendingUp}
            items={highlights.topGainers}
            valueFormatter={(ticker) => `${ticker.changeRate >= 0 ? '+' : ''}${ticker.changeRate.toFixed(2)}%`}
            valueColorize
            onSelect={handleSelectCoin}
          />
          <HighlightCard
            title={t.market.topLosers}
            icon={TrendingDown}
            items={highlights.topLosers}
            valueFormatter={(ticker) => `${ticker.changeRate >= 0 ? '+' : ''}${ticker.changeRate.toFixed(2)}%`}
            valueColorize
            onSelect={handleSelectCoin}
          />
        </div>
      )}

      {/* 시세 테이블 */}
      {isTickerLoading && enrichedTickers.length === 0 ? (
        <Card>
          <CardContent className="p-4">
            <TableRowSkeleton columns={5} rows={10} />
          </CardContent>
        </Card>
      ) : filteredTickers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="h-12 w-12 text-muted-foreground/50" aria-hidden="true" />
            <p className="mt-4 text-sm text-muted-foreground">
              {searchQuery.trim()
                ? t.market.noSearchResult(searchQuery)
                : t.market.noData}
            </p>
          </CardContent>
        </Card>
      ) : (
        <MarketTable
          tickers={filteredTickers}
          onSelectCoin={handleSelectCoin}
          isLoading={isTickerLoading}
        />
      )}
    </div>
  );
}

// ===== 서브 컴포넌트 =====

// ----- 마켓 헤더 -----

interface MarketHeaderProps {
  connectionStatus: string;
  isPollingMode: boolean;
  isLoading: boolean;
  onReconnect: () => void;
  onRefresh: () => void;
}

/**
 * 마켓 페이지 상단 헤더
 *
 * 페이지 타이틀, WebSocket 연결 상태, 새로고침 버튼을 표시한다.
 */
function MarketHeader({
  connectionStatus,
  isPollingMode,
  isLoading,
  onReconnect,
  onRefresh,
}: MarketHeaderProps) {
  const { t } = useTranslation();

  const isConnected = connectionStatus === 'connected';

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {t.nav.market}
        </h1>
        <div className="flex items-center gap-2 mt-1">
          {isConnected ? (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Wifi className="h-3 w-3 text-green-500" aria-hidden="true" />
              {t.market.realtime}
            </Badge>
          ) : isPollingMode ? (
            <Badge variant="secondary" className="gap-1 text-xs">
              <RefreshCw className="h-3 w-3 text-yellow-500" aria-hidden="true" />
              {t.market.pollingMode}
            </Badge>
          ) : (
            <button
              type="button"
              onClick={onReconnect}
              className="inline-flex items-center gap-1"
              aria-label={t.market.reconnect}
            >
              <Badge variant="destructive" className="gap-1 text-xs cursor-pointer">
                <WifiOff className="h-3 w-3" aria-hidden="true" />
                {t.market.disconnected}
              </Badge>
            </button>
          )}
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={isLoading}
        aria-label={t.dashboard.refresh}
      >
        <RefreshCw
          className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')}
          aria-hidden="true"
        />
        {t.dashboard.refresh}
      </Button>
    </div>
  );
}

// ----- 하이라이트 섹션 -----

/** 합산 거래량 항목 */
interface AggregatedVolumeItem {
  symbol: string;
  totalVolume: number;
}

// ----- 합산 거래량 카드 -----

interface AggregatedVolumeCardProps {
  items: AggregatedVolumeItem[];
  isLoading: boolean;
  onSelect: (symbol: string) => void;
}

/**
 * 전체 거래소 합산 거래량 상위 카드
 *
 * 기본 10개를 그리드로 표시하고, "더 보기"로 확장 가능하다.
 * 국내 거래소는 KRW 기준, 해외 거래소는 USDT→KRW 환산하여 합산한다.
 */
function AggregatedVolumeCard({ items, isLoading, onSelect }: AggregatedVolumeCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const displayCount = expanded ? VOLUME_EXPANDED_COUNT : VOLUME_DEFAULT_COUNT;
  const displayItems = items.slice(0, displayCount);
  const hasMore = items.length > displayCount;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t.market.topVolume}
          <Badge variant="secondary" className="text-[10px] font-normal">
            {t.market.topVolumeDomesticBadge}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <LoadingSpinner size="sm" />
          </div>
        ) : displayItems.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">
            {t.market.noDataShort}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
              {displayItems.map((item, index) => (
                <button
                  key={item.symbol}
                  type="button"
                  className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 hover:bg-muted/50 transition-colors"
                  onClick={() => onSelect(item.symbol)}
                  aria-label={item.symbol}
                >
                  <span className="text-xs font-bold text-muted-foreground w-4 text-right">{index + 1}</span>
                  <div className="text-left min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">{item.symbol}</div>
                    <div className="text-[11px] text-muted-foreground">{formatCompactKRW(item.totalVolume)}</div>
                  </div>
                </button>
              ))}
            </div>
            {(hasMore || expanded) && (
              <div className="mt-3 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-muted-foreground"
                >
                  {expanded ? t.common.collapse : t.common.showMore}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ----- 하이라이트 카드 -----

interface HighlightCardProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: Ticker[];
  valueFormatter: (ticker: Ticker) => string;
  valueColorize?: boolean;
  onSelect: (symbol: string) => void;
}

/**
 * 하이라이트 카드 컴포넌트
 *
 * 상위 N개 코인을 카드 형태로 표시한다.
 */
function HighlightCard({
  title,
  icon: Icon,
  items,
  valueFormatter,
  valueColorize = false,
  onSelect,
}: HighlightCardProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((ticker, index) => (
          <button
            key={ticker.symbol}
            type="button"
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 transition-colors"
            onClick={() => onSelect(ticker.symbol)}
            aria-label={ticker.symbol}
          >
            <div className="flex items-center gap-2">
              <span className="w-4 text-xs text-muted-foreground">{index + 1}</span>
              <span className="font-medium text-foreground">{ticker.symbol}</span>
            </div>
            <span
              className={cn(
                'text-xs font-medium',
                valueColorize
                  ? ticker.changeRate > 0
                    ? 'text-profit'
                    : ticker.changeRate < 0
                      ? 'text-loss'
                      : 'text-muted-foreground'
                  : 'text-foreground',
              )}
            >
              {valueFormatter(ticker)}
            </span>
          </button>
        ))}
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            {t.market.noDataShort}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ----- 시세 테이블 -----

interface MarketTableProps {
  tickers: Ticker[];
  onSelectCoin: (symbol: string) => void;
  isLoading: boolean;
}

/**
 * 거래소별 전체 코인 시세 테이블
 *
 * 코인명, 현재가, 24시간 변동률, 거래량을 테이블로 표시한다.
 * 행을 클릭하면 해당 코인의 상세 정보 페이지로 이동한다.
 *
 * @see 요구사항 5.1 (거래소별 전체 코인 시세 목록)
 */
function MarketTable({ tickers, onSelectCoin, isLoading }: MarketTableProps) {
  const { t } = useTranslation();

  // 정렬 상태
  const [sortKey, setSortKey] = useState<'symbol' | 'price' | 'change' | 'volume'>('volume');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const toggleSort = useCallback((key: 'symbol' | 'price' | 'change' | 'volume') => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }, [sortKey]);

  const sortedTickers = useMemo(() => {
    const sorted = [...tickers];
    const direction = sortDir === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'symbol':
          return direction * a.symbol.localeCompare(b.symbol);
        case 'price':
          return direction * (a.currentPrice - b.currentPrice);
        case 'change':
          return direction * (a.changeRate - b.changeRate);
        case 'volume':
          return direction * ((a.volumeAmount24h || a.volume24h * a.currentPrice) - (b.volumeAmount24h || b.volume24h * b.currentPrice));
        default:
          return 0;
      }
    });

    return sorted;
  }, [tickers, sortKey, sortDir]);

  const getSortIndicator = (key: string) => {
    if (sortKey !== key) return null;
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
  };

  return (
    <Card>
      <CardContent className="p-0">
        {/* 데스크톱 테이블 */}
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full" role="table" aria-label={t.nav.market}>
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left" scope="col">
                    <button
                      type="button"
                      className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => toggleSort('symbol')}
                      aria-label={t.market.sortByName}
                    >
                      {t.portfolio.coinName}{getSortIndicator('symbol')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right" scope="col">
                    <button
                      type="button"
                      className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => toggleSort('price')}
                      aria-label={t.market.sortByPrice}
                    >
                      {t.market.price}{getSortIndicator('price')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right" scope="col">
                    <button
                      type="button"
                      className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => toggleSort('change')}
                      aria-label={t.market.sortByChange}
                    >
                      {t.market.changeRate24h}{getSortIndicator('change')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right" scope="col">
                    <button
                      type="button"
                      className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => toggleSort('volume')}
                      aria-label={t.market.sortByVolume}
                    >
                      {t.market.volume24h}{getSortIndicator('volume')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedTickers.map((ticker) => (
                  <MarketTableRow
                    key={ticker.symbol}
                    ticker={ticker}
                    onSelect={() => onSelectCoin(ticker.symbol)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 모바일 카드 리스트 */}
        <div className="md:hidden divide-y divide-border">
          {sortedTickers.map((ticker) => (
            <MarketMobileCard
              key={ticker.symbol}
              ticker={ticker}
              onSelect={() => onSelectCoin(ticker.symbol)}
            />
          ))}
        </div>

        {/* 로딩 인디케이터 */}
        {isLoading && tickers.length > 0 && (
          <div className="border-t border-border p-3">
            <LoadingSpinner size="sm" message={t.market.refreshingTicker} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ----- 시세 테이블 행 (데스크톱) -----

interface MarketTableRowProps {
  ticker: Ticker;
  onSelect: () => void;
}

/**
 * 시세 테이블의 개별 행 (데스크톱)
 *
 * 코인 심볼, 현재가, 24시간 변동률, 거래량을 한 줄로 표시한다.
 */
function MarketTableRow({ ticker, onSelect }: MarketTableRowProps) {
  const { locale } = useTranslation();
  // MAJOR_COINS에서 코인 이름을 찾는다.
  const coinInfo = MAJOR_COINS.find((c) => c.symbol === ticker.symbol);

  return (
    <tr
      className="border-b border-border last:border-b-0 hover:bg-muted/50 cursor-pointer transition-colors"
      onClick={onSelect}
      role="row"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-label={ticker.symbol}
    >
      {/* 코인명 */}
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="font-semibold text-foreground">{ticker.symbol}</span>
          {coinInfo && (
            <span className="text-xs text-muted-foreground">{getCoinName(coinInfo, locale)}</span>
          )}
        </div>
      </td>

      {/* 현재가 */}
      <td className="px-4 py-3 text-right">
        <FormattedPrice value={ticker.currentPrice} symbol={ticker.symbol} className="font-medium" />
      </td>

      {/* 24시간 변동률 */}
      <td className="px-4 py-3 text-right">
        <FormattedPercent value={ticker.changeRate} colorize className="text-sm font-medium" />
      </td>

      {/* 거래량 (24h 거래금액) */}
      <td className="px-4 py-3 text-right">
        <span className="text-sm text-muted-foreground">
          {formatCompactKRW(ticker.volumeAmount24h || ticker.volume24h * ticker.currentPrice)}
        </span>
      </td>
    </tr>
  );
}

// ----- 시세 모바일 카드 -----

interface MarketMobileCardProps {
  ticker: Ticker;
  onSelect: () => void;
}

/**
 * 시세 모바일 카드
 *
 * 모바일 환경에서 코인 시세를 카드 형태로 표시한다.
 *
 * @see 요구사항 9.1 (모바일 최적화 레이아웃)
 */
function MarketMobileCard({ ticker, onSelect }: MarketMobileCardProps) {
  const { locale } = useTranslation();
  const coinInfo = MAJOR_COINS.find((c) => c.symbol === ticker.symbol);

  return (
    <button
      type="button"
      className="w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors"
      onClick={onSelect}
      aria-label={ticker.symbol}
    >
      {/* 상단: 코인명 + 변동률 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{ticker.symbol}</span>
          {coinInfo && (
            <span className="text-xs text-muted-foreground">{getCoinName(coinInfo, locale)}</span>
          )}
        </div>
        <FormattedPercent
          value={ticker.changeRate}
          colorize
          className="text-sm font-medium"
        />
      </div>

      {/* 하단: 현재가 + 거래량 */}
      <div className="mt-1 flex items-center justify-between">
        <FormattedPrice
          value={ticker.currentPrice}
          symbol={ticker.symbol}
          className="text-sm text-foreground"
        />
        <span className="text-xs text-muted-foreground">
          {formatCompactKRW(ticker.volumeAmount24h || ticker.volume24h * ticker.currentPrice)}
        </span>
      </div>
    </button>
  );
}

// ----- 코인 상세 뷰 -----

/**
 * BitScope 거래소 식별자를 TradingView 심볼 형식으로 변환한다.
 *
 * TradingView 형식: "EXCHANGE:BASECURRENCYQUOTECURRENCY"
 * 국내 거래소는 KRW 마켓, 해외 거래소는 USDT 마켓으로 매핑한다.
 */
function getTradingViewSymbol(exchange: ExchangeType, coinSymbol: string): string {
  const sym = coinSymbol.toUpperCase();
  switch (exchange) {
    case 'upbit':
      return `UPBIT:${sym}KRW`;
    case 'bithumb':
      return `BITHUMB:${sym}KRW`;
    case 'coinone':
      // 코인원은 TradingView에서 지원이 제한적 → 업비트 KRW 차트로 대체
      return `UPBIT:${sym}KRW`;
    case 'binance':
      return `BINANCE:${sym}USDT`;
    case 'bybit':
      return `BYBIT:${sym}USDT`;
    case 'okx':
      return `OKX:${sym}USDT`;
    case 'gate':
      return `GATEIO:${sym}USDT`;
    case 'bitget':
      return `BITGET:${sym}USDT`;
    case 'lbank':
      // LBank는 TradingView 미지원 → 바이낸스 USDT 차트로 대체
      return `BINANCE:${sym}USDT`;
    case 'hyperliquid':
      // 하이퍼리퀴드는 TradingView 미지원 → 바이낸스 USDT 차트로 대체
      return `BINANCE:${sym}USDT`;
    default:
      return `BINANCE:${sym}USDT`;
  }
}

interface CoinDetailViewProps {
  symbol: string;
  exchange: ExchangeType;
  onBack: () => void;
}

/**
 * 코인 상세 정보 화면
 *
 * 특정 코인의 상세 시세 정보를 표시한다:
 * - 현재가, 고가, 저가, 시가, 전일종가, 변동률
 * - 호가 정보 (매수/매도)
 * - 거래소 간 가격 비교
 *
 * @see 요구사항 5.4 (가격 차트, 호가 정보, 최근 체결 내역)
 */
function CoinDetailView({ symbol, exchange, onBack }: CoinDetailViewProps) {
  const { t, locale } = useTranslation();
  const [detailExchange, setDetailExchange] = useState<ExchangeType>(exchange);
  const coinInfo = MAJOR_COINS.find((c) => c.symbol === symbol);

  // 시세 데이터 조회
  const { data: tickerData, isLoading: isTickerLoading } = useExchangeTicker({
    exchange: detailExchange,
    symbols: [symbol],
    enabled: true,
    refetchInterval: 5_000, // 상세 뷰에서는 5초 간격
  });

  // 호가 데이터 조회
  const { data: orderbookData, isLoading: isOrderbookLoading } = useExchangeOrderbook({
    exchange: detailExchange,
    symbol,
    enabled: true,
    refetchInterval: 5_000,
  });

  // 전체 거래소의 시세를 병렬 조회하여 비교 표시
  const otherExchanges = SUPPORTED_EXCHANGES.filter((e) => e !== detailExchange);
  const otherTickerQueries = useQueries({
    queries: otherExchanges.map((ex) => ({
      queryKey: ['exchange', ex, 'ticker', symbol, 'detail'] as const,
      queryFn: () => fetchTicker(ex, [symbol]),
      enabled: true,
      refetchInterval: 10_000,
      staleTime: 5_000,
      retry: 1,
    })),
  });

  // 선택 거래소의 ticker (심볼로 정확히 찾기)
  const ticker = tickerData?.tickers?.find((t) => t.symbol === symbol) ?? tickerData?.tickers?.[0] ?? null;

  // 거래소 간 가격 비교 데이터 (전체 거래소)
  const exchangePrices = useMemo(() => {
    const prices: { exchange: ExchangeType; ticker: Ticker | null }[] = [];

    // 현재 선택된 거래소를 맨 위에
    prices.push({ exchange: detailExchange, ticker });

    // 나머지 거래소들 (심볼로 정확히 매칭)
    for (let i = 0; i < otherExchanges.length; i++) {
      const ex = otherExchanges[i]!;
      const query = otherTickerQueries[i];
      const tickers = query?.data?.tickers;
      const otherTicker = tickers?.find((t) => t.symbol === symbol) ?? null;
      if (otherTicker) {
        prices.push({ exchange: ex, ticker: otherTicker });
      }
    }

    return prices;
  }, [detailExchange, ticker, otherExchanges, otherTickerQueries, symbol]);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          aria-label={t.common.back}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {symbol}
            {coinInfo && (
              <span className="ml-2 text-lg font-normal text-muted-foreground">
                {getCoinName(coinInfo, locale)}
              </span>
            )}
          </h1>
        </div>
      </div>

      {/* 거래소 선택 탭 */}
      <div className="flex items-center gap-2">
        {SUPPORTED_EXCHANGES.map((ex) => {
          const isActive = detailExchange === ex;
          return (
            <Button
              key={ex}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDetailExchange(ex)}
              aria-pressed={isActive}
            >
              {getExchangeName(ex, locale)}
            </Button>
          );
        })}
      </div>

      {/* 시세 요약 (한 줄) */}
      {isTickerLoading && !ticker ? (
        <div className="flex items-center gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={`skeleton-detail-${i}`} className="h-5 w-20" />
          ))}
        </div>
      ) : ticker ? (
        <TickerDetailCard ticker={ticker} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {t.market.cannotFetchPrice(getExchangeName(detailExchange, locale), symbol)}
        </p>
      )}

      {/* 1행: 차트 + 호가 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_240px]">
        <Card className="overflow-hidden">
          <CardContent className="p-0 h-[420px]">
            <TradingViewChart
              symbol={getTradingViewSymbol(detailExchange, symbol)}
              interval="60"
              containerId={`market-detail-${detailExchange}-${symbol}`}
            />
          </CardContent>
        </Card>

        <OrderbookPanel
          orderbook={orderbookData?.orderbook ?? null}
          isLoading={isOrderbookLoading}
          symbol={symbol}
        />
      </div>

      {/* 2행: 거래소 간 가격 비교 (전체 너비) */}
      <ExchangeComparisonPanel
        symbol={symbol}
        exchangePrices={exchangePrices}
      />
    </div>
  );
}

// ----- 시세 상세 카드 -----

interface TickerDetailCardProps {
  ticker: Ticker;
}

/**
 * 코인 시세 상세 (한 줄 인라인)
 *
 * 현재가, 변동률, 시가, 고가, 저가, 전일종가, 거래량, 거래금액을 한 줄로 표시한다.
 */
function TickerDetailCard({ ticker }: TickerDetailCardProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-border bg-card px-4 py-2.5">
      {/* 현재가 (강조) */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{t.market.price}</span>
        <FormattedPrice value={ticker.currentPrice} symbol={ticker.symbol} className="text-sm font-bold" />
      </div>
      {/* 변동률 */}
      <FormattedPercent value={ticker.changeRate} colorize className="text-sm font-semibold" />
      {/* 시가 */}
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-muted-foreground">{t.market.openPrice}</span>
        <FormattedPrice value={ticker.openPrice} symbol={ticker.symbol} className="text-xs" />
      </div>
      {/* 고가 */}
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-muted-foreground">{t.market.highPrice}</span>
        <FormattedPrice value={ticker.highPrice} symbol={ticker.symbol} className="text-xs text-profit" />
      </div>
      {/* 저가 */}
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-muted-foreground">{t.market.lowPrice}</span>
        <FormattedPrice value={ticker.lowPrice} symbol={ticker.symbol} className="text-xs text-loss" />
      </div>
      {/* 전일종가 */}
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-muted-foreground">{t.market.prevClosePrice}</span>
        <FormattedPrice value={ticker.prevClosePrice} symbol={ticker.symbol} className="text-xs" />
      </div>
      {/* 구분선 */}
      <div className="hidden sm:block h-4 w-px bg-border" />
      {/* 거래량 */}
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-muted-foreground">{t.market.volume24hLabel}</span>
        <span className="text-xs font-medium">{formatVolume(ticker.volume24h)} {ticker.symbol}</span>
      </div>
      {/* 거래금액 */}
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-muted-foreground">{t.market.volumeAmount24h}</span>
        <span className="text-xs font-medium">{formatCompactKRW(ticker.volumeAmount24h)}</span>
      </div>
    </div>
  );
}

// ----- 호가 패널 -----

interface OrderbookPanelProps {
  orderbook: Orderbook | null;
  isLoading: boolean;
  symbol: string;
}

/**
 * 호가(Orderbook) 정보 패널
 *
 * 매수/매도 호가를 시각적으로 표시한다.
 * 호가 깊이를 배경 바(bar)로 표현하여 수량 비중을 직관적으로 파악할 수 있다.
 *
 * @see 요구사항 5.4 (호가 정보 표시)
 */
function OrderbookPanel({ orderbook, isLoading, symbol }: OrderbookPanelProps) {
  const { t } = useTranslation();
  if (isLoading && !orderbook) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{t.market.orderbookTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2" role="status" aria-label={t.market.orderbookLoading}>
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={`ob-skeleton-${i}`} className="h-6 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!orderbook) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{t.market.orderbookTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            {t.market.orderbookNoData}
          </p>
        </CardContent>
      </Card>
    );
  }

  // 호가 표시 (매도 5개 + 매수 5개)
  const asks = orderbook.asks.slice(0, 5).reverse();
  const bids = orderbook.bids.slice(0, 5);

  // 최대 수량 계산 (바 너비 기준)
  const allEntries = [...asks, ...bids];
  const maxQuantity = allEntries.length > 0
    ? Math.max(...allEntries.map((e) => e.quantity))
    : 1;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">{t.market.orderbookTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-0.5" role="table" aria-label={`${symbol} 호가`}>
          {/* 헤더 */}
          <div className="flex items-center justify-between px-2 pb-2 text-xs text-muted-foreground" role="row">
            <span role="columnheader">{t.market.orderbookPriceKRW}</span>
            <span role="columnheader">{t.market.orderbookQuantity(symbol)}</span>
          </div>

          {/* 매도 호가 (빨간색) */}
          {asks.map((entry, index) => (
            <div
              key={`ask-${index}`}
              className="relative flex items-center justify-between rounded px-2 py-1"
              role="row"
            >
              <div
                className="absolute inset-y-0 right-0 bg-loss/10 rounded"
                style={{ width: `${(entry.quantity / maxQuantity) * 100}%` }}
                aria-hidden="true"
              />
              <span className="relative text-xs font-medium text-loss">
                {entry.price.toLocaleString('ko-KR')}
              </span>
              <span className="relative text-xs text-muted-foreground">
                {entry.quantity.toFixed(4)}
              </span>
            </div>
          ))}

          {/* 스프레드 구분선 */}
          {asks.length > 0 && bids.length > 0 && (
            <div className="flex items-center justify-center py-1.5">
              <div className="h-px flex-1 bg-border" aria-hidden="true" />
              <span className="mx-3 text-xs font-medium text-muted-foreground">
                {t.market.orderbookSpread}: {(asks[asks.length - 1]!.price - bids[0]!.price).toLocaleString('ko-KR')} KRW
              </span>
              <div className="h-px flex-1 bg-border" aria-hidden="true" />
            </div>
          )}

          {/* 매수 호가 (녹색) */}
          {bids.map((entry, index) => (
            <div
              key={`bid-${index}`}
              className="relative flex items-center justify-between rounded px-2 py-1"
              role="row"
            >
              <div
                className="absolute inset-y-0 right-0 bg-profit/10 rounded"
                style={{ width: `${(entry.quantity / maxQuantity) * 100}%` }}
                aria-hidden="true"
              />
              <span className="relative text-xs font-medium text-profit">
                {entry.price.toLocaleString('ko-KR')}
              </span>
              <span className="relative text-xs text-muted-foreground">
                {entry.quantity.toFixed(4)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ----- 거래소 간 가격 비교 패널 -----

interface ExchangeComparisonPanelProps {
  symbol: string;
  exchangePrices: { exchange: ExchangeType; ticker: Ticker | null }[];
}

/** 해외 거래소인지 확인 (USDT/USDC 기준 → KRW 환산 필요) */
function isForeignOrDex(exchange: ExchangeType): boolean {
  return (FOREIGN_EXCHANGES as readonly string[]).includes(exchange)
    || exchange === 'hyperliquid';
}

/**
 * 거래소 간 가격 비교 패널
 *
 * 동일 코인의 거래소별 가격을 가로 그리드로 비교하여 표시한다.
 * 해외 거래소(USDT)는 환율을 적용하여 KRW로 환산 후 비교한다.
 * 가장 높은 가격과 가장 낮은 가격을 하이라이트한다.
 * 전체 너비 레이아웃으로 스크롤 없이 한눈에 비교 가능하다.
 */
function ExchangeComparisonPanel({ symbol: _symbol, exchangePrices }: ExchangeComparisonPanelProps) {
  const { t, locale } = useTranslation();

  // USDT/KRW 환율 조회
  const { data: rate = 0 } = useQuery({
    queryKey: ['usdtKrwRate'],
    queryFn: getUsdtKrwRate,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // KRW 환산 가격 계산
  const pricesInKrw = useMemo(() => {
    return exchangePrices
      .filter((ep) => ep.ticker !== null)
      .map((ep) => {
        const foreign = isForeignOrDex(ep.exchange);
        const krwPrice = foreign && rate > 0
          ? ep.ticker!.currentPrice * rate
          : ep.ticker!.currentPrice;
        return { ...ep, ticker: ep.ticker!, krwPrice, isForeign: foreign };
      });
  }, [exchangePrices, rate]);

  const maxKrw = pricesInKrw.length > 0
    ? Math.max(...pricesInKrw.map((p) => p.krwPrice))
    : 0;
  const minKrw = pricesInKrw.length > 0
    ? Math.min(...pricesInKrw.map((p) => p.krwPrice))
    : 0;

  const priceDiff = maxKrw - minKrw;
  const priceDiffRate = minKrw > 0 ? (priceDiff / minKrw) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            {t.market.exchangeComparison}
          </CardTitle>
          {/* 가격 차이 요약 */}
          {pricesInKrw.length > 1 && priceDiff > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">{t.market.maxPriceDiff}</span>
              <FormattedCurrency value={priceDiff} className="font-medium" />
              <span className="text-muted-foreground">
                ({priceDiffRate.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {pricesInKrw.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t.market.exchangeComparisonNoData}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {pricesInKrw.map(({ exchange: ex, ticker: tk, krwPrice, isForeign }) => {
              const isMax = krwPrice === maxKrw && pricesInKrw.length > 1;
              const isMin = krwPrice === minKrw && pricesInKrw.length > 1;

              return (
                <div
                  key={ex}
                  className={cn(
                    'rounded-lg border px-3 py-2.5',
                    isMax && 'border-profit/50 bg-profit/5',
                    isMin && 'border-loss/50 bg-loss/5',
                    !isMax && !isMin && 'border-border',
                  )}
                >
                  {/* 거래소명 + 뱃지 */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-medium text-foreground truncate">
                      {getExchangeName(ex, locale)}
                    </span>
                    {isMax && (
                      <Badge className="bg-profit/20 text-profit text-[9px] px-1 py-0 h-3.5 shrink-0">
                        {t.market.highestPrice}
                      </Badge>
                    )}
                    {isMin && (
                      <Badge className="bg-loss/20 text-loss text-[9px] px-1 py-0 h-3.5 shrink-0">
                        {t.market.lowestPrice}
                      </Badge>
                    )}
                  </div>
                  {/* KRW 가격 */}
                  <FormattedCurrency value={krwPrice} className="text-sm font-semibold" />
                  {/* USDT 원가 + 변동률 */}
                  <div className="flex items-center justify-between mt-0.5">
                    {isForeign ? (
                      <span className="text-[10px] text-muted-foreground">
                        {tk.currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
                      </span>
                    ) : (
                      <span />
                    )}
                    <FormattedPercent
                      value={tk.changeRate}
                      colorize
                      className="text-[11px]"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
