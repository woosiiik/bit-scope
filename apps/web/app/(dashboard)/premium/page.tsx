/**
 * 김치 프리미엄 분석 페이지
 *
 * 국내 거래소 가격과 바이낸스(해외) 가격을 비교하여 진짜 김치 프리미엄을 실시간으로 표시한다.
 * 사용자가 비교 기준 국내 거래소(업비트/빗썸/코인원)를 선택할 수 있다.
 *
 * 김프(%) = (국내가격 - 바이낸스USDT가격 x USDT/KRW환율) / (바이낸스USDT가격 x USDT/KRW환율) x 100
 *
 * 주요 기능:
 * - 국내 거래소 선택 탭 (업비트/빗썸/코인원)
 * - 주요 코인 김프 비교 테이블 (국내 가격, 바이낸스 가격, 김프 %)
 * - 사용자 설정 임계값 초과 시 시각적 하이라이트
 * - 실시간 WebSocket/폴링 기반 시세 업데이트
 * - 김프 추이 차트 (24시간/7일/30일)
 *
 * @see 요구사항 3.1 (거래소 간 실시간 시세 비교 테이블)
 * @see 요구사항 3.2 (가격 차이 절대값, 백분율 계산)
 * @see 요구사항 3.3 (임계값 초과 시 시각적 하이라이트)
 * @see 요구사항 3.4 (실시간 시세 업데이트)
 * @see 요구사항 3.5 (해외 거래소 김치 프리미엄)
 * @see 요구사항 3.6 (김프 추이 차트 24시간/7일/30일)
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Wifi,
  WifiOff,
  BarChart3,
  ArrowLeft,
  Info,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { ExchangeType, KimchiPremiumData } from '@bitscope/shared';
import {
  DOMESTIC_EXCHANGES,
  MAJOR_COINS,
  DEFAULT_PREMIUM_COINS,
  formatKRW,
  formatCompactKRW,
} from '@bitscope/shared';
import { cn, getExchangeName, getCoinName } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { useRealTimePrice } from '@/hooks/useRealTimePrice';
import { useSettingsStore } from '@/store/settings-store';
import {
  useTopPremiums,
  usePremiumHistory,
  type PremiumHistoryPeriod,
} from '@/hooks/useKimchiPremium';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FormattedCurrency,
  FormattedPrice,
} from '@/components/ui/formatted-number';
import { Skeleton, TableRowSkeleton } from '@/components/ui/skeleton';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

// ===== 상수 =====

/** 김프 추이 차트 기간 옵션 */
const PERIOD_OPTIONS: { value: PremiumHistoryPeriod; labelKey: 'period24h' | 'period7d' | 'period30d' }[] = [
  { value: '24h', labelKey: 'period24h' },
  { value: '7d', labelKey: 'period7d' },
  { value: '30d', labelKey: 'period30d' },
];

/** 프리미엄 수준에 따른 색상 분류 임계값 */
const PREMIUM_LEVEL = {
  HIGH: 3.0,
  MID: 1.0,
} as const;

/** 차트 색상 */
const CHART_COLORS = {
  premiumLine: 'hsl(217.2, 91.2%, 59.8%)',
} as const;

// ===== 메인 페이지 =====

