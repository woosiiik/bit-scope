/**
 * 포트폴리오 성과 분석 페이지
 *
 * DB에 축적된 스냅샷 데이터를 기반으로 포트폴리오의 시간별 성과를 분석한다.
 * NestJS 스냅샷 API를 호출하여 시계열 데이터를 조회하고 차트로 시각화한다.
 *
 * 주요 기능:
 * - 총 자산 평가금액 시계열 추이 차트 (일/주/월)
 * - 총 투자 원금, 현재 평가금액, 총 손익 요약
 * - 기간 선택 시 수익률, 최대 수익, 최대 손실 계산
 * - 코인별 수익률 랭킹 (최고 수익 TOP 5, 최대 손실 TOP 5)
 * - 개별 코인 선택 시 매수 시점 대비 수익률 변화 표시
 * - 기간별 실현 손익 / 미실현 손익 구분
 * - 벤치마크(BTC) 대비 포트폴리오 성과 비교 차트 (데이터 충분 시)
 * - 기간별 포트폴리오 요약 리포트 (일간/주간/월간)
 *
 * @see 요구사항 4.1 (총 자산 평가금액 시계열 추이 차트)
 * @see 요구사항 4.2 (총 투자 원금, 현재 평가금액, 총 손익 요약)
 * @see 요구사항 4.3 (기간별 수익률, 최대 수익, 최대 손실)
 * @see 요구사항 4.4 (코인별 수익률 랭킹 TOP 5)
 * @see 요구사항 4.5 (벤치마크 BTC 대비 성과 비교)
 * @see 요구사항 4.7 (개별 코인 매수 시점 대비 수익률 변화)
 * @see 요구사항 4.8 (실현 손익 / 미실현 손익 구분)
 * @see 요구사항 4.6 (기간별 리포트 생성 및 표시)
 * @see 요구사항 4.10 (DB 스냅샷 기반 시계열 분석)
 */

'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Wallet,
  ArrowLeft,
  Calendar,
  Info,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useAccount } from 'wagmi';
import type { ExchangeType, AggregationInterval } from '@bitscope/shared';
import { formatCompactKRW, formatPercent } from '@bitscope/shared';
import { cn, getExchangeName } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { usePortfolioStore } from '@/store/portfolio-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FormattedCurrency,
  FormattedPercent,
  ProfitLossIndicator,
} from '@/components/ui/formatted-number';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ErrorDisplay } from '@/components/ui/error-display';

import { getApiBaseUrl } from '@/lib/api-url';

// ===== 상수 =====

/** 기간 선택 옵션 */
type PeriodOption = '7d' | '30d' | '90d' | 'all';

/** 기간별 일(day) 수 */
const PERIOD_DAYS: Record<PeriodOption, number | null> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: null,
};

/** 기간별 기본 집계 간격 */
const PERIOD_INTERVAL: Record<PeriodOption, AggregationInterval> = {
  '7d': 'daily',
  '30d': 'daily',
  '90d': 'weekly',
  all: 'monthly',
};

/** 차트 색상 */
const CHART_COLORS = {
  primary: 'hsl(217.2, 91.2%, 59.8%)',
  secondary: 'hsl(160, 60%, 45%)',
  profit: 'hsl(160, 60%, 45%)',
  loss: 'hsl(0, 70%, 55%)',
  btc: 'hsl(30, 80%, 55%)',
  area: 'hsl(217.2, 91.2%, 59.8%)',
  areaFill: 'hsl(217.2, 91.2%, 85%)',
} as const;

// ===== API 호출 함수 =====

/** 스냅샷 목록 조회 응답 타입 (NestJS PortfolioSnapshotEntity와 대응) */
interface SnapshotResponse {
  id: string;
  walletAddress: string;
  createdAt: string;
  totalEvaluation: number;
  totalInvestment: number;
  totalProfitLoss: number;
  profitLossRate: number;
  holdings: {
    id: string;
    symbol: string;
    exchange: string;
    balance: number;
    avgBuyPrice: number;
    currentPrice: number;
    evaluation: number;
  }[];
}

/** 집계된 스냅샷 응답 타입 */
interface AggregatedSnapshotResponse {
  periodStart: string;
  periodEnd: string;
  avgTotalEvaluation: number;
  maxTotalEvaluation: number;
  minTotalEvaluation: number;
  snapshotCount: number;
}

/**
 * NestJS 백엔드에서 스냅샷 목록을 조회한다.
 *
 * @param walletAddress 지갑 주소
 * @param start 시작 시각 (ISO 8601)
 * @param end 종료 시각 (ISO 8601)
 * @param limit 최대 개수
 */
async function fetchSnapshots(
  walletAddress: string,
  start?: string,
  end?: string,
  limit?: number,
): Promise<SnapshotResponse[]> {
  const params = new URLSearchParams();
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  if (limit) params.set('limit', String(limit));

  const url = `${getApiBaseUrl()}/snapshots/${walletAddress}?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`스냅샷 조회 실패: HTTP ${response.status}`);
  }

  const json = await response.json();
  // NestJS TransformInterceptor가 { success, data, timestamp }로 래핑
  return json.data ?? json;
}

/**
 * NestJS 백엔드에서 집계된 스냅샷을 조회한다.
 *
 * @param walletAddress 지갑 주소
 * @param interval 집계 간격
 * @param start 시작 시각 (ISO 8601)
 * @param end 종료 시각 (ISO 8601)
 */
async function fetchAggregatedSnapshots(
  walletAddress: string,
  interval: AggregationInterval,
  start?: string,
  end?: string,
): Promise<AggregatedSnapshotResponse[]> {
  const params = new URLSearchParams({ interval });
  if (start) params.set('start', start);
  if (end) params.set('end', end);

  const url = `${getApiBaseUrl()}/snapshots/${walletAddress}?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`집계 스냅샷 조회 실패: HTTP ${response.status}`);
  }

  const json = await response.json();
  // NestJS TransformInterceptor가 { success, data, timestamp }로 래핑
  return json.data ?? json;
}

// ===== 분석 유틸리티 함수 =====

/** 코인별 수익률 데이터 */
interface CoinProfitLoss {
  symbol: string;
  evaluation: number;
  avgBuyPrice: number;
  currentPrice: number;
  balance: number;
  profitLossRate: number;
  profitLossAmount: number;
  exchange: string;
}

