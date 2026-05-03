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
import type { ExchangeType, Ticker, Orderbook } from '@bitscope/shared';
import {
  SUPPORTED_EXCHANGES,
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

/** 하이라이트 섹션에 표시할 코인 수 */
const HIGHLIGHT_COUNT = 5;

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

  // 하이라이트 데이터 계산
  const highlights = useMemo(() => {
    if (enrichedTickers.length === 0) return { topVolume: [], topGainers: [], topLosers: [] };

    const sorted = [...enrichedTickers];

    const topVolume = [...sorted]
      .sort((a, b) => (b.volumeAmount24h || b.volume24h) - (a.volumeAmount24h || a.volume24h))
      .slice(0, HIGHLIGHT_COUNT);

    const topGainers = [...sorted]
      .sort((a, b) => b.changeRate - a.changeRate)
      .slice(0, HIGHLIGHT_COUNT);

    const topLosers = [...sorted]
      .sort((a, b) => a.changeRate - b.changeRate)
      .slice(0, HIGHLIGHT_COUNT);

    return { topVolume, topGainers, topLosers };
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

      {/* 하이라이트 섹션 */}
      {enrichedTickers.length > 0 && (
        <HighlightSection
          topVolume={highlights.topVolume}
          topGainers={highlights.topGainers}
          topLosers={highlights.topLosers}
          onSelectCoin={handleSelectCoin}
        />
      )}

      {/* 거래소 탭 + 검색 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
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

interface HighlightSectionProps {
  topVolume: Ticker[];
  topGainers: Ticker[];
  topLosers: Ticker[];
  onSelectCoin: (symbol: string) => void;
}

/**
 * 거래량 상위, 상승률 상위, 하락률 상위 코인 하이라이트
 *
 * @see 요구사항 5.5 (거래량 상위, 상승률 상위, 하락률 상위 하이라이트)
 */
function HighlightSection({
  topVolume,
  topGainers,
  topLosers,
  onSelectCoin,
}: HighlightSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <HighlightCard
        title={t.market.topVolume}
        icon={BarChart3}
        items={topVolume}
        valueFormatter={(ticker) => formatCompactKRW(ticker.volumeAmount24h || ticker.volume24h * ticker.currentPrice)}
        onSelect={onSelectCoin}
      />
      <HighlightCard
        title={t.market.topGainers}
        icon={TrendingUp}
        items={topGainers}
        valueFormatter={(ticker) => `${ticker.changeRate >= 0 ? '+' : ''}${ticker.changeRate.toFixed(2)}%`}
        valueColorize
        onSelect={onSelectCoin}
      />
      <HighlightCard
        title={t.market.topLosers}
        icon={TrendingDown}
        items={topLosers}
        valueFormatter={(ticker) => `${ticker.changeRate >= 0 ? '+' : ''}${ticker.changeRate.toFixed(2)}%`}
        valueColorize
        onSelect={onSelectCoin}
      />
    </div>
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

  // 다른 거래소들의 시세도 조회하여 비교 표시
  const otherExchanges = SUPPORTED_EXCHANGES.filter((e) => e !== detailExchange);
  const { data: otherTicker1 } = useExchangeTicker({
    exchange: otherExchanges[0]!,
    symbols: [symbol],
    enabled: !!otherExchanges[0],
    refetchInterval: 10_000,
  });
  const { data: otherTicker2 } = useExchangeTicker({
    exchange: otherExchanges[1]!,
    symbols: [symbol],
    enabled: !!otherExchanges[1],
    refetchInterval: 10_000,
  });

  // 선택 거래소의 ticker
  const ticker = tickerData?.tickers?.[0] ?? null;

  // 거래소 간 가격 비교 데이터
  const exchangePrices = useMemo(() => {
    const prices: { exchange: ExchangeType; ticker: Ticker | null }[] = [];

    prices.push({ exchange: detailExchange, ticker });

    if (otherExchanges[0] && otherTicker1?.tickers?.[0]) {
      prices.push({ exchange: otherExchanges[0], ticker: otherTicker1.tickers[0] });
    }
    if (otherExchanges[1] && otherTicker2?.tickers?.[0]) {
      prices.push({ exchange: otherExchanges[1], ticker: otherTicker2.tickers[0] });
    }

    return prices;
  }, [detailExchange, ticker, otherExchanges, otherTicker1, otherTicker2]);

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

      {/* 시세 요약 */}
      {isTickerLoading && !ticker ? (
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={`skeleton-detail-${i}`} className="space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-6 w-24" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : ticker ? (
        <TickerDetailCard ticker={ticker} />
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">
              {t.market.cannotFetchPrice(getExchangeName(detailExchange, locale), symbol)}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 호가 정보 */}
        <OrderbookPanel
          orderbook={orderbookData?.orderbook ?? null}
          isLoading={isOrderbookLoading}
          symbol={symbol}
        />

        {/* 거래소 간 가격 비교 */}
        <ExchangeComparisonPanel
          symbol={symbol}
          exchangePrices={exchangePrices}
        />
      </div>
    </div>
  );
}

// ----- 시세 상세 카드 -----

interface TickerDetailCardProps {
  ticker: Ticker;
}

/**
 * 코인 시세 상세 카드
 *
 * 현재가, 시가, 고가, 저가, 전일 종가, 변동률, 거래량을 그리드로 표시한다.
 */
function TickerDetailCard({ ticker }: TickerDetailCardProps) {
  const { t } = useTranslation();
  const items = [
    { label: t.market.price, value: ticker.currentPrice, isPrice: true },
    { label: t.market.openPrice, value: ticker.openPrice, isPrice: true },
    { label: t.market.highPrice, value: ticker.highPrice, isPrice: true, highlight: 'high' as const },
    { label: t.market.lowPrice, value: ticker.lowPrice, isPrice: true, highlight: 'low' as const },
    { label: t.market.prevClosePrice, value: ticker.prevClosePrice, isPrice: true },
    { label: t.market.changeRate24h, value: ticker.changeRate, isPercent: true },
  ];

  return (
    <Card>
      <CardContent className="p-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {items.map((item) => (
            <div key={item.label}>
              <p className="text-xs text-muted-foreground">{item.label}</p>
              {item.isPercent ? (
                <FormattedPercent
                  value={item.value}
                  colorize
                  className="text-lg font-semibold"
                />
              ) : item.isPrice ? (
                <FormattedPrice
                  value={item.value}
                  symbol={ticker.symbol}
                  className={cn(
                    'text-lg font-semibold',
                    item.highlight === 'high' && 'text-profit',
                    item.highlight === 'low' && 'text-loss',
                  )}
                />
              ) : null}
            </div>
          ))}
        </div>

        {/* 거래량 정보 */}
        <div className="mt-4 flex items-center gap-6 border-t border-border pt-4">
          <div>
            <p className="text-xs text-muted-foreground">{t.market.volume24hLabel}</p>
            <p className="text-sm font-medium text-foreground">
              {formatVolume(ticker.volume24h)} {ticker.symbol}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t.market.volumeAmount24h}</p>
            <p className="text-sm font-medium text-foreground">
              {formatCompactKRW(ticker.volumeAmount24h)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
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

/**
 * 거래소 간 가격 비교 패널
 *
 * 동일 코인의 거래소별 가격을 비교하여 표시한다.
 * 가장 높은 가격과 가장 낮은 가격을 하이라이트한다.
 */
function ExchangeComparisonPanel({ symbol, exchangePrices }: ExchangeComparisonPanelProps) {
  const { t, locale } = useTranslation();
  const validPrices = exchangePrices.filter((ep) => ep.ticker !== null);

  const maxPrice = validPrices.length > 0
    ? Math.max(...validPrices.map((ep) => ep.ticker!.currentPrice))
    : 0;
  const minPrice = validPrices.length > 0
    ? Math.min(...validPrices.map((ep) => ep.ticker!.currentPrice))
    : 0;

  const priceDiff = maxPrice - minPrice;
  const priceDiffRate = minPrice > 0 ? (priceDiff / minPrice) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          {t.market.exchangeComparison}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {validPrices.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t.market.exchangeComparisonNoData}
          </p>
        ) : (
          <div className="space-y-3">
            {/* 거래소별 가격 */}
            {exchangePrices.map(({ exchange: ex, ticker: tk }) => {
              const isMax = tk && tk.currentPrice === maxPrice && validPrices.length > 1;
              const isMin = tk && tk.currentPrice === minPrice && validPrices.length > 1;

              return (
                <div
                  key={ex}
                  className={cn(
                    'flex items-center justify-between rounded-lg border px-4 py-3',
                    isMax && 'border-profit/50 bg-profit/5',
                    isMin && 'border-loss/50 bg-loss/5',
                    !isMax && !isMin && 'border-border',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {getExchangeName(ex, locale)}
                    </Badge>
                    {isMax && (
                      <Badge className="bg-profit/20 text-profit text-[10px] px-1.5">
                        {t.market.highestPrice}
                      </Badge>
                    )}
                    {isMin && (
                      <Badge className="bg-loss/20 text-loss text-[10px] px-1.5">
                        {t.market.lowestPrice}
                      </Badge>
                    )}
                  </div>
                  {tk ? (
                    <div className="text-right">
                      <FormattedPrice
                        value={tk.currentPrice}
                        symbol={symbol}
                        className="font-medium"
                      />
                      <FormattedPercent
                        value={tk.changeRate}
                        colorize
                        className="text-xs"
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t.market.noDataShort}
                    </span>
                  )}
                </div>
              );
            })}

            {/* 가격 차이 요약 */}
            {validPrices.length > 1 && priceDiff > 0 && (
              <div className="mt-2 rounded-lg bg-muted/50 px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t.market.maxPriceDiff}</span>
                  <div className="text-right">
                    <FormattedCurrency value={priceDiff} className="font-medium" />
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({priceDiffRate.toFixed(2)}%)
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
