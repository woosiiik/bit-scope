/**
 * 워치리스트(관심 코인) 페이지
 *
 * 사용자가 관심 목록에 추가한 코인의 실시간 시세를 추적한다.
 * 코인 추가/제거, 실시간 시세 업데이트, 가격 알림 설정 연동을 제공한다.
 *
 * 주요 기능:
 * - 관심 코인 목록 표시 (현재가, 24시간 변동률, 거래량 실시간 업데이트)
 * - 코인 추가/제거 기능 (localStorage에 지갑 주소별 저장)
 * - 관심 코인 가격 알림 설정 연동
 * - 대시보드 상단 또는 별도 섹션 표시
 *
 * @see 요구사항 10.1 (관심 코인 추가 시 워치리스트 저장 및 표시)
 * @see 요구사항 10.2 (현재가, 24시간 변동률, 거래량 실시간 업데이트)
 * @see 요구사항 10.3 (관심 코인 가격 알림 설정)
 * @see 요구사항 10.4 (워치리스트에서 코인 제거)
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Star,
  StarOff,
  Plus,
  Trash2,
  Search,
  Bell,
  RefreshCw,
  Wifi,
  WifiOff,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import type { ExchangeType } from '@bitscope/shared';
import {
  MAJOR_COINS,
  MAJOR_COIN_SYMBOLS,
  EXCHANGE_CONFIGS,
  SUPPORTED_EXCHANGES,
  formatCompactKRW,
} from '@bitscope/shared';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useRealTimePrice } from '@/hooks/useRealTimePrice';
import { usePriceStore, type PriceEntry } from '@/store/price-store';
import { useExchangeTicker } from '@/hooks/useExchangeApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  FormattedPrice,
  FormattedPercent,
} from '@/components/ui/formatted-number';
import { Skeleton, TableRowSkeleton } from '@/components/ui/skeleton';

// ===== 상수 =====

/** 기본 거래소 (시세 조회용) */
const DEFAULT_EXCHANGE: ExchangeType = 'upbit';

// ===== 메인 페이지 =====

export default function WatchlistPage() {
  const { t } = useTranslation();
  const { wallet } = useWalletAuth();

  // 지갑 미연결 시 안내
  if (!wallet.isConnected || !wallet.address) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[60vh]">
        <StarOff className="h-12 w-12 text-muted-foreground/50" aria-hidden="true" />
        <h2 className="mt-4 text-lg font-semibold text-foreground">
          {t.wallet.authRequired.title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t.wallet.authRequired.description}
        </p>
      </div>
    );
  }

  return <WatchlistContent walletAddress={wallet.address} />;
}

// ===== 워치리스트 콘텐츠 =====

interface WatchlistContentProps {
  walletAddress: string;
}

/**
 * 워치리스트 메인 콘텐츠
 *
 * 지갑이 연결된 상태에서 워치리스트 관리 UI를 렌더링한다.
 */