export default function PremiumPage() {
  const { t } = useTranslation();

  // 상태
  const [selectedCoin, setSelectedCoin] = useState<string | null>(null);
  const [selectedExchange, setSelectedExchange] = useState<ExchangeType>('upbit');

  // 사용자 설정에서 임계값 가져오기
  const premiumThreshold = useSettingsStore((s) => s.settings.premiumThreshold);

  // 실시간 시세 구독 (주요 프리미엄 코인)
  const { connectionStatus, isPollingMode, reconnect } = useRealTimePrice({
    symbols: DEFAULT_PREMIUM_COINS as unknown as string[],
    enabled: true,
  });

  // NestJS 프리미엄 API에서 실시간 프리미엄 데이터 조회
  const {
    data: premiumData,
    isLoading: isPremiumLoading,
    refetch: refetchPremium,
  } = useTopPremiums({
    limit: 20,
    exchange: selectedExchange,
    enabled: true,
  });

  // 코인 선택 핸들러
  const handleSelectCoin = useCallback((symbol: string) => {
    setSelectedCoin(symbol);
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedCoin(null);
  }, []);

  // 코인 상세 모드 (김프 추이 차트)
  if (selectedCoin) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <PremiumDetailView
          symbol={selectedCoin}
          domesticExchange={selectedExchange}
          premiumThreshold={premiumThreshold}
          onBack={handleBackToList}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 헤더 */}
      <PremiumHeader
        connectionStatus={connectionStatus}
        isPollingMode={isPollingMode}
        isLoading={isPremiumLoading}
        onReconnect={reconnect}
        onRefresh={() => refetchPremium()}
      />

      {/* 국내 거래소 선택 탭 */}
      <ExchangeSelector
        selected={selectedExchange}
        onSelect={setSelectedExchange}
      />

      {/* 프리미엄 요약 카드 */}
      <PremiumSummaryCards
        data={premiumData ?? []}
        isLoading={isPremiumLoading}
      />

      {/* 프리미엄 비교 테이블 */}
      {isPremiumLoading && !premiumData ? (
        <Card>
          <CardContent className="p-4">
            <TableRowSkeleton columns={5} rows={10} />
          </CardContent>
        </Card>
      ) : (premiumData?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BarChart3 className="h-12 w-12 text-muted-foreground/50" aria-hidden="true" />
            <p className="mt-4 text-sm text-muted-foreground">
              {t.premiumAnalysis.noPremiumData}
            </p>
          </CardContent>
        </Card>
      ) : (
        <PremiumTable
          data={premiumData ?? []}
          premiumThreshold={premiumThreshold}
          isLoading={isPremiumLoading}
          onSelectCoin={handleSelectCoin}
        />
      )}

      {/* 임계값 안내 */}
      <PremiumThresholdInfo threshold={premiumThreshold} />
    </div>
  );
}

// ===== 서브 컴포넌트 =====

// ----- 국내 거래소 선택 탭 -----

interface ExchangeSelectorProps {
  selected: ExchangeType;
  onSelect: (exchange: ExchangeType) => void;
}

/**
 * 국내 거래소 선택 탭
 *
 * 업비트/빗썸/코인원 중 김프 비교 기준 국내 거래소를 선택한다.
 */
function ExchangeSelector({ selected, onSelect }: ExchangeSelectorProps) {
  const { t, locale } = useTranslation();

  return (
    <div
      className="flex items-center gap-2"
      role="tablist"
      aria-label={t.exchange.selectDomesticExchange}
    >
      {DOMESTIC_EXCHANGES.map((exchange) => {
        const isActive = selected === exchange;
        return (
          <Button
            key={exchange}
            variant={isActive ? 'default' : 'outline'}
            size="sm"
            onClick={() => onSelect(exchange)}
            role="tab"
            aria-selected={isActive}
            aria-label={getExchangeName(exchange, locale)}
          >
            {getExchangeName(exchange, locale)}
          </Button>
        );
      })}
    </div>
  );
}

// ----- 프리미엄 페이지 헤더 -----

interface PremiumHeaderProps {
  connectionStatus: string;
  isPollingMode: boolean;
  isLoading: boolean;
  onReconnect: () => void;
  onRefresh: () => void;
}

/**
 * 프리미엄 페이지 상단 헤더
 */