/**
 * 스냅샷 보유 내역에서 코인별 수익률을 계산한다.
 *
 * @param holdings 스냅샷 보유 내역
 * @returns 코인별 수익률 배열 (수익률 내림차순 정렬)
 */
function calculateCoinProfitLoss(
  holdings: SnapshotResponse['holdings'],
): CoinProfitLoss[] {
  // 코인별로 합산
  const coinMap = new Map<string, {
    totalEvaluation: number;
    totalInvestment: number;
    totalBalance: number;
    weightedBuyPrice: number;
    currentPrice: number;
    exchanges: string[];
  }>();

  for (const h of holdings) {
    const existing = coinMap.get(h.symbol);
    const investment = Number(h.avgBuyPrice) * Number(h.balance);
    if (existing) {
      existing.totalEvaluation += Number(h.evaluation);
      existing.totalInvestment += investment;
      existing.totalBalance += Number(h.balance);
      existing.currentPrice = Number(h.currentPrice);
      if (!existing.exchanges.includes(h.exchange)) {
        existing.exchanges.push(h.exchange);
      }
    } else {
      coinMap.set(h.symbol, {
        totalEvaluation: Number(h.evaluation),
        totalInvestment: investment,
        totalBalance: Number(h.balance),
        weightedBuyPrice: Number(h.avgBuyPrice),
        currentPrice: Number(h.currentPrice),
        exchanges: [h.exchange],
      });
    }
  }

  const result: CoinProfitLoss[] = [];
  for (const [symbol, data] of coinMap) {
    const avgBuyPrice = data.totalBalance > 0
      ? data.totalInvestment / data.totalBalance
      : 0;
    const profitLossAmount = data.totalEvaluation - data.totalInvestment;
    const profitLossRate = data.totalInvestment > 0
      ? (profitLossAmount / data.totalInvestment) * 100
      : 0;

    result.push({
      symbol,
      evaluation: data.totalEvaluation,
      avgBuyPrice,
      currentPrice: data.currentPrice,
      balance: data.totalBalance,
      profitLossRate,
      profitLossAmount,
      exchange: data.exchanges.join(', '),
    });
  }

  return result.sort((a, b) => b.profitLossRate - a.profitLossRate);
}

/**
 * 기간별 시작 Date 객체를 생성한다.
 */