function WatchlistContent({ walletAddress }: WatchlistContentProps) {
  const { t } = useTranslation();

  // 워치리스트 관리 훅
  const {
    watchlist,
    watchlistSymbols,
    addCoin,
    removeCoin,
    isInWatchlist,
    count,
  } = useWatchlist({ walletAddress });

  // 코인 추가 다이얼로그 상태
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 실시간 시세 구독 (워치리스트 심볼 + 주요 코인)
  const symbolsToSubscribe = useMemo(() => {
    const allSymbols = new Set(watchlistSymbols);
    // 추가 폼이 열려있을 때 주요 코인도 구독하여 시세를 표시한다
    if (showAddForm) {
      for (const symbol of MAJOR_COIN_SYMBOLS) {
        allSymbols.add(symbol as string);
      }
    }
    return Array.from(allSymbols);
  }, [watchlistSymbols, showAddForm]);

  const { connectionStatus, isPollingMode, reconnect } = useRealTimePrice({
    symbols: symbolsToSubscribe,
    enabled: symbolsToSubscribe.length > 0,
  });

  // REST 시세 조회 (기본 거래소)
  const { data: tickerData, isLoading: isTickerLoading, refetch: refetchTicker } = useExchangeTicker({
    exchange: DEFAULT_EXCHANGE,
    enabled: true,
    refetchInterval: 10_000,
  });

  // 실시간 가격 데이터 (store에서 가져온다)
  const getPricesBySymbol = usePriceStore((s) => s.getPricesBySymbol);

  // 워치리스트 코인의 가격 데이터를 구성한다
  const watchlistWithPrices = useMemo(() => {
    return watchlist.map((item) => {
      // 실시간 데이터에서 가격을 찾는다 (기본 거래소 우선)
      const prices = getPricesBySymbol(item.symbol);
      const defaultPrice = prices.find((p) => p.exchange === DEFAULT_EXCHANGE);
      const bestPrice = defaultPrice ?? prices[0] ?? null;

      // REST ticker에서도 가격을 찾는다 (실시간 데이터가 없을 경우 폴백)
      let tickerPrice: { currentPrice: number; changeRate: number; volume24h: number; volumeAmount24h: number } | null = null;
      if (tickerData?.tickers) {
        const found = tickerData.tickers.find(
          (tk: { symbol: string }) => tk.symbol === item.symbol,
        );
        if (found) {
          tickerPrice = {
            currentPrice: found.currentPrice,
            changeRate: found.changeRate,
            volume24h: found.volume24h,
            volumeAmount24h: found.volumeAmount24h,
          };
        }
      }

      return {
        ...item,
        price: bestPrice?.price ?? tickerPrice?.currentPrice ?? null,
        changeRate: bestPrice?.changeRate ?? tickerPrice?.changeRate ?? null,
        volume24h: bestPrice?.volume24h ?? tickerPrice?.volume24h ?? null,
        volumeAmount24h: tickerPrice?.volumeAmount24h ?? null,
        exchange: bestPrice?.exchange ?? DEFAULT_EXCHANGE,
      };
    });
  }, [watchlist, getPricesBySymbol, tickerData]);

  // 코인 추가 핸들러
  const handleAddCoin = useCallback(
    (symbol: string) => {
      addCoin(symbol);
    },
    [addCoin],
  );

  // 코인 제거 핸들러
  const handleRemoveCoin = useCallback(
    (symbol: string) => {
      if (window.confirm(t.watchlist.removeCoinConfirm)) {
        removeCoin(symbol);
      }
    },
    [removeCoin, t.watchlist.removeCoinConfirm],
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 헤더 */}
      <WatchlistHeader
        coinCount={count}
        connectionStatus={connectionStatus}
        isPollingMode={isPollingMode}
        isLoading={isTickerLoading}
        onReconnect={reconnect}
        onRefresh={() => refetchTicker()}
        onShowAddForm={() => setShowAddForm(true)}
      />

      {/* 코인 추가 폼 */}
      {showAddForm && (
        <AddCoinSection
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          isInWatchlist={isInWatchlist}
          onAddCoin={handleAddCoin}
          onClose={() => {
            setShowAddForm(false);
            setSearchQuery('');
          }}
          tickerData={tickerData}
          getPricesBySymbol={getPricesBySymbol}
        />
      )}

      {/* 워치리스트 목록 */}
      {count === 0 ? (
        <EmptyWatchlist onShowAddForm={() => setShowAddForm(true)} />
      ) : (
        <WatchlistTable
          items={watchlistWithPrices}
          isLoading={isTickerLoading && watchlistWithPrices.length === 0}
          onRemoveCoin={handleRemoveCoin}
          walletAddress={walletAddress}
        />
      )}
    </div>
  );
}

// ===== 서브 컴포넌트 =====

// ----- 헤더 -----

interface WatchlistHeaderProps {
  coinCount: number;
  connectionStatus: string;
  isPollingMode: boolean;
  isLoading: boolean;
  onReconnect: () => void;
  onRefresh: () => void;
  onShowAddForm: () => void;
}

/**
 * 워치리스트 페이지 상단 헤더
 *
 * 페이지 타이틀, WebSocket 연결 상태, 코인 추가 버튼을 표시한다.
 */