function PremiumHeader({
  connectionStatus,
  isPollingMode,
  isLoading,
  onReconnect,
  onRefresh,
}: PremiumHeaderProps) {
  const { t } = useTranslation();
  const isConnected = connectionStatus === 'connected';

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {t.nav.premium}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.premiumAnalysis.description}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {isConnected ? (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Wifi className="h-3 w-3 text-green-500" aria-hidden="true" />
              {t.premiumAnalysis.realtime}
            </Badge>
          ) : isPollingMode ? (
            <Badge variant="secondary" className="gap-1 text-xs">
              <RefreshCw className="h-3 w-3 text-yellow-500" aria-hidden="true" />
              {t.premiumAnalysis.pollingMode}
            </Badge>
          ) : (
            <button
              type="button"
              onClick={onReconnect}
              className="inline-flex items-center gap-1"
              aria-label={t.premiumAnalysis.reconnect}
            >
              <Badge variant="destructive" className="gap-1 text-xs cursor-pointer">
                <WifiOff className="h-3 w-3" aria-hidden="true" />
                {t.premiumAnalysis.disconnected}
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

// ----- 프리미엄 요약 카드 -----

interface PremiumSummaryCardsProps {
  data: KimchiPremiumData[];
  isLoading: boolean;
}

/**
 * 프리미엄 요약 카드
 *
 * 최고/최저 김프 코인과 평균 김프를 카드로 표시한다.
 */
function PremiumSummaryCards({ data, isLoading }: PremiumSummaryCardsProps) {
  const { t } = useTranslation();
  const summary = useMemo(() => {
    if (data.length === 0) {
      return { highest: null, lowest: null, avgRate: 0 };
    }

    const sorted = [...data].sort(
      (a, b) => b.premiumRate - a.premiumRate,
    );

    const avgRate =
      data.reduce((sum, item) => sum + item.premiumRate, 0) / data.length;

    return {
      highest: sorted[0] ?? null,
      lowest: sorted[sorted.length - 1] ?? null,
      avgRate,
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={`summary-skeleton-${i}`}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {/* 최고 김프 코인 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4 text-profit" aria-hidden="true" />
            {t.premiumAnalysis.highestPremium}
          </div>
          {summary.highest ? (
            <div className="mt-2">
              <span className="text-lg font-bold text-foreground">
                {summary.highest.symbol}
              </span>
              <span className="ml-2 text-lg font-semibold text-profit">
                {summary.highest.premiumRate >= 0 ? '+' : ''}
                {summary.highest.premiumRate.toFixed(2)}%
              </span>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatKRW(summary.highest.premiumAmount)} {t.premiumAnalysis.difference}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">{t.premiumAnalysis.noData}</p>
          )}
        </CardContent>
      </Card>

      {/* 평균 김프 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
            {t.premiumAnalysis.averagePremium}
          </div>
          <div className="mt-2">
            <span
              className={cn(
                'text-lg font-bold',
                summary.avgRate > 0 ? 'text-profit' : summary.avgRate < 0 ? 'text-loss' : 'text-foreground',
              )}
            >
              {summary.avgRate >= 0 ? '+' : ''}
              {summary.avgRate.toFixed(2)}%
            </span>
            <p className="mt-1 text-xs text-muted-foreground">
              {t.premiumAnalysis.coinsCount(data.length)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 최저 김프 코인 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingDown className="h-4 w-4 text-loss" aria-hidden="true" />
            {t.premiumAnalysis.lowestPremium}
          </div>
          {summary.lowest ? (
            <div className="mt-2">
              <span className="text-lg font-bold text-foreground">
                {summary.lowest.symbol}
              </span>
              <span className="ml-2 text-lg font-semibold text-muted-foreground">
                {summary.lowest.premiumRate >= 0 ? '+' : ''}
                {summary.lowest.premiumRate.toFixed(2)}%
              </span>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatKRW(summary.lowest.premiumAmount)} {t.premiumAnalysis.difference}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">{t.premiumAnalysis.noData}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ----- 프리미엄 비교 테이블 -----

interface PremiumTableProps {
  data: KimchiPremiumData[];
  premiumThreshold: number;
  isLoading: boolean;
  onSelectCoin: (symbol: string) => void;
}

/**
 * 주요 코인 김치 프리미엄 비교 테이블
 *
 * 각 코인의 국내 가격, 바이낸스 가격(KRW 환산), 김프(%)를 표시한다.
 * 사용자 설정 임계값을 초과하는 김프는 시각적으로 하이라이트된다.
 */
function PremiumTable({
  data,
  premiumThreshold,
  isLoading,
  onSelectCoin,
}: PremiumTableProps) {
  const { t } = useTranslation();

  // 정렬 상태
  const [sortKey, setSortKey] = useState<'symbol' | 'premium'>('premium');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const toggleSort = useCallback(
    (key: 'symbol' | 'premium') => {
      if (sortKey === key) {
        setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('desc');
      }
    },
    [sortKey],
  );

  const sortedData = useMemo(() => {
    const sorted = [...data];
    const direction = sortDir === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'symbol':
          return direction * a.symbol.localeCompare(b.symbol);
        case 'premium':
          return direction * (Math.abs(a.premiumRate) - Math.abs(b.premiumRate));
        default:
          return 0;
      }
    });

    return sorted;
  }, [data, sortKey, sortDir]);

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
            <table
              className="w-full"
              role="table"
              aria-label={t.nav.premium}
            >
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left" scope="col">
                    <button
                      type="button"
                      className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => toggleSort('symbol')}
                      aria-label={t.premiumAnalysis.sortByCoin}
                    >
                      {t.portfolio.coinName}
                      {getSortIndicator('symbol')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right" scope="col">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t.premiumAnalysis.domesticPrice}
                    </span>
                  </th>
                  <th className="px-4 py-3 text-right" scope="col">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t.premiumAnalysis.binanceKrwPrice}
                    </span>
                  </th>
                  <th className="px-4 py-3 text-right" scope="col">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t.premiumAnalysis.priceDifference}
                    </span>
                  </th>
                  <th className="px-4 py-3 text-right" scope="col">
                    <button
                      type="button"
                      className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => toggleSort('premium')}
                      aria-label={t.premiumAnalysis.sortByPremium}
                    >
                      {t.premiumAnalysis.premiumRate}
                      {getSortIndicator('premium')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedData.map((item) => (
                  <PremiumTableRow
                    key={item.symbol}
                    data={item}
                    premiumThreshold={premiumThreshold}
                    onSelect={() => onSelectCoin(item.symbol)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 모바일 카드 리스트 */}
        <div className="md:hidden divide-y divide-border">
          {sortedData.map((item) => (
            <PremiumMobileCard
              key={item.symbol}
              data={item}
              premiumThreshold={premiumThreshold}
              onSelect={() => onSelectCoin(item.symbol)}
            />
          ))}
        </div>

        {/* 로딩 인디케이터 */}
        {isLoading && data.length > 0 && (
          <div className="border-t border-border p-3">
            <LoadingSpinner size="sm" message={t.premiumAnalysis.refreshing} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ----- 프리미엄 테이블 행 (데스크톱) -----

interface PremiumTableRowProps {
  data: KimchiPremiumData;
  premiumThreshold: number;
  onSelect: () => void;
}

/**
 * 프리미엄 비교 테이블의 개별 행 (데스크톱)
 *
 * 국내 가격, 바이낸스 KRW 환산가, 가격 차이, 김프 비율을 한 줄로 표시한다.
 */
function PremiumTableRow({
  data,
  premiumThreshold,
  onSelect,
}: PremiumTableRowProps) {
  const { t, locale } = useTranslation();
  const coinInfo = MAJOR_COINS.find((c) => c.symbol === data.symbol);
  const isHighlighted = Math.abs(data.premiumRate) >= premiumThreshold;
  const isHighPremium = Math.abs(data.premiumRate) >= PREMIUM_LEVEL.HIGH;

  return (
    <tr
      className={cn(
        'border-b border-border last:border-b-0 hover:bg-muted/50 cursor-pointer transition-colors',
        isHighPremium && 'bg-yellow-50/50 dark:bg-yellow-900/10',
        isHighlighted && !isHighPremium && 'bg-orange-50/30 dark:bg-orange-900/5',
      )}
      onClick={onSelect}
      role="row"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-label={t.premiumAnalysis.viewHistory(data.symbol)}
    >
      {/* 코인명 */}
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="font-semibold text-foreground">{data.symbol}</span>
          {coinInfo && (
            <span className="text-xs text-muted-foreground">
              {getCoinName(coinInfo, locale)}
            </span>
          )}
        </div>
      </td>

      {/* 국내 가격 */}
      <td className="px-4 py-3 text-right">
        <FormattedPrice
          value={data.domesticPrice}
          symbol={data.symbol}
          className="text-sm font-medium"
        />
      </td>

      {/* 바이낸스 KRW 환산가 */}
      <td className="px-4 py-3 text-right">
        <div className="flex flex-col items-end">
          <FormattedPrice
            value={data.binanceKrwPrice}
            symbol={data.symbol}
            className="text-sm font-medium text-muted-foreground"
          />
          <span className="text-[10px] text-muted-foreground">
            ${data.binanceUsdtPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          </span>
        </div>
      </td>

      {/* 가격 차이 */}
      <td className="px-4 py-3 text-right">
        <FormattedCurrency
          value={data.premiumAmount}
          className={cn(
            'text-sm font-medium',
            data.premiumAmount > 0 ? 'text-profit' : data.premiumAmount < 0 ? 'text-loss' : '',
          )}
        />
      </td>

      {/* 김프 비율 */}
      <td className="px-4 py-3 text-right">
        <span
          className={cn(
            'text-sm font-bold',
            isHighPremium
              ? 'text-yellow-600 dark:text-yellow-400'
              : isHighlighted
                ? 'text-orange-600 dark:text-orange-400'
                : data.premiumRate > 0
                  ? 'text-profit'
                  : data.premiumRate < 0
                    ? 'text-loss'
                    : 'text-foreground',
          )}
        >
          {data.premiumRate >= 0 ? '+' : ''}
          {data.premiumRate.toFixed(2)}%
        </span>
      </td>
    </tr>
  );
}

// ----- 프리미엄 모바일 카드 -----

interface PremiumMobileCardProps {
  data: KimchiPremiumData;
  premiumThreshold: number;
  onSelect: () => void;
}

/**
 * 프리미엄 모바일 카드
 */
function PremiumMobileCard({
  data,
  premiumThreshold,
  onSelect,
}: PremiumMobileCardProps) {
  const { t, locale } = useTranslation();
  const coinInfo = MAJOR_COINS.find((c) => c.symbol === data.symbol);
  const isHighlighted = Math.abs(data.premiumRate) >= premiumThreshold;
  const isHighPremium = Math.abs(data.premiumRate) >= PREMIUM_LEVEL.HIGH;

  return (
    <button
      type="button"
      className={cn(
        'w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors',
        isHighPremium && 'bg-yellow-50/50 dark:bg-yellow-900/10',
        isHighlighted && !isHighPremium && 'bg-orange-50/30 dark:bg-orange-900/5',
      )}
      onClick={onSelect}
      aria-label={t.premiumAnalysis.viewHistory(data.symbol)}
    >
      {/* 상단: 코인명 + 김프 비율 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{data.symbol}</span>
          {coinInfo && (
            <span className="text-xs text-muted-foreground">
              {getCoinName(coinInfo, locale)}
            </span>
          )}
        </div>
        <span
          className={cn(
            'text-sm font-bold',
            isHighPremium
              ? 'text-yellow-600 dark:text-yellow-400'
              : isHighlighted
                ? 'text-orange-600 dark:text-orange-400'
                : data.premiumRate > 0
                  ? 'text-profit'
                  : data.premiumRate < 0
                    ? 'text-loss'
                    : 'text-foreground',
          )}
        >
          {data.premiumRate >= 0 ? '+' : ''}
          {data.premiumRate.toFixed(2)}%
        </span>
      </div>

      {/* 중단: 국내 가격 vs 바이낸스 가격 */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <span className="text-[10px] text-muted-foreground">
            {t.premiumAnalysis.domesticPrice}
          </span>
          <p className="text-xs font-medium text-foreground">
            {formatCompactKRW(data.domesticPrice)}
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-muted-foreground">
            {t.premiumAnalysis.binanceKrwPrice}
          </span>
          <p className="text-xs font-medium text-muted-foreground">
            {formatCompactKRW(data.binanceKrwPrice)}
          </p>
        </div>
      </div>

      {/* 하단: 가격 차이 */}
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{t.premiumAnalysis.priceDifference}</span>
        <FormattedCurrency
          value={data.premiumAmount}
          className="text-xs font-medium"
        />
      </div>
    </button>
  );
}

// ----- 임계값 안내 -----

interface PremiumThresholdInfoProps {
  threshold: number;
}

/**
 * 프리미엄 임계값 안내 메시지
 */
function PremiumThresholdInfo({ threshold }: PremiumThresholdInfoProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="text-xs text-muted-foreground">
        <p>{t.premiumAnalysis.thresholdInfo(threshold)}</p>
      </div>
    </div>
  );
}

// ----- 프리미엄 상세 뷰 (김프 추이 차트) -----

interface PremiumDetailViewProps {
  symbol: string;
  domesticExchange: ExchangeType;
  premiumThreshold: number;
  onBack: () => void;
}

/**
 * 특정 코인의 김프 추이 상세 뷰
 *
 * 선택한 코인의 프리미엄 이력을 차트로 시각화한다.
 */
function PremiumDetailView({
  symbol,
  domesticExchange,
  premiumThreshold,
  onBack,
}: PremiumDetailViewProps) {
  const { t, locale } = useTranslation();
  const coinInfo = MAJOR_COINS.find((c) => c.symbol === symbol);

  // 기간 선택 상태
  const [selectedPeriod, setSelectedPeriod] =
    useState<PremiumHistoryPeriod>('24h');

  // 프리미엄 이력 조회
  const {
    data: historyData,
    isLoading: isHistoryLoading,
  } = usePremiumHistory({
    symbol,
    period: selectedPeriod,
    exchange: domesticExchange,
    enabled: true,
  });

  // 차트 데이터 변환
  const chartData = useMemo(() => {
    if (!historyData || historyData.length === 0) return [];

    return historyData.map((item) => ({
      time: item.recordedAt instanceof Date
        ? item.recordedAt.getTime()
        : new Date(item.recordedAt).getTime(),
      premiumRate: Number(item.premiumRate),
      domesticPrice: Number(item.domesticPrice),
      binanceUsdtPrice: Number(item.binanceUsdtPrice),
      usdtKrwRate: Number(item.usdtKrwRate),
    }));
  }, [historyData]);

  // 차트 통계
  const chartStats = useMemo(() => {
    if (chartData.length === 0) {
      return { max: 0, min: 0, avg: 0, current: 0 };
    }

    const rates = chartData.map((d) => d.premiumRate);
    const max = Math.max(...rates);
    const min = Math.min(...rates);
    const avg = rates.reduce((sum, r) => sum + r, 0) / rates.length;
    const current = rates[rates.length - 1] ?? 0;

    return { max, min, avg, current };
  }, [chartData]);

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
            <span className="ml-2 text-lg font-normal text-muted-foreground">
              - {t.premiumAnalysis.history}
            </span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {getExchangeName(domesticExchange, locale)} vs {t.exchange.binance}
          </p>
        </div>
      </div>

      {/* 프리미엄 통계 */}
      <PremiumStatsCards stats={chartStats} period={selectedPeriod} />

      {/* 기간 선택 탭 */}
      <div className="flex items-center gap-2">
        {PERIOD_OPTIONS.map((option) => {
          const isActive = selectedPeriod === option.value;
          return (
            <Button
              key={option.value}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedPeriod(option.value)}
              aria-pressed={isActive}
              aria-label={t.premiumAnalysis.viewPeriod(t.premiumAnalysis[option.labelKey])}
            >
              {t.premiumAnalysis[option.labelKey]}
            </Button>
          );
        })}
      </div>

      {/* 김프 추이 차트 */}
      <PremiumHistoryChart
        data={chartData}
        isLoading={isHistoryLoading}
        period={selectedPeriod}
        premiumThreshold={premiumThreshold}
        symbol={symbol}
      />
    </div>
  );
}

// ----- 프리미엄 통계 카드 -----

interface PremiumStatsCardsProps {
  stats: { max: number; min: number; avg: number; current: number };
  period: PremiumHistoryPeriod;
}

/**
 * 프리미엄 통계 카드
 */
function PremiumStatsCards({ stats, period }: PremiumStatsCardsProps) {
  const { t } = useTranslation();

  const periodLabel =
    period === '24h'
      ? t.premiumAnalysis.period24h
      : period === '7d'
        ? t.premiumAnalysis.period7d
        : t.premiumAnalysis.period30d;

  const statItems = [
    { label: t.premiumAnalysis.current, value: stats.current },
    { label: t.premiumAnalysis.periodMax(periodLabel), value: stats.max },
    { label: t.premiumAnalysis.periodMin(periodLabel), value: stats.min },
    { label: t.premiumAnalysis.periodAvg(periodLabel), value: stats.avg },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {statItems.map((item) => (
        <Card key={item.label}>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <span
              className={cn(
                'text-lg font-bold',
                item.value > 0
                  ? 'text-profit'
                  : item.value < 0
                    ? 'text-loss'
                    : 'text-foreground',
              )}
            >
              {item.value >= 0 ? '+' : ''}
              {item.value.toFixed(2)}%
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ----- 김프 추이 차트 -----

interface PremiumHistoryChartProps {
  data: {
    time: number;
    premiumRate: number;
    domesticPrice: number;
    binanceUsdtPrice: number;
    usdtKrwRate: number;
  }[];
  isLoading: boolean;
  period: PremiumHistoryPeriod;
  premiumThreshold: number;
  symbol: string;
}

/**
 * 김프 추이 라인 차트
 *
 * Recharts 기반으로 프리미엄 비율의 시계열 변화를 표시한다.
 */
function PremiumHistoryChart({
  data,
  isLoading,
  period,
  premiumThreshold,
  symbol,
}: PremiumHistoryChartProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            {t.premiumAnalysis.history}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex h-[300px] items-center justify-center"
            role="status"
            aria-label={t.common.loading}
          >
            <LoadingSpinner size="md" message={t.premiumAnalysis.loadingChart} />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            {t.premiumAnalysis.history}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] flex-col items-center justify-center">
            <BarChart3
              className="h-12 w-12 text-muted-foreground/50"
              aria-hidden="true"
            />
            <p className="mt-4 text-sm text-muted-foreground">
              {t.premiumAnalysis.noHistoryData}
            </p>
            <p className="text-xs text-muted-foreground">
              {t.premiumAnalysis.dataAccumulating}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 시간 축 포맷
  const formatXAxis = (timestamp: number) => {
    const date = new Date(timestamp);
    if (period === '24h') {
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          {symbol} {t.premiumAnalysis.history}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className="h-[300px] w-full"
          role="img"
          aria-label={t.premiumAnalysis.viewHistory(symbol)}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                opacity={0.5}
              />
              <XAxis
                dataKey="time"
                tickFormatter={formatXAxis}
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(value: number) => `${value.toFixed(1)}%`}
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                tickLine={false}
                axisLine={false}
                width={50}
              />
              <RechartsTooltip
                content={<PremiumChartTooltip />}
                cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
              />
              {/* 0% 기준선 */}
              <ReferenceLine
                y={0}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="3 3"
                strokeOpacity={0.5}
              />
              {/* 임계값 참조선 (양수) */}
              <ReferenceLine
                y={premiumThreshold}
                stroke="hsl(30, 80%, 55%)"
                strokeDasharray="5 5"
                strokeOpacity={0.6}
                label={{
                  value: `${premiumThreshold}%`,
                  position: 'insideTopRight',
                  fill: 'hsl(30, 80%, 55%)',
                  fontSize: 10,
                }}
              />
              {/* 프리미엄 비율 라인 */}
              <Line
                type="monotone"
                dataKey="premiumRate"
                stroke={CHART_COLORS.premiumLine}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2 }}
                name={t.premiumAnalysis.premium}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ----- 차트 커스텀 툴팁 -----

interface PremiumChartTooltipPayload {
  time: number;
  premiumRate: number;
  domesticPrice: number;
  binanceUsdtPrice: number;
  usdtKrwRate: number;
}

interface PremiumChartTooltipProps {
  active?: boolean;
  payload?: {
    payload: PremiumChartTooltipPayload;
  }[];
  label?: number;
}

/**
 * 김프 추이 차트 커스텀 툴팁
 *
 * 마우스 호버 시 해당 시점의 김프 비율, 국내 가격, 바이낸스 가격을 표시한다.
 */
function PremiumChartTooltip({ active, payload }: PremiumChartTooltipProps) {
  const { t } = useTranslation();

  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0]!.payload;
  const date = new Date(data.time);

  const formattedDate = `${date.getFullYear()}.${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}.${date.getDate().toString().padStart(2, '0')} ${date
    .getHours()
    .toString()
    .padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

  const binanceKrwPrice = data.binanceUsdtPrice * data.usdtKrwRate;

  return (
    <div
      className="rounded-lg border border-border bg-card px-3 py-2 shadow-md"
      role="tooltip"
    >
      <p className="text-xs text-muted-foreground">{formattedDate}</p>
      <p
        className={cn(
          'mt-1 text-sm font-bold',
          data.premiumRate > 0
            ? 'text-profit'
            : data.premiumRate < 0
              ? 'text-loss'
              : 'text-foreground',
        )}
      >
        {t.premiumAnalysis.premium}: {data.premiumRate >= 0 ? '+' : ''}
        {data.premiumRate.toFixed(2)}%
      </p>
      <div className="mt-1 space-y-0.5">
        {data.domesticPrice > 0 && (
          <p className="text-xs text-muted-foreground">
            {t.premiumAnalysis.domesticPrice}: {data.domesticPrice.toLocaleString('ko-KR')} KRW
          </p>
        )}
        {binanceKrwPrice > 0 && (
          <p className="text-xs text-muted-foreground">
            {t.premiumAnalysis.binanceKrwPrice}: {Math.round(binanceKrwPrice).toLocaleString('ko-KR')} KRW
          </p>
        )}
        {data.binanceUsdtPrice > 0 && (
          <p className="text-xs text-muted-foreground">
            {t.exchange.binance}: ${data.binanceUsdtPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDT
          </p>
        )}
      </div>
    </div>
  );
}
