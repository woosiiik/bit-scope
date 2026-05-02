/**
 * 김치 프리미엄 분석 페이지
 *
 * 주요 코인의 거래소 간 시세 차이(김치 프리미엄)를 실시간으로 비교하고 분석한다.
 * 3개 거래소(업비트, 빗썸, 코인원)의 가격을 비교 테이블로 표시하며,
 * 사용자 설정 임계값을 초과하는 프리미엄을 시각적으로 하이라이트한다.
 *
 * 주요 기능:
 * - 주요 코인 3개 거래소 실시간 시세 비교 테이블
 * - 가격 차이(절대값, 백분율) 계산 및 표시
 * - 사용자 설정 임계값 초과 시 시각적 하이라이트
 * - 실시간 WebSocket/폴링 기반 시세 업데이트
 * - 김프 추이 차트 (24시간/7일/30일)
 *
 * @see 요구사항 3.1 (주요 코인 3개 거래소 실시간 시세 비교 테이블)
 * @see 요구사항 3.2 (가격 차이 절대값, 백분율 계산)
 * @see 요구사항 3.3 (임계값 초과 시 시각적 하이라이트)
 * @see 요구사항 3.4 (실시간 시세 업데이트)
 * @see 요구사항 3.5 (해외 거래소 김치 프리미엄 - 향후 확장)
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
import type { ExchangeType, KimchiPremiumData, KimchiPremiumHistory } from '@bitscope/shared';
import {
  EXCHANGE_CONFIGS,
  SUPPORTED_EXCHANGES,
  MAJOR_COINS,
  DEFAULT_PREMIUM_COINS,
  DEFAULT_PREMIUM_THRESHOLD_PERCENT,
  formatKRW,
  formatCompactKRW,
} from '@bitscope/shared';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { useRealTimePrice } from '@/hooks/useRealTimePrice';
import { usePriceStore } from '@/store/price-store';
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
  FormattedPercent,
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
  HIGH: 3.0,  // 높은 프리미엄 (강한 하이라이트)
  MID: 1.0,   // 중간 프리미엄 (약한 하이라이트)
} as const;

/** 차트 색상 */
const CHART_COLORS = {
  premiumLine: 'hsl(217.2, 91.2%, 59.8%)',
  zeroLine: 'hsl(0, 0%, 60%)',
  gridLine: 'hsl(0, 0%, 85%)',
} as const;

// ===== 메인 페이지 =====