function WatchlistHeader({
  coinCount,
  connectionStatus,
  isPollingMode,
  isLoading,
  onReconnect,
  onRefresh,
  onShowAddForm,
}: WatchlistHeaderProps) {
  const { t } = useTranslation();
  const isConnected = connectionStatus === 'connected';

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {t.watchlist.title}
        </h1>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm text-muted-foreground">
            {t.watchlist.coinCount(coinCount)}
          </span>
          {coinCount > 0 && (
            <>
              {isConnected ? (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Wifi className="h-3 w-3 text-green-500" aria-hidden="true" />
                  {t.watchlist.realtime}
                </Badge>
              ) : isPollingMode ? (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <RefreshCw className="h-3 w-3 text-yellow-500" aria-hidden="true" />
                  {t.watchlist.pollingMode}
                </Badge>
              ) : (
                <button
                  type="button"
                  onClick={onReconnect}
                  className="inline-flex items-center gap-1"
                  aria-label="WebSocket 재연결"
                >
                  <Badge variant="destructive" className="gap-1 text-xs cursor-pointer">
                    <WifiOff className="h-3 w-3" aria-hidden="true" />
                    {t.watchlist.disconnected}
                  </Badge>
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
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
        <Button
          size="sm"
          onClick={onShowAddForm}
          aria-label={t.watchlist.addCoin}
        >
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          {t.watchlist.addCoin}
        </Button>
      </div>
    </div>
  );
}

// ----- 빈 워치리스트 -----

interface EmptyWatchlistProps {
  onShowAddForm: () => void;
}

/**
 * 워치리스트가 비어있을 때 표시되는 안내 컴포넌트
 */
function EmptyWatchlist({ onShowAddForm }: EmptyWatchlistProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16">
        <Star className="h-16 w-16 text-muted-foreground/30" aria-hidden="true" />
        <h2 className="mt-4 text-lg font-semibold text-foreground">
          {t.watchlist.noCoinInList}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground text-center max-w-md">
          {t.watchlist.noCoinInListDescription}
        </p>
        <Button className="mt-6" onClick={onShowAddForm}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          {t.watchlist.addCoin}
        </Button>
      </CardContent>
    </Card>
  );
}

// ----- 코인 추가 섹션 -----

interface AddCoinSectionProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isInWatchlist: (symbol: string) => boolean;
  onAddCoin: (symbol: string) => void;
  onClose: () => void;
  tickerData: { tickers?: { symbol: string; currentPrice: number; changeRate: number }[] } | undefined;
  getPricesBySymbol: (symbol: string) => PriceEntry[];
}

/**
 * 코인 추가 섹션
 *
 * 주요 코인 목록에서 워치리스트에 추가할 코인을 선택한다.
 * 검색 필터를 통해 빠르게 코인을 찾을 수 있다.
 *
 * @see 요구사항 10.1 (관심 목록에 추가)
 */
function AddCoinSection({
  searchQuery,
  onSearchChange,
  isInWatchlist,
  onAddCoin,
  onClose,
  tickerData,
  getPricesBySymbol,
}: AddCoinSectionProps) {
  const { t } = useTranslation();

  // 검색 필터 적용된 코인 목록
  const filteredCoins = useMemo(() => {
    const query = searchQuery.trim().toUpperCase();
    if (!query) return [...MAJOR_COINS];

    return MAJOR_COINS.filter(
      (coin) =>
        coin.symbol.includes(query) ||
        coin.nameKo.includes(searchQuery.trim()) ||
        coin.nameEn.toUpperCase().includes(query),
    );
  }, [searchQuery]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">
            {t.watchlist.addCoin}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label={t.common.close}
          >
            {t.common.close}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* 검색 입력 */}
        <div className="relative mb-4">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="text"
            placeholder={t.watchlist.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
            aria-label={t.common.search}
          />
        </div>

        {/* 코인 그리드 */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCoins.map((coin) => {
            const inWatchlist = isInWatchlist(coin.symbol);

            // 가격 데이터 가져오기
            const realtimePrices = getPricesBySymbol(coin.symbol);
            const defaultRealtimePrice = realtimePrices.find(
              (p) => p.exchange === DEFAULT_EXCHANGE,
            );
            const realtimePrice = defaultRealtimePrice ?? realtimePrices[0];

            let price: number | null = null;
            let changeRate: number | null = null;

            if (realtimePrice) {
              price = realtimePrice.price;
              changeRate = realtimePrice.changeRate;
            } else if (tickerData?.tickers) {
              const ticker = tickerData.tickers.find(
                (tk: { symbol: string }) => tk.symbol === coin.symbol,
              );
              if (ticker) {
                price = ticker.currentPrice;
                changeRate = ticker.changeRate;
              }
            }

            return (
              <button
                key={coin.symbol}
                type="button"
                onClick={() => {
                  if (!inWatchlist) {
                    onAddCoin(coin.symbol);
                  }
                }}
                disabled={inWatchlist}
                className={cn(
                  'flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors',
                  inWatchlist
                    ? 'border-primary/30 bg-primary/5 cursor-default'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50 cursor-pointer',
                )}
                aria-label={`${coin.symbol} ${coin.nameKo}`}
              >
                <div className="flex items-center gap-3">
                  {inWatchlist ? (
                    <Star className="h-4 w-4 fill-primary text-primary shrink-0" aria-hidden="true" />
                  ) : (
                    <Star className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                  )}
                  <div>
                    <span className="font-semibold text-foreground">{coin.symbol}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">{coin.nameKo}</span>
                  </div>
                </div>
                <div className="text-right">
                  {price !== null ? (
                    <div className="flex flex-col items-end">
                      <FormattedPrice
                        value={price}
                        symbol={coin.symbol}
                        className="text-sm font-medium"
                      />
                      {changeRate !== null && (
                        <FormattedPercent
                          value={changeRate}
                          colorize
                          className="text-xs"
                        />
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">--</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {filteredCoins.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8">
            <Search className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
            <p className="mt-2 text-sm text-muted-foreground">
              {t.market.noSearchResult(searchQuery)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ----- 워치리스트 테이블 -----

/** 워치리스트 항목 + 가격 정보 */
interface WatchlistItemWithPrice {
  symbol: string;
  addedAt: Date;
  price: number | null;
  changeRate: number | null;
  volume24h: number | null;
  volumeAmount24h: number | null;
  exchange: ExchangeType;
}

interface WatchlistTableProps {
  items: WatchlistItemWithPrice[];
  isLoading: boolean;
  onRemoveCoin: (symbol: string) => void;
  walletAddress: string;
}

/**
 * 워치리스트 테이블
 *
 * 관심 코인 목록을 데스크톱에서는 테이블, 모바일에서는 카드로 표시한다.
 * 현재가, 24시간 변동률, 거래량을 실시간으로 업데이트한다.
 *
 * @see 요구사항 10.2 (현재가, 24시간 변동률, 거래량 실시간 업데이트)
 */
function WatchlistTable({ items, isLoading, onRemoveCoin, walletAddress }: WatchlistTableProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <TableRowSkeleton columns={5} rows={5} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        {/* 데스크톱 테이블 */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full" role="table" aria-label={t.watchlist.title}>
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground" scope="col">
                  {t.portfolio.coinName}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground" scope="col">
                  {t.market.price}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground" scope="col">
                  {t.market.changeRate24h}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground" scope="col">
                  {t.market.volume24h}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground" scope="col">
                  {/* 액션 */}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <WatchlistTableRow
                  key={item.symbol}
                  item={item}
                  onRemove={() => onRemoveCoin(item.symbol)}
                  walletAddress={walletAddress}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* 모바일 카드 */}
        <div className="md:hidden divide-y divide-border">
          {items.map((item) => (
            <WatchlistMobileCard
              key={item.symbol}
              item={item}
              onRemove={() => onRemoveCoin(item.symbol)}
              walletAddress={walletAddress}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ----- 워치리스트 테이블 행 (데스크톱) -----

interface WatchlistTableRowProps {
  item: WatchlistItemWithPrice;
  onRemove: () => void;
  walletAddress: string;
}

/**
 * 워치리스트 테이블의 개별 행 (데스크톱)
 *
 * 코인 심볼, 현재가, 24시간 변동률, 거래량, 액션 버튼을 표시한다.
 */
function WatchlistTableRow({ item, onRemove, walletAddress }: WatchlistTableRowProps) {
  const { t } = useTranslation();
  const coinInfo = MAJOR_COINS.find((c) => c.symbol === item.symbol);
  const [showAlertLink, setShowAlertLink] = useState(false);

  return (
    <tr
      className="border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors"
      onMouseEnter={() => setShowAlertLink(true)}
      onMouseLeave={() => setShowAlertLink(false)}
    >
      {/* 코인명 */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 fill-primary text-primary shrink-0" aria-hidden="true" />
          <div className="flex flex-col">
            <span className="font-semibold text-foreground">{item.symbol}</span>
            {coinInfo && (
              <span className="text-xs text-muted-foreground">{coinInfo.nameKo}</span>
            )}
          </div>
        </div>
      </td>

      {/* 현재가 */}
      <td className="px-4 py-3 text-right">
        {item.price !== null ? (
          <FormattedPrice value={item.price} symbol={item.symbol} className="font-medium" />
        ) : (
          <span className="text-sm text-muted-foreground">--</span>
        )}
      </td>

      {/* 24시간 변동률 */}
      <td className="px-4 py-3 text-right">
        {item.changeRate !== null ? (
          <FormattedPercent value={item.changeRate} colorize className="text-sm font-medium" />
        ) : (
          <span className="text-sm text-muted-foreground">--</span>
        )}
      </td>

      {/* 거래량 */}
      <td className="px-4 py-3 text-right">
        {item.volume24h !== null ? (
          <span className="text-sm text-muted-foreground">
            {formatCompactKRW(
              item.volumeAmount24h ?? (item.price ? item.volume24h * item.price : item.volume24h),
            )}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">--</span>
        )}
      </td>

      {/* 액션 */}
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          {/* 알림 설정 링크 (호버 시 표시) */}
          {showAlertLink && (
            <a
              href={`/alerts`}
              className={cn(
                'inline-flex items-center justify-center h-8 w-8 rounded-md',
                'text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
              )}
              aria-label={`${item.symbol} ${t.watchlist.setAlert}`}
              title={t.watchlist.setAlert}
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            aria-label={`${item.symbol} ${t.watchlist.removeCoin}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ----- 워치리스트 모바일 카드 -----

interface WatchlistMobileCardProps {
  item: WatchlistItemWithPrice;
  onRemove: () => void;
  walletAddress: string;
}

/**
 * 워치리스트 모바일 카드
 *
 * 모바일 환경에서 관심 코인 정보를 카드 형태로 표시한다.
 *
 * @see 요구사항 9.1 (모바일 최적화 레이아웃)
 */
function WatchlistMobileCard({ item, onRemove, walletAddress }: WatchlistMobileCardProps) {
  const { t } = useTranslation();
  const coinInfo = MAJOR_COINS.find((c) => c.symbol === item.symbol);

  return (
    <div className="px-4 py-3 space-y-2">
      {/* 상단: 코인명 + 변동률 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 fill-primary text-primary shrink-0" aria-hidden="true" />
          <span className="font-semibold text-foreground">{item.symbol}</span>
          {coinInfo && (
            <span className="text-xs text-muted-foreground">{coinInfo.nameKo}</span>
          )}
        </div>
        {item.changeRate !== null ? (
          <FormattedPercent value={item.changeRate} colorize className="text-sm font-medium" />
        ) : (
          <span className="text-sm text-muted-foreground">--</span>
        )}
      </div>

      {/* 중단: 현재가 + 거래량 */}
      <div className="flex items-center justify-between">
        {item.price !== null ? (
          <FormattedPrice
            value={item.price}
            symbol={item.symbol}
            className="text-sm text-foreground"
          />
        ) : (
          <span className="text-sm text-muted-foreground">--</span>
        )}
        {item.volume24h !== null ? (
          <span className="text-xs text-muted-foreground">
            {formatCompactKRW(
              item.volumeAmount24h ?? (item.price ? item.volume24h * item.price : item.volume24h),
            )}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">--</span>
        )}
      </div>

      {/* 하단: 액션 버튼 */}
      <div className="flex items-center justify-end gap-2">
        <a
          href={`/alerts`}
          className="inline-flex items-center h-7 px-2 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
          aria-label={`${item.symbol} ${t.watchlist.setAlert}`}
        >
          <Bell className="mr-1 h-3 w-3" aria-hidden="true" />
          {t.watchlist.setAlert}
        </a>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
          aria-label={`${item.symbol} ${t.watchlist.removeCoin}`}
        >
          <Trash2 className="mr-1 h-3 w-3" aria-hidden="true" />
          {t.watchlist.removeCoin}
        </Button>
      </div>
    </div>
  );
}