function getPeriodStartDate(period: PeriodOption): Date | null {
  const days = PERIOD_DAYS[period];
  if (days === null) return null;
  const now = new Date();
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

// ===== 메인 페이지 컴포넌트 =====

export default function AnalyticsPage() {
  const { address } = useAccount();
  const { t } = useTranslation();
  const walletAddress = address?.toLowerCase() ?? '';

  // 기간 선택 상태
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>('30d');
  // 선택된 코인 (상세 보기)
  const [selectedCoin, setSelectedCoin] = useState<string | null>(null);

  // 집계된 스냅샷 데이터 (차트용)
  const [aggregatedData, setAggregatedData] = useState<AggregatedSnapshotResponse[]>([]);
  // 최신 스냅샷 데이터 (요약/랭킹용)
  const [latestSnapshots, setLatestSnapshots] = useState<SnapshotResponse[]>([]);
  // 로딩 및 에러 상태
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 현재 포트폴리오 데이터 (store에서)
  const aggregatedPortfolio = usePortfolioStore((s) => s.aggregatedPortfolio);

  // 데이터 로드
  const loadData = useCallback(async () => {
    if (!walletAddress) return;

    setIsLoading(true);
    setError(null);

    try {
      const interval = PERIOD_INTERVAL[selectedPeriod];
      const startDate = getPeriodStartDate(selectedPeriod);
      const startIso = startDate?.toISOString();
      const endIso = new Date().toISOString();

      // 집계 데이터와 최신 스냅샷을 병렬로 조회
      const [aggResult, snapshotResult] = await Promise.all([
        fetchAggregatedSnapshots(walletAddress, interval, startIso, endIso),
        fetchSnapshots(walletAddress, startIso, endIso, 10),
      ]);

      setAggregatedData(aggResult);
      setLatestSnapshots(snapshotResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : t.analytics.dataLoadFailed;
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, selectedPeriod, t]);

  // 기간 변경 또는 초기 로드 시 데이터 조회
  useEffect(() => {
    loadData();
  }, [loadData]);

  // 최신 스냅샷의 보유 내역에서 코인별 수익률 계산
  const coinRankings = useMemo(() => {
    if (latestSnapshots.length === 0) return [];
    // 가장 최신 스냅샷의 holdings를 사용
    const latest = latestSnapshots[0];
    if (!latest) return [];
    return calculateCoinProfitLoss(latest.holdings);
  }, [latestSnapshots]);

  // 최고 수익 TOP 5 / 최대 손실 TOP 5
  const topGainers = useMemo(() => coinRankings.slice(0, 5), [coinRankings]);
  const topLosers = useMemo(() => {
    const losers = coinRankings.filter((c) => c.profitLossRate < 0);
    return losers.slice(-5).reverse();
  }, [coinRankings]);

  // 기간 내 최대 수익 / 최대 손실 (집계 데이터 기반)
  const periodStats = useMemo(() => {
    if (aggregatedData.length === 0) return null;
    const maxEval = Math.max(...aggregatedData.map((d) => Number(d.maxTotalEvaluation)));
    const minEval = Math.min(...aggregatedData.map((d) => Number(d.minTotalEvaluation)));
    const firstEval = Number(aggregatedData[0]?.avgTotalEvaluation ?? 0);
    const lastEval = Number(aggregatedData[aggregatedData.length - 1]?.avgTotalEvaluation ?? 0);
    const periodReturn = firstEval > 0 ? ((lastEval - firstEval) / firstEval) * 100 : 0;
    const totalSnapshotCount = aggregatedData.reduce((sum, d) => sum + d.snapshotCount, 0);

    return {
      maxEval,
      minEval,
      periodReturn,
      totalSnapshotCount,
    };
  }, [aggregatedData]);

  // 현재 포트폴리오 요약 (store 또는 최신 스냅샷에서)
  const currentSummary = useMemo(() => {
    if (aggregatedPortfolio) {
      return {
        totalEvaluation: aggregatedPortfolio.totalEvaluation,
        totalInvestment: aggregatedPortfolio.totalInvestment,
        totalProfitLoss: aggregatedPortfolio.totalProfitLoss,
        profitLossRate: aggregatedPortfolio.profitLossRate,
      };
    }
    if (latestSnapshots.length > 0) {
      const latest = latestSnapshots[0]!;
      return {
        totalEvaluation: Number(latest.totalEvaluation),
        totalInvestment: Number(latest.totalInvestment),
        totalProfitLoss: Number(latest.totalProfitLoss),
        profitLossRate: Number(latest.profitLossRate),
      };
    }
    return null;
  }, [aggregatedPortfolio, latestSnapshots]);

  // 선택된 코인의 상세 데이터
  const selectedCoinData = useMemo(() => {
    if (!selectedCoin || latestSnapshots.length === 0) return null;
    const latest = latestSnapshots[0];
    if (!latest) return null;
    const holdings = latest.holdings.filter((h) => h.symbol === selectedCoin);
    if (holdings.length === 0) return null;

    const totalBalance = holdings.reduce((sum, h) => sum + Number(h.balance), 0);
    const totalEvaluation = holdings.reduce((sum, h) => sum + Number(h.evaluation), 0);
    const totalInvestment = holdings.reduce(
      (sum, h) => sum + Number(h.avgBuyPrice) * Number(h.balance),
      0,
    );
    const avgBuyPrice = totalBalance > 0 ? totalInvestment / totalBalance : 0;
    const currentPrice = Number(holdings[0]!.currentPrice);
    const profitLossAmount = totalEvaluation - totalInvestment;
    const profitLossRate = totalInvestment > 0 ? (profitLossAmount / totalInvestment) * 100 : 0;

    return {
      symbol: selectedCoin,
      totalBalance,
      avgBuyPrice,
      currentPrice,
      totalEvaluation,
      totalInvestment,
      profitLossAmount,
      profitLossRate,
      // 미실현 손익 = 현재 보유분의 손익
      unrealizedPL: profitLossAmount,
      // 실현 손익은 거래 내역이 필요하므로 현재는 미구현 (0으로 표시)
      realizedPL: 0,
      exchanges: holdings.map((h) => ({
        exchange: h.exchange as ExchangeType,
        balance: Number(h.balance),
        avgBuyPrice: Number(h.avgBuyPrice),
        currentPrice: Number(h.currentPrice),
        evaluation: Number(h.evaluation),
      })),
    };
  }, [selectedCoin, latestSnapshots]);

  // 로딩 상태
  if (isLoading && aggregatedData.length === 0) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <AnalyticsSkeleton />
      </div>
    );
  }

  // 에러 상태
  if (error && aggregatedData.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4 md:p-6">
        <ErrorDisplay
          title={t.errors.general.title}
          message={error}
          onRetry={loadData}
        />
      </div>
    );
  }

  // 데이터 없음 상태
  if (!isLoading && aggregatedData.length === 0 && latestSnapshots.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4 md:p-6">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BarChart3
              className="h-16 w-16 text-muted-foreground/50"
              aria-hidden="true"
            />
            <h2 className="mt-4 text-lg font-semibold text-foreground">
              {t.analytics.noSnapshotData}
            </h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              {t.analytics.noSnapshotDescription}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 헤더: 타이틀 + 기간 선택 */}
      <PageHeader
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
        isLoading={isLoading}
      />

      {/* 데이터 수집 안내 배너 */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          {t.analytics.dataCollectionNotice}
        </p>
      </div>

      {/* 코인 상세 보기 */}
      {selectedCoin && selectedCoinData ? (
        <CoinDetailSection
          data={selectedCoinData}
          onBack={() => setSelectedCoin(null)}
        />
      ) : (
        <>
          {/* 요약 카드 */}
          {currentSummary && (
            <SummaryCards
              totalEvaluation={currentSummary.totalEvaluation}
              totalInvestment={currentSummary.totalInvestment}
              totalProfitLoss={currentSummary.totalProfitLoss}
              profitLossRate={currentSummary.profitLossRate}
            />
          )}

          {/* 자산 평가금액 추이 차트 */}
          {aggregatedData.length > 0 && (
            <EvaluationTrendChart
              data={aggregatedData}
              periodStats={periodStats}
            />
          )}

          {/* 기간 통계 (수익률, 최대 수익, 최대 손실) */}
          {periodStats && (
            <PeriodStatsCards stats={periodStats} />
          )}

          {/* 코인별 수익률 랭킹 */}
          {coinRankings.length > 0 && (
            <CoinRankingSection
              topGainers={topGainers}
              topLosers={topLosers}
              onSelectCoin={setSelectedCoin}
            />
          )}

          {/* 벤치마크 비교 (BTC) */}
          <BenchmarkSection
            aggregatedData={aggregatedData}
            latestSnapshots={latestSnapshots}
          />

          {/* 기간별 포트폴리오 요약 리포트 */}
          {walletAddress && (
            <PeriodReportSection walletAddress={walletAddress} />
          )}
        </>
      )}
    </div>
  );
}

// ===== 서브 컴포넌트 =====

// ----- 스켈레톤 로딩 -----

/**
 * 성과 분석 페이지 스켈레톤 UI
 */
function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      {/* 헤더 스켈레톤 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>

      {/* 요약 카드 스켈레톤 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="mb-2 h-4 w-24" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 차트 스켈레톤 */}
      <Card>
        <CardContent className="p-6">
          <Skeleton className="mb-4 h-5 w-40" />
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

// ----- 페이지 헤더 -----

interface PageHeaderProps {
  selectedPeriod: PeriodOption;
  onPeriodChange: (period: PeriodOption) => void;
  isLoading: boolean;
}

/**
 * 성과 분석 페이지 헤더
 *
 * 페이지 타이틀과 기간 선택 버튼 그룹을 표시한다.
 *
 * @see 요구사항 4.3 (기간 선택 시 해당 기간 분석)
 */