export default function PremiumPage() {
  const { t } = useTranslation();

  // 상태
  const [selectedCoin, setSelectedCoin] = useState<string | null>(null);

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

      {/* 프리미엄 요약 카드 */}
      <PremiumSummaryCards
        data={premiumData ?? []}
        isLoading={isPremiumLoading}
      />

      {/* 프리미엄 비교 테이블 */}
      {isPremiumLoading && !premiumData ? (
        <Card>
          <CardContent className="p-4">
            <TableRowSkeleton columns={6} rows={10} />
          </CardContent>
        </Card>
      ) : (premiumData?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BarChart3 className="h-12 w-12 text-muted-foreground/50" aria-hidden="true" />
            <p className="mt-4 text-sm text-muted-foreground">
              프리미엄 데이터가 없습니다. 거래소 시세 데이터를 기다리고 있습니다.
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
 *
 * 페이지 타이틀, WebSocket 연결 상태, 새로고침 버튼을 표시한다.
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
          거래소 간 시세 차이를 실시간으로 비교합니다
        </p>
        <div className="flex items-center gap-2 mt-1">
          {isConnected ? (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Wifi className="h-3 w-3 text-green-500" aria-hidden="true" />
              실시간
            </Badge>
          ) : isPollingMode ? (
            <Badge variant="secondary" className="gap-1 text-xs">
              <RefreshCw className="h-3 w-3 text-yellow-500" aria-hidden="true" />
              폴링 모드
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
                연결 끊김
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
 * 최고/최저 프리미엄 코인과 평균 프리미엄을 카드로 표시한다.
 */
function PremiumSummaryCards({ data, isLoading }: PremiumSummaryCardsProps) {
  const summary = useMemo(() => {
    if (data.length === 0) {
      return { highest: null, lowest: null, avgRate: 0 };
    }

    // 프리미엄 비율 절대값 기준 정렬
    const sorted = [...data].sort(
      (a, b) => Math.abs(b.premiumRate) - Math.abs(a.premiumRate),
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
      {/* 최고 프리미엄 코인 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4 text-profit" aria-hidden="true" />
            최고 프리미엄
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
                {formatKRW(summary.highest.premiumAmount)} 차이
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">데이터 없음</p>
          )}
        </CardContent>
      </Card>

      {/* 평균 프리미엄 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
            평균 프리미엄
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
              {data.length}개 코인 기준
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 최저 프리미엄 코인 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingDown className="h-4 w-4 text-loss" aria-hidden="true" />
            최저 프리미엄
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
                {formatKRW(summary.lowest.premiumAmount)} 차이
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">데이터 없음</p>
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
 * 각 코인의 거래소별 현재가와 가격 차이(절대값, 백분율)를 표시한다.
 * 사용자 설정 임계값을 초과하는 프리미엄은 시각적으로 하이라이트된다.
 *
 * @see 요구사항 3.1 (주요 코인 3개 거래소 실시간 시세 비교 테이블)
 * @see 요구사항 3.2 (가격 차이 절대값, 백분율 계산)
 * @see 요구사항 3.3 (임계값 초과 시 시각적 하이라이트)
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
              aria-label="김치 프리미엄 비교 테이블"
            >
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left" scope="col">
                    <button
                      type="button"
                      className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => toggleSort('symbol')}
                      aria-label="코인명 기준으로 정렬"
                    >
                      {t.portfolio.coinName}
                      {getSortIndicator('symbol')}
                    </button>
                  </th>
                  {SUPPORTED_EXCHANGES.map((exchange) => (
                    <th
                      key={exchange}
                      className="px-4 py-3 text-right"
                      scope="col"
                    >
                      <span className="text-xs font-medium text-muted-foreground">
                        {EXCHANGE_CONFIGS[exchange].nameKo}
                      </span>
                    </th>
                  ))}
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
                      aria-label="프리미엄 비율 기준으로 정렬"
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
            <LoadingSpinner size="sm" message="프리미엄 데이터를 갱신하는 중..." />
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
 * 거래소별 가격, 가격 차이, 프리미엄 비율을 한 줄로 표시한다.
 * 최고가 거래소와 최저가 거래소를 색상으로 구분한다.
 * 임계값을 초과하는 프리미엄은 배경색으로 하이라이트한다.
 *
 * @see 요구사항 3.3 (임계값 초과 시 시각적 하이라이트)
 */
function PremiumTableRow({
  data,
  premiumThreshold,
  onSelect,
}: PremiumTableRowProps) {
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
      aria-label={`${data.symbol} 김프 추이 보기`}
    >
      {/* 코인명 */}
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="font-semibold text-foreground">{data.symbol}</span>
          {coinInfo && (
            <span className="text-xs text-muted-foreground">
              {coinInfo.nameKo}
            </span>
          )}
        </div>
      </td>

      {/* 거래소별 가격 */}
      {SUPPORTED_EXCHANGES.map((exchange) => {
        const price = data.prices[exchange];
        const isMax = data.maxPrice.exchange === exchange;
        const isMin = data.minPrice.exchange === exchange;

        return (
          <td key={exchange} className="px-4 py-3 text-right">
            {price != null ? (
              <div className="flex flex-col items-end">
                <FormattedPrice
                  value={price}
                  symbol={data.symbol}
                  className={cn(
                    'text-sm font-medium',
                    isMax && 'text-profit',
                    isMin && 'text-loss',
                  )}
                />
                {isMax && (
                  <Badge className="mt-0.5 bg-profit/20 text-profit text-[9px] px-1 py-0">
                    최고
                  </Badge>
                )}
                {isMin && (
                  <Badge className="mt-0.5 bg-loss/20 text-loss text-[9px] px-1 py-0">
                    최저
                  </Badge>
                )}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">-</span>
            )}
          </td>
        );
      })}

      {/* 가격 차이 */}
      <td className="px-4 py-3 text-right">
        <FormattedCurrency
          value={data.premiumAmount}
          className="text-sm font-medium"
        />
      </td>

      {/* 프리미엄 비율 */}
      <td className="px-4 py-3 text-right">
        <span
          className={cn(
            'text-sm font-bold',
            isHighPremium
              ? 'text-yellow-600 dark:text-yellow-400'
              : isHighlighted
                ? 'text-orange-600 dark:text-orange-400'
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
 *
 * 모바일 환경에서 코인 프리미엄 정보를 카드 형태로 표시한다.
 *
 * @see 요구사항 9.1 (모바일 최적화 레이아웃)
 */
function PremiumMobileCard({
  data,
  premiumThreshold,
  onSelect,
}: PremiumMobileCardProps) {
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
      aria-label={`${data.symbol} 김프 추이 보기`}
    >
      {/* 상단: 코인명 + 프리미엄 비율 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{data.symbol}</span>
          {coinInfo && (
            <span className="text-xs text-muted-foreground">
              {coinInfo.nameKo}
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
                : 'text-foreground',
          )}
        >
          {data.premiumRate >= 0 ? '+' : ''}
          {data.premiumRate.toFixed(2)}%
        </span>
      </div>

      {/* 중단: 거래소별 가격 */}
      <div className="mt-2 grid grid-cols-3 gap-2">
        {SUPPORTED_EXCHANGES.map((exchange) => {
          const price = data.prices[exchange];
          const isMax = data.maxPrice.exchange === exchange;
          const isMin = data.minPrice.exchange === exchange;

          return (
            <div key={exchange} className="text-center">
              <span className="text-[10px] text-muted-foreground">
                {EXCHANGE_CONFIGS[exchange].nameKo}
              </span>
              {price != null ? (
                <p
                  className={cn(
                    'text-xs font-medium',
                    isMax && 'text-profit',
                    isMin && 'text-loss',
                    !isMax && !isMin && 'text-foreground',
                  )}
                >
                  {formatCompactKRW(price)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">-</p>
              )}
            </div>
          );
        })}
      </div>

      {/* 하단: 가격 차이 */}
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">가격 차이</span>
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
 *
 * 현재 설정된 임계값과 하이라이트 기준을 안내한다.
 */
function PremiumThresholdInfo({ threshold }: PremiumThresholdInfoProps) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="text-xs text-muted-foreground">
        <p>
          프리미엄 비율이{' '}
          <span className="font-medium text-orange-600 dark:text-orange-400">
            {threshold}%
          </span>
          {' '}이상인 코인은 색상으로 하이라이트됩니다.
          임계값은 설정 페이지에서 변경할 수 있습니다.
        </p>
      </div>
    </div>
  );
}

// ----- 프리미엄 상세 뷰 (김프 추이 차트) -----

interface PremiumDetailViewProps {
  symbol: string;
  premiumThreshold: number;
  onBack: () => void;
}

/**
 * 특정 코인의 김프 추이 상세 뷰
 *
 * 선택한 코인의 프리미엄 이력을 차트로 시각화하며,
 * 거래소별 가격 비교와 프리미엄 변동 추이를 표시한다.
 *
 * @see 요구사항 3.6 (김프 추이 차트 24시간/7일/30일)
 */
function PremiumDetailView({
  symbol,
  premiumThreshold,
  onBack,
}: PremiumDetailViewProps) {
  const { t } = useTranslation();
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
    enabled: true,
  });

  // 실시간 가격 데이터 (price-store에서)
  const getPricesBySymbol = usePriceStore((s) => s.getPricesBySymbol);
  const realtimePrices = getPricesBySymbol(symbol);

  // 거래소별 현재가 맵
  const currentPrices = useMemo(() => {
    const priceMap: Partial<Record<ExchangeType, number>> = {};
    for (const entry of realtimePrices) {
      priceMap[entry.exchange] = entry.price;
    }
    return priceMap;
  }, [realtimePrices]);

  // 차트 데이터 변환
  const chartData = useMemo(() => {
    if (!historyData || historyData.length === 0) return [];

    return historyData.map((item) => ({
      time: item.recordedAt instanceof Date
        ? item.recordedAt.getTime()
        : new Date(item.recordedAt).getTime(),
      premiumRate: Number(item.premiumRate),
      upbitPrice: Number(item.upbitPrice),
      bithumbPrice: Number(item.bithumbPrice),
      coinonePrice: Number(item.coinonePrice),
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
                {coinInfo.nameKo}
              </span>
            )}
            <span className="ml-2 text-lg font-normal text-muted-foreground">
              - {t.premiumAnalysis.history}
            </span>
          </h1>
        </div>
      </div>

      {/* 거래소별 현재가 비교 */}
      <ExchangePriceComparison
        symbol={symbol}
        currentPrices={currentPrices}
        premiumThreshold={premiumThreshold}
      />

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
              aria-label={`${t.premiumAnalysis[option.labelKey]} 기간 보기`}
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

// ----- 거래소별 현재가 비교 -----

interface ExchangePriceComparisonProps {
  symbol: string;
  currentPrices: Partial<Record<ExchangeType, number>>;
  premiumThreshold: number;
}

/**
 * 거래소별 현재가 비교 카드
 *
 * 해당 코인의 거래소별 최신 가격을 카드로 비교 표시한다.
 */
function ExchangePriceComparison({
  symbol,
  currentPrices,
  premiumThreshold,
}: ExchangePriceComparisonProps) {
  const validPrices = SUPPORTED_EXCHANGES
    .filter((ex) => currentPrices[ex] != null)
    .map((ex) => ({ exchange: ex, price: currentPrices[ex]! }));

  const maxPrice = validPrices.length > 0
    ? Math.max(...validPrices.map((p) => p.price))
    : 0;
  const minPrice = validPrices.length > 0
    ? Math.min(...validPrices.map((p) => p.price))
    : 0;

  const priceDiff = maxPrice - minPrice;
  const premiumRate = minPrice > 0 ? (priceDiff / minPrice) * 100 : 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {/* 거래소별 가격 카드 */}
      {SUPPORTED_EXCHANGES.map((exchange) => {
        const price = currentPrices[exchange];
        const isMax = price != null && price === maxPrice && validPrices.length > 1;
        const isMin = price != null && price === minPrice && validPrices.length > 1;

        return (
          <Card
            key={exchange}
            className={cn(
              isMax && 'border-profit/50',
              isMin && 'border-loss/50',
            )}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs">
                  {EXCHANGE_CONFIGS[exchange].nameKo}
                </Badge>
                {isMax && (
                  <Badge className="bg-profit/20 text-profit text-[10px] px-1.5">
                    최고가
                  </Badge>
                )}
                {isMin && (
                  <Badge className="bg-loss/20 text-loss text-[10px] px-1.5">
                    최저가
                  </Badge>
                )}
              </div>
              {price != null ? (
                <FormattedPrice
                  value={price}
                  symbol={symbol}
                  className={cn(
                    'mt-2 block text-lg font-bold',
                    isMax && 'text-profit',
                    isMin && 'text-loss',
                  )}
                />
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  데이터 없음
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* 프리미엄 요약 카드 */}
      {validPrices.length > 1 && (
        <Card
          className={cn(
            Math.abs(premiumRate) >= premiumThreshold && 'border-yellow-500/50',
          )}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-xs text-muted-foreground">프리미엄</span>
            </div>
            <span
              className={cn(
                'mt-2 block text-lg font-bold',
                Math.abs(premiumRate) >= PREMIUM_LEVEL.HIGH
                  ? 'text-yellow-600 dark:text-yellow-400'
                  : Math.abs(premiumRate) >= premiumThreshold
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-foreground',
              )}
            >
              {premiumRate >= 0 ? '+' : ''}
              {premiumRate.toFixed(2)}%
            </span>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatKRW(priceDiff)} 차이
            </p>
          </CardContent>
        </Card>
      )}
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
 *
 * 선택 기간 내 최고/최저/평균/현재 프리미엄 통계를 표시한다.
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
    { label: '현재', value: stats.current },
    { label: `${periodLabel} 최고`, value: stats.max },
    { label: `${periodLabel} 최저`, value: stats.min },
    { label: `${periodLabel} 평균`, value: stats.avg },
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
    upbitPrice: number;
    bithumbPrice: number;
    coinonePrice: number;
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
 * 0% 기준선과 임계값 참조선을 포함하여 직관적인 분석을 지원한다.
 *
 * @see 요구사항 3.6 (김프 추이 차트 24시간/7일/30일)
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
            aria-label="차트 로딩 중"
          >
            <LoadingSpinner size="md" message="차트 데이터를 불러오는 중..." />
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
              해당 기간의 프리미엄 이력 데이터가 없습니다.
            </p>
            <p className="text-xs text-muted-foreground">
              데이터가 축적되면 차트가 표시됩니다.
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
    if (period === '7d') {
      return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
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
          aria-label={`${symbol} 김치 프리미엄 추이 차트`}
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
                name="프리미엄"
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
  upbitPrice: number;
  bithumbPrice: number;
  coinonePrice: number;
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
 * 마우스 호버 시 해당 시점의 프리미엄 비율과 거래소별 가격을 표시한다.
 */
function PremiumChartTooltip({ active, payload }: PremiumChartTooltipProps) {
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

  const exchanges: { name: string; price: number }[] = [];
  if (data.upbitPrice > 0) {
    exchanges.push({ name: '업비트', price: data.upbitPrice });
  }
  if (data.bithumbPrice > 0) {
    exchanges.push({ name: '빗썸', price: data.bithumbPrice });
  }
  if (data.coinonePrice > 0) {
    exchanges.push({ name: '코인원', price: data.coinonePrice });
  }

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
        프리미엄: {data.premiumRate >= 0 ? '+' : ''}
        {data.premiumRate.toFixed(2)}%
      </p>
      {exchanges.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {exchanges.map((ex) => (
            <p key={ex.name} className="text-xs text-muted-foreground">
              {ex.name}: {ex.price.toLocaleString('ko-KR')} KRW
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