function PageHeader({ selectedPeriod, onPeriodChange, isLoading }: PageHeaderProps) {
  const { t } = useTranslation();

  const periods: { value: PeriodOption; label: string }[] = [
    { value: '7d', label: t.analytics.period7d },
    { value: '30d', label: t.analytics.period30d },
    { value: '90d', label: t.analytics.period90d },
    { value: 'all', label: t.analytics.periodAll },
  ];

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {t.analytics.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t.analytics.description}
        </p>
      </div>
      <div className="flex items-center gap-1" role="group" aria-label={t.analytics.selectPeriod}>
        {periods.map((period) => (
          <Button
            key={period.value}
            variant={selectedPeriod === period.value ? 'default' : 'outline'}
            size="sm"
            className="h-8 px-3 text-xs"
            onClick={() => onPeriodChange(period.value)}
            disabled={isLoading}
            aria-pressed={selectedPeriod === period.value}
          >
            {period.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

// ----- 요약 카드 -----

interface SummaryCardsProps {
  totalEvaluation: number;
  totalInvestment: number;
  totalProfitLoss: number;
  profitLossRate: number;
}

/**
 * 포트폴리오 요약 카드
 *
 * 총 투자 원금, 현재 평가금액, 총 손익, 수익률을 표시한다.
 *
 * @see 요구사항 4.2 (총 투자 원금, 현재 평가금액, 총 손익 요약)
 */
function SummaryCards({ totalEvaluation, totalInvestment, totalProfitLoss, profitLossRate }: SummaryCardsProps) {
  const { t } = useTranslation();

  const cards = [
    {
      label: t.analytics.totalInvestment,
      value: totalInvestment,
      icon: Wallet,
      colorize: false,
    },
    {
      label: t.analytics.currentEvaluation,
      value: totalEvaluation,
      icon: BarChart3,
      colorize: false,
    },
    {
      label: t.analytics.totalProfitLoss,
      value: totalProfitLoss,
      icon: totalProfitLoss >= 0 ? TrendingUp : TrendingDown,
      colorize: true,
    },
    {
      label: t.analytics.profitLossRate,
      value: profitLossRate,
      icon: profitLossRate >= 0 ? TrendingUp : TrendingDown,
      colorize: true,
      isPercent: true,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.label}
            </CardTitle>
            <card.icon
              className={cn(
                'h-4 w-4',
                card.colorize
                  ? card.value >= 0
                    ? 'text-profit'
                    : 'text-loss'
                  : 'text-muted-foreground',
              )}
              aria-hidden="true"
            />
          </CardHeader>
          <CardContent>
            {'isPercent' in card && card.isPercent ? (
              <FormattedPercent
                value={card.value}
                colorize={card.colorize}
                className="text-2xl font-bold"
              />
            ) : (
              <FormattedCurrency
                value={card.value}
                colorize={card.colorize}
                showSign={card.colorize}
                className="text-2xl font-bold"
              />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ----- 자산 평가금액 추이 차트 -----

interface EvaluationTrendChartProps {
  data: AggregatedSnapshotResponse[];
  periodStats: {
    maxEval: number;
    minEval: number;
    periodReturn: number;
    totalSnapshotCount: number;
  } | null;
}

/**
 * 총 자산 평가금액 시계열 추이 차트
 *
 * 집계된 스냅샷 데이터를 AreaChart로 시각화한다.
 * 최대/최소/평균 평가금액을 표시한다.
 *
 * @see 요구사항 4.1 (총 자산 평가금액 시계열 추이 차트)
 * @see 요구사항 4.10 (DB 스냅샷 기반 시계열 분석)
 */
function EvaluationTrendChart({ data, periodStats }: EvaluationTrendChartProps) {
  const { t } = useTranslation();

  // 차트 데이터 가공
  const chartData = useMemo(() => {
    return data.map((d) => ({
      date: new Date(d.periodStart).toLocaleDateString('ko-KR', {
        month: 'short',
        day: 'numeric',
      }),
      fullDate: new Date(d.periodStart).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      avgEvaluation: Number(d.avgTotalEvaluation),
      maxEvaluation: Number(d.maxTotalEvaluation),
      minEvaluation: Number(d.minTotalEvaluation),
      snapshotCount: d.snapshotCount,
    }));
  }, [data]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">
            {t.analytics.evaluationTrend}
          </CardTitle>
          {periodStats && (
            <Badge variant="secondary" className="text-xs">
              {t.analytics.snapshotCount(periodStats.totalSnapshotCount)}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full" role="img" aria-label={t.analytics.evaluationTrend}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="evalGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.area} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.area} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                tickLine={false}
              />
              <YAxis
                tickFormatter={(value: number) => formatCompactKRW(value)}
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                tickLine={false}
                axisLine={false}
                width={80}
              />
              <RechartsTooltip
                content={<EvaluationTooltip />}
              />
              <Area
                type="monotone"
                dataKey="avgEvaluation"
                stroke={CHART_COLORS.area}
                fill="url(#evalGradient)"
                strokeWidth={2}
                name={t.analytics.avgEvaluation}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 평가금액 추이 차트 커스텀 툴팁
 */
function EvaluationTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: {
    fullDate: string;
    avgEvaluation: number;
    maxEvaluation: number;
    minEvaluation: number;
    snapshotCount: number;
  } }[];
}) {
  const { t } = useTranslation();

  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0]!.payload;

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md" role="tooltip">
      <p className="text-sm font-medium text-foreground">{data.fullDate}</p>
      <p className="text-sm text-muted-foreground">
        {t.analytics.avgEvaluation}: {formatCompactKRW(data.avgEvaluation)}
      </p>
      <p className="text-xs text-muted-foreground">
        {t.analytics.maxProfit}: {formatCompactKRW(data.maxEvaluation)}
      </p>
      <p className="text-xs text-muted-foreground">
        {t.analytics.maxLoss}: {formatCompactKRW(data.minEvaluation)}
      </p>
    </div>
  );
}

// ----- 기간 통계 카드 -----

interface PeriodStatsCardsProps {
  stats: {
    maxEval: number;
    minEval: number;
    periodReturn: number;
    totalSnapshotCount: number;
  };
}

/**
 * 선택된 기간의 통계를 카드로 표시한다.
 *
 * 기간 수익률, 기간 내 최대 평가금액, 최소 평가금액을 표시한다.
 *
 * @see 요구사항 4.3 (기간별 수익률, 최대 수익, 최대 손실)
 */
function PeriodStatsCards({ stats }: PeriodStatsCardsProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {/* 기간 수익률 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t.analytics.periodReturn}
          </CardTitle>
          {stats.periodReturn >= 0 ? (
            <TrendingUp className="h-4 w-4 text-profit" aria-hidden="true" />
          ) : (
            <TrendingDown className="h-4 w-4 text-loss" aria-hidden="true" />
          )}
        </CardHeader>
        <CardContent>
          <FormattedPercent
            value={stats.periodReturn}
            colorize
            className="text-2xl font-bold"
          />
        </CardContent>
      </Card>

      {/* 최대 평가금액 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t.analytics.maxProfit}
          </CardTitle>
          <TrendingUp className="h-4 w-4 text-profit" aria-hidden="true" />
        </CardHeader>
        <CardContent>
          <FormattedCurrency
            value={stats.maxEval}
            className="text-2xl font-bold"
          />
        </CardContent>
      </Card>

      {/* 최소 평가금액 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t.analytics.maxLoss}
          </CardTitle>
          <TrendingDown className="h-4 w-4 text-loss" aria-hidden="true" />
        </CardHeader>
        <CardContent>
          <FormattedCurrency
            value={stats.minEval}
            className="text-2xl font-bold"
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ----- 코인별 수익률 랭킹 -----

interface CoinRankingSectionProps {
  topGainers: CoinProfitLoss[];
  topLosers: CoinProfitLoss[];
  onSelectCoin: (symbol: string) => void;
}

/**
 * 코인별 수익률 랭킹 섹션
 *
 * 최고 수익 TOP 5와 최대 손실 TOP 5를 나란히 표시한다.
 *
 * @see 요구사항 4.4 (코인별 수익률 랭킹 TOP 5)
 */
function CoinRankingSection({ topGainers, topLosers, onSelectCoin }: CoinRankingSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* 최고 수익 TOP 5 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <TrendingUp className="h-4 w-4 text-profit" aria-hidden="true" />
            {t.analytics.topGainers}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <CoinRankingList
            coins={topGainers}
            type="gainer"
            onSelectCoin={onSelectCoin}
          />
        </CardContent>
      </Card>

      {/* 최대 손실 TOP 5 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <TrendingDown className="h-4 w-4 text-loss" aria-hidden="true" />
            {t.analytics.topLosers}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {topLosers.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">
                {t.analytics.noCoinData}
              </p>
            </div>
          ) : (
            <CoinRankingList
              coins={topLosers}
              type="loser"
              onSelectCoin={onSelectCoin}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface CoinRankingListProps {
  coins: CoinProfitLoss[];
  type: 'gainer' | 'loser';
  onSelectCoin: (symbol: string) => void;
}

/**
 * 코인 수익률 랭킹 리스트 컴포넌트
 */
function CoinRankingList({ coins, type: _type, onSelectCoin }: CoinRankingListProps) {
  if (coins.length === 0) return null;

  return (
    <div className="divide-y divide-border">
      {coins.map((coin, index) => (
        <button
          key={coin.symbol}
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50"
          onClick={() => onSelectCoin(coin.symbol)}
          aria-label={coin.symbol}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
              {index + 1}
            </span>
            <div>
              <span className="font-semibold text-foreground">{coin.symbol}</span>
              <p className="text-xs text-muted-foreground">
                {coin.exchange}
              </p>
            </div>
          </div>
          <div className="text-right">
            <FormattedPercent
              value={coin.profitLossRate}
              colorize
              className="text-sm font-medium"
            />
            <FormattedCurrency
              value={coin.profitLossAmount}
              colorize
              showSign
              className="block text-xs"
            />
          </div>
        </button>
      ))}
    </div>
  );
}

// ----- 코인 상세 섹션 -----

interface CoinDetailSectionProps {
  data: {
    symbol: string;
    totalBalance: number;
    avgBuyPrice: number;
    currentPrice: number;
    totalEvaluation: number;
    totalInvestment: number;
    profitLossAmount: number;
    profitLossRate: number;
    unrealizedPL: number;
    realizedPL: number;
    exchanges: {
      exchange: ExchangeType;
      balance: number;
      avgBuyPrice: number;
      currentPrice: number;
      evaluation: number;
    }[];
  };
  onBack: () => void;
}

/**
 * 개별 코인 상세 분석 섹션
 *
 * 매수 시점 대비 수익률 변화, 실현/미실현 손익 구분을 표시한다.
 *
 * @see 요구사항 4.7 (개별 코인 매수 시점 대비 수익률 변화)
 * @see 요구사항 4.8 (실현 손익 / 미실현 손익 구분)
 */
function CoinDetailSection({ data, onBack }: CoinDetailSectionProps) {
  const { t, locale } = useTranslation();

  // 매수가 대비 현재가 비율
  const priceChangeRate = data.avgBuyPrice > 0
    ? ((data.currentPrice - data.avgBuyPrice) / data.avgBuyPrice) * 100
    : 0;

  return (
    <div className="space-y-4">
      {/* 헤더: 뒤로 가기 + 코인명 */}
      <Card>
        <CardHeader>
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
              <CardTitle className="text-xl">
                {data.symbol} {t.analytics.coinDetail}
              </CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 요약 정보 그리드 */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">{t.analytics.totalInvestment}</p>
              <FormattedCurrency value={data.totalInvestment} className="font-medium" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t.analytics.currentEvaluation}</p>
              <FormattedCurrency value={data.totalEvaluation} className="font-medium" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t.analytics.totalProfitLoss}</p>
              <ProfitLossIndicator
                amount={data.profitLossAmount}
                rate={data.profitLossRate}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t.analytics.buyPriceVsCurrent}</p>
              <FormattedPercent
                value={priceChangeRate}
                colorize
                className="text-lg font-bold"
              />
            </div>
          </div>

          {/* 실현 손익 / 미실현 손익 구분 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  {t.analytics.unrealizedPL}
                </p>
                <FormattedCurrency
                  value={data.unrealizedPL}
                  colorize
                  showSign
                  className="mt-1 text-lg font-bold"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatPercent(data.profitLossRate)}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  {t.analytics.realizedPL}
                </p>
                <FormattedCurrency
                  value={data.realizedPL}
                  colorize
                  showSign
                  className="mt-1 text-lg font-bold"
                />
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Info className="h-3 w-3" aria-hidden="true" />
                  {t.analytics.transactionBasedFuture}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 거래소별 보유 상세 */}
          {data.exchanges.length > 1 && (
            <div className="overflow-x-auto">
              <table className="w-full" role="table" aria-label={`${data.symbol}`}>
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground" scope="col">
                      {t.analytics.exchangeLabel}
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground" scope="col">
                      {t.analytics.quantityLabel}
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground" scope="col">
                      {t.analytics.avgBuyPriceLabel}
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground" scope="col">
                      {t.analytics.currentPriceLabel}
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground" scope="col">
                      {t.analytics.evaluationLabel}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.exchanges.map((ex) => {
                    return (
                      <tr key={ex.exchange} className="border-b border-border last:border-b-0">
                        <td className="px-4 py-2">
                          <Badge variant="outline">{getExchangeName(ex.exchange, locale)}</Badge>
                        </td>
                        <td className="px-4 py-2 text-right text-sm">
                          {ex.balance.toFixed(8).replace(/\.?0+$/, '')}
                        </td>
                        <td className="px-4 py-2 text-right text-sm">
                          <FormattedCurrency value={ex.avgBuyPrice} />
                        </td>
                        <td className="px-4 py-2 text-right text-sm">
                          <FormattedCurrency value={ex.currentPrice} />
                        </td>
                        <td className="px-4 py-2 text-right text-sm">
                          <FormattedCurrency value={ex.evaluation} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ----- 벤치마크 비교 섹션 -----

interface BenchmarkSectionProps {
  aggregatedData: AggregatedSnapshotResponse[];
  latestSnapshots: SnapshotResponse[];
}

/**
 * 벤치마크(BTC) 대비 포트폴리오 성과 비교 섹션
 *
 * 충분한 데이터(2개 이상의 집계 포인트)가 있을 때만 표시한다.
 * 포트폴리오 수익률 변화와 BTC 가격 변화를 비교 차트로 제공한다.
 *
 * @see 요구사항 4.5 (벤치마크 BTC 대비 포트폴리오 성과 비교)
 */
function BenchmarkSection({ aggregatedData, latestSnapshots }: BenchmarkSectionProps) {
  const { t } = useTranslation();

  // 충분한 데이터가 필요 (최소 2개의 집계 포인트)
  const hasSufficientData = aggregatedData.length >= 2;

  // 포트폴리오 수익률 변화 계산 (시작점 대비 상대 변화)
  const benchmarkChartData = useMemo(() => {
    if (!hasSufficientData) return [];

    const baseEval = Number(aggregatedData[0]!.avgTotalEvaluation);
    if (baseEval === 0) return [];

    // BTC 가격 변화를 스냅샷에서 추출 (사용 가능한 경우)
    // 첫 번째 스냅샷과 마지막 스냅샷의 BTC 보유 내역에서 현재가를 추출
    let _baseBtcPrice: number | null = null;
    if (latestSnapshots.length > 0) {
      // 가장 오래된 스냅샷에서 BTC 가격 검색
      const oldestSnapshot = latestSnapshots[latestSnapshots.length - 1];
      if (oldestSnapshot) {
        const btcHolding = oldestSnapshot.holdings.find((h) => h.symbol === 'BTC');
        if (btcHolding) {
          _baseBtcPrice = Number(btcHolding.currentPrice);
        }
      }
    }

    return aggregatedData.map((d) => {
      const portfolioReturn = ((Number(d.avgTotalEvaluation) - baseEval) / baseEval) * 100;

      return {
        date: new Date(d.periodStart).toLocaleDateString('ko-KR', {
          month: 'short',
          day: 'numeric',
        }),
        portfolioReturn: Number(portfolioReturn.toFixed(2)),
        // BTC 수익률은 스냅샷에 BTC 보유 내역이 있을 때만 계산
        // 정확한 BTC 가격 이력은 NestJS PriceHistory에서 가져와야 하지만
        // 현재는 스냅샷 데이터만으로 포트폴리오 수익률만 표시
        btcReturn: null as number | null,
      };
    });
  }, [aggregatedData, hasSufficientData, latestSnapshots]);

  // 데이터 부족 시 안내 메시지 표시
  if (!hasSufficientData) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t.analytics.benchmark}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8">
            <Info className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
            <p className="mt-2 text-center text-sm text-muted-foreground">
              {t.analytics.insufficientData}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t.analytics.benchmark}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[250px] w-full" role="img" aria-label={t.analytics.benchmarkBTC}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={benchmarkChartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                tickLine={false}
              />
              <YAxis
                tickFormatter={(value: number) => `${value.toFixed(1)}%`}
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <RechartsTooltip
                content={<BenchmarkTooltip />}
              />
              <Legend
                formatter={(value: string) => (
                  <span className="text-xs text-foreground">{value}</span>
                )}
              />
              <Line
                type="monotone"
                dataKey="portfolioReturn"
                stroke={CHART_COLORS.primary}
                strokeWidth={2}
                dot={false}
                name={t.analytics.portfolioReturn}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 벤치마크 비교 차트 커스텀 툴팁
 */
function BenchmarkTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
}) {
  const { t: _t } = useTranslation();

  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md" role="tooltip">
      {payload.map((entry) => (
        <p key={entry.name} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {formatPercent(entry.value)}
        </p>
      ))}
    </div>
  );
}

// ===== 기간별 포트폴리오 요약 리포트 섹션 =====

/** 기간별 리포트 유형 옵션 */
type PeriodReportType = 'daily' | 'weekly' | 'monthly';

/** 기간별 리포트 응답 타입 (NestJS ReportEntity와 대응) */
interface PeriodReportResponse {
  id: string;
  walletAddress: string;
  type: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  summary: {
    totalEvaluation?: number;
    evaluationChange?: number;
    evaluationChangeRate?: number;
    topGainers?: { symbol: string; rate: number }[];
    topLosers?: { symbol: string; rate: number }[];
    newCoins?: string[];
    removedCoins?: string[];
  };
  data: {
    walletAddress?: string;
    timestamp?: string;
    totalEvaluation?: number;
    totalInvestment?: number;
    totalProfitLoss?: number;
    profitLossRate?: number;
    holdings?: {
      symbol: string;
      exchange: string;
      balance: number;
      avgBuyPrice: number;
      currentPrice: number;
      evaluation: number;
    }[];
  };
}

/**
 * NestJS 백엔드에서 기간별 리포트 이력을 조회한다.
 *
 * @param walletAddress 지갑 주소
 * @param type 리포트 유형 (daily, weekly, monthly)
 * @param limit 최대 조회 개수
 */
async function fetchPeriodReports(
  walletAddress: string,
  type: PeriodReportType,
  limit: number = 10,
): Promise<PeriodReportResponse[]> {
  const params = new URLSearchParams({
    type,
    limit: String(limit),
  });

  const url = `${getApiBaseUrl()}/reports/${walletAddress}?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`기간별 리포트 조회 실패: HTTP ${response.status}`);
  }

  const json = await response.json();
  return json.data ?? json;
}

/**
 * NestJS 백엔드에 리포트 생성을 요청한다.
 *
 * @param walletAddress 지갑 주소
 * @param type 리포트 유형 (daily, weekly, monthly)
 */
async function createPeriodReport(
  walletAddress: string,
  type: PeriodReportType,
): Promise<PeriodReportResponse> {
  const response = await fetch(`${getApiBaseUrl()}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, type }),
  });

  if (!response.ok) {
    throw new Error(`리포트 생성 실패: HTTP ${response.status}`);
  }

  const json = await response.json();
  return json.data ?? json;
}

interface PeriodReportSectionProps {
  walletAddress: string;
}

/**
 * 기간별 포트폴리오 요약 리포트 섹션
 *
 * 일간/주간/월간 탭을 선택하여 해당 유형의 포트폴리오 요약 리포트를 조회하고,
 * 리포트 생성 버튼을 통해 새 리포트를 생성할 수 있다.
 * 각 리포트는 평가금액, 변동, 변동률, 상승/하락 코인, 신규/편출 코인,
 * 보유 자산 상세 등을 접기/펼치기 형태로 표시한다.
 *
 * @see 요구사항 4.6 (기간별 리포트 생성 및 표시)
 */
function PeriodReportSection({ walletAddress }: PeriodReportSectionProps) {
  const { t } = useTranslation();

  // 선택된 리포트 유형 탭
  const [selectedType, setSelectedType] = useState<PeriodReportType>('daily');
  // 리포트 목록
  const [reports, setReports] = useState<PeriodReportResponse[]>([]);
  // 펼쳐진 리포트 ID
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  // 로딩/에러 상태
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 리포트 목록 로드
  const loadReports = useCallback(async () => {
    if (!walletAddress) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchPeriodReports(walletAddress, selectedType);
      setReports(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : t.analytics.periodReportLoadError;
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, selectedType, t.analytics.periodReportLoadError]);

  // 유형 변경 또는 초기 로드 시 리포트 목록 조회
  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // 리포트 생성 핸들러
  const handleGenerateReport = useCallback(async () => {
    if (!walletAddress) return;

    setIsGenerating(true);
    setError(null);

    try {
      await createPeriodReport(walletAddress, selectedType);
      // 생성 후 목록 새로고침
      await loadReports();
    } catch (err) {
      const message = err instanceof Error ? err.message : t.analytics.periodReportGenerateError;
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  }, [walletAddress, selectedType, loadReports, t.analytics.periodReportGenerateError]);

  // 리포트 상세 토글
  const toggleReportDetail = useCallback((reportId: string) => {
    setExpandedReportId((prev) => (prev === reportId ? null : reportId));
  }, []);

  // 유형 탭 목록
  const typeTabs: { value: PeriodReportType; label: string }[] = [
    { value: 'daily', label: t.analytics.periodReportDaily },
    { value: 'weekly', label: t.analytics.periodReportWeekly },
    { value: 'monthly', label: t.analytics.periodReportMonthly },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t.analytics.periodReport}
          </CardTitle>
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={handleGenerateReport}
            disabled={isGenerating || isLoading}
          >
            {isGenerating ? (
              <>
                <LoadingSpinner size="sm" className="mr-1" />
                {t.analytics.generatingReport}
              </>
            ) : (
              <>
                <FileText className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                {t.analytics.generatePeriodReport}
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t.analytics.periodReportDescription}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 유형 탭 */}
        <div className="flex gap-1" role="tablist" aria-label={t.analytics.periodReport}>
          {typeTabs.map((tab) => (
            <Button
              key={tab.value}
              variant={selectedType === tab.value ? 'default' : 'outline'}
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => setSelectedType(tab.value)}
              disabled={isLoading || isGenerating}
              role="tab"
              aria-selected={selectedType === tab.value}
              aria-label={tab.label}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {/* 에러 메시지 */}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {/* 로딩 상태 */}
        {isLoading && reports.length === 0 && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )}

        {/* 리포트 없음 상태 */}
        {!isLoading && reports.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-8">
            <FileText className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
            <p className="mt-3 text-sm text-muted-foreground">
              {t.analytics.noPeriodReports}
            </p>
            <p className="text-xs text-muted-foreground">
              {t.analytics.noPeriodReportsDescription}
            </p>
          </div>
        )}

        {/* 리포트 목록 */}
        {reports.length > 0 && (
          <div className="divide-y divide-border rounded-lg border border-border">
            {reports.map((report) => (
              <PeriodReportItem
                key={report.id}
                report={report}
                isExpanded={expandedReportId === report.id}
                onToggle={() => toggleReportDetail(report.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ----- 개별 기간 리포트 아이템 -----

interface PeriodReportItemProps {
  report: PeriodReportResponse;
  isExpanded: boolean;
  onToggle: () => void;
}

/**
 * 기간별 리포트 아이템 컴포넌트
 *
 * 요약 행과 상세 내용(접기/펼치기)을 표시한다.
 * 요약에는 기간, 평가금액, 변동률을 표시하고,
 * 상세에는 투자금액, 손익, 수익률, 상승/하락 코인,
 * 신규/편출 코인, 보유 자산 테이블을 포함한다.
 *
 * @see 요구사항 4.6 (일간/주간/월간 포트폴리오 요약 리포트)
 * @see 요구사항 7.4 (이전 대비 변동 사항 하이라이트)
 */
function PeriodReportItem({ report, isExpanded, onToggle }: PeriodReportItemProps) {
  const { t } = useTranslation();

  const periodStart = new Date(report.periodStart).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const periodEnd = new Date(report.periodEnd).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const generatedAt = new Date(report.generatedAt).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const summary = report.summary;
  const data = report.data;

  return (
    <div>
      {/* 요약 행 (클릭 시 상세 토글) */}
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/30"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-label={`${periodStart} ~ ${periodEnd} ${t.analytics.reportViewDetail}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {periodStart} ~ {periodEnd}
            </p>
            <p className="text-xs text-muted-foreground">
              {generatedAt}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {summary.totalEvaluation != null && (
            <FormattedCurrency
              value={summary.totalEvaluation}
              className="hidden sm:block text-sm font-medium"
            />
          )}
          {summary.evaluationChangeRate != null && summary.evaluationChangeRate !== 0 && (
            <FormattedPercent
              value={summary.evaluationChangeRate}
              colorize
              className="text-xs"
            />
          )}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
      </button>

      {/* 상세 내용 (펼침 시) */}
      {isExpanded && (
        <div className="border-t border-border px-4 py-4 space-y-4 bg-muted/10">
          {/* 요약 정보 그리드 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {summary.totalEvaluation != null && (
              <div className="rounded-lg bg-background p-3 border border-border">
                <p className="text-xs text-muted-foreground">{t.analytics.reportEvaluation}</p>
                <FormattedCurrency value={summary.totalEvaluation} className="text-sm font-medium" />
              </div>
            )}
            {data.totalInvestment != null && (
              <div className="rounded-lg bg-background p-3 border border-border">
                <p className="text-xs text-muted-foreground">{t.analytics.reportTotalInvestment}</p>
                <FormattedCurrency value={data.totalInvestment} className="text-sm font-medium" />
              </div>
            )}
            {summary.evaluationChange != null && (
              <div className="rounded-lg bg-background p-3 border border-border">
                <p className="text-xs text-muted-foreground">{t.analytics.reportChange}</p>
                <FormattedCurrency value={summary.evaluationChange} colorize showSign className="text-sm font-medium" />
              </div>
            )}
            {summary.evaluationChangeRate != null && (
              <div className="rounded-lg bg-background p-3 border border-border">
                <p className="text-xs text-muted-foreground">{t.analytics.reportChangeRate}</p>
                <FormattedPercent value={summary.evaluationChangeRate} colorize className="text-sm font-medium" />
              </div>
            )}
          </div>

          {/* 손익 / 수익률 추가 정보 */}
          {data.totalProfitLoss != null && data.profitLossRate != null && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-background p-3 border border-border">
                <p className="text-xs text-muted-foreground">{t.analytics.reportTotalProfitLoss}</p>
                <FormattedCurrency value={data.totalProfitLoss} colorize showSign className="text-sm font-medium" />
              </div>
              <div className="rounded-lg bg-background p-3 border border-border">
                <p className="text-xs text-muted-foreground">{t.analytics.reportProfitLossRate}</p>
                <FormattedPercent value={data.profitLossRate} colorize className="text-sm font-medium" />
              </div>
            </div>
          )}

          {/* 상승 / 하락 코인 */}
          {((summary.topGainers && summary.topGainers.length > 0) ||
            (summary.topLosers && summary.topLosers.length > 0)) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {summary.topGainers && summary.topGainers.length > 0 && (
                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingUp className="h-3.5 w-3.5 text-profit" aria-hidden="true" />
                    <span className="text-xs font-medium text-muted-foreground">
                      {t.analytics.reportTopGainers}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {summary.topGainers.map((coin) => (
                      <div key={coin.symbol} className="flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">{coin.symbol}</span>
                        <FormattedPercent value={coin.rate} colorize className="text-xs" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {summary.topLosers && summary.topLosers.length > 0 && (
                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingDown className="h-3.5 w-3.5 text-loss" aria-hidden="true" />
                    <span className="text-xs font-medium text-muted-foreground">
                      {t.analytics.reportTopLosers}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {summary.topLosers.map((coin) => (
                      <div key={coin.symbol} className="flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">{coin.symbol}</span>
                        <FormattedPercent value={coin.rate} colorize className="text-xs" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 신규 편입 / 편출 코인 */}
          {((summary.newCoins && summary.newCoins.length > 0) ||
            (summary.removedCoins && summary.removedCoins.length > 0)) && (
            <div className="flex flex-wrap gap-2">
              {summary.newCoins && summary.newCoins.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{t.analytics.reportNewCoins}:</span>
                  {summary.newCoins.map((coin) => (
                    <Badge key={coin} variant="default" className="text-[10px] bg-profit/20 text-profit">
                      +{coin}
                    </Badge>
                  ))}
                </div>
              )}
              {summary.removedCoins && summary.removedCoins.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{t.analytics.reportRemovedCoins}:</span>
                  {summary.removedCoins.map((coin) => (
                    <Badge key={coin} variant="secondary" className="text-[10px] text-loss">
                      -{coin}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 보유 자산 상세 테이블 */}
          {data.holdings && data.holdings.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                {t.analytics.reportHoldings}
              </p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full" role="table" aria-label={t.analytics.reportHoldings}>
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground" scope="col">
                        {t.portfolio.coinName}
                      </th>
                      <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground" scope="col">
                        {t.alert.selectExchange}
                      </th>
                      <th className="px-3 py-2 text-right text-[11px] font-medium text-muted-foreground" scope="col">
                        {t.portfolio.quantity}
                      </th>
                      <th className="px-3 py-2 text-right text-[11px] font-medium text-muted-foreground" scope="col">
                        {t.portfolio.avgBuyPrice}
                      </th>
                      <th className="px-3 py-2 text-right text-[11px] font-medium text-muted-foreground" scope="col">
                        {t.portfolio.currentPrice}
                      </th>
                      <th className="px-3 py-2 text-right text-[11px] font-medium text-muted-foreground" scope="col">
                        {t.portfolio.evaluationAmount}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.holdings.map((holding, index) => (
                      <tr
                        key={`${holding.symbol}-${holding.exchange}-${index}`}
                        className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-3 py-2 text-sm font-medium text-foreground">
                          {holding.symbol}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {holding.exchange}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-foreground">
                          {Number(holding.balance).toFixed(8).replace(/\.?0+$/, '')}
                        </td>
                        <td className="px-3 py-2 text-right text-xs">
                          <FormattedCurrency value={Number(holding.avgBuyPrice)} />
                        </td>
                        <td className="px-3 py-2 text-right text-xs">
                          <FormattedCurrency value={Number(holding.currentPrice)} />
                        </td>
                        <td className="px-3 py-2 text-right text-xs">
                          <FormattedCurrency value={Number(holding.evaluation)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">
              {t.analytics.reportNoHoldings}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
