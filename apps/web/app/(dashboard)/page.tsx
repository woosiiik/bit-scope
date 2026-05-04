/**
 * 통합 포트폴리오 대시보드 메인 페이지
 *
 * 등록된 모든 거래소의 자산을 통합하여 표시한다.
 * - 총 평가금액, 총 투자금액, 총 손익, 총 수익률 요약 카드
 * - 자산 분포 도넛 차트 (코인별 비중, 거래소별 비중)
 * - 거래소별/통합 보유 코인 테이블 (정렬, 필터 지원)
 * - 거래소별 로딩 상태 개별 표시
 * - 자동 갱신(기본 30초) 및 수동 새로고침
 * - 특정 코인 선택 시 거래소별 보유 상세 비교
 * - 최초 로그인 시 온보딩 마법사 표시
 * - API 키 미등록 시 데모 모드 지원
 *
 * @see 요구사항 2.1~2.11 (통합 포트폴리오 대시보드)
 * @see 요구사항 2.7 (자산 분포를 도넛/파이 차트로 시각화)
 * @see 요구사항 9.5 (스켈레톤 UI / 로딩 인디케이터)
 * @see 요구사항 9.7 (숫자 데이터 포맷)
 * @see 요구사항 9.8 (수익 녹색/손실 빨간색 색상 구분)
 * @see 요구사항 11.1 (단계별 온보딩 가이드)
 * @see 요구사항 11.3 (데모 데이터 미리보기 모드)
 * @see 요구사항 11.4 (온보딩 완료 후 대시보드 이동)
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Wallet,
  BarChart3,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ArrowLeft,
  Filter,
  Plus,
} from 'lucide-react';
import { useAccount } from 'wagmi';
import type { ExchangeType, SortCriteria, MergedHolding } from '@bitscope/shared';
import { SUPPORTED_EXCHANGES, DOMESTIC_EXCHANGES, FOREIGN_EXCHANGES, DEX_EXCHANGES } from '@bitscope/shared';
import type { WalletSummary } from '@/lib/api-client';
import { cn, getExchangeName } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { getCachedEncryptionKey, cacheEncryptionKey, hasEncryptedKeys, loadEncryptedKey, getRegisteredExchanges } from '@/lib/crypto/encryption-service';
import { deriveEncryptionKey } from '@/lib/crypto/key-derivation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FormattedCurrency,
  FormattedPercent,
  FormattedPrice,
  FormattedQuantity,
  ProfitLossIndicator,
} from '@/components/ui/formatted-number';
import { DashboardSkeleton } from '@/components/ui/skeleton';
import { ErrorDisplay, ExchangeErrorBadge } from '@/components/ui/error-display';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { AssetDistributionCharts } from '@/components/charts';
import { OnboardingWizard, DemoModeBanner } from '@/components/onboarding';
import { getAssetDistribution } from '@/lib/portfolio/aggregator';
import { usePortfolioStore } from '@/store/portfolio-store';

// ===== 대시보드 메인 페이지 =====

export default function DashboardPage() {
  const { address } = useAccount();
  const { t, locale } = useTranslation();
  const { signMessage } = useWalletAuth();
  const walletAddress = address ?? '';

  // 암호화 키 확보 상태
  const [encryptionKeyReady, setEncryptionKeyReady] = useState(false);
  const [encryptionKeyError, setEncryptionKeyError] = useState(false);

  // 대시보드 진입 시 암호화 키 확보 (sessionStorage에 없으면 지갑 서명 요청)
  useEffect(() => {
    if (!walletAddress) return;
    if (encryptionKeyReady) return;
    if (!hasEncryptedKeys(walletAddress)) {
      setEncryptionKeyReady(true);
      return;
    }

    const cached = getCachedEncryptionKey();
    if (cached) {
      setEncryptionKeyReady(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const exchanges = getRegisteredExchanges(walletAddress);
        let existingNonce: string | undefined;
        for (const ex of exchanges) {
          const stored = loadEncryptedKey(walletAddress, ex);
          if (stored?.nonce) {
            existingNonce = stored.nonce;
            break;
          }
        }

        const derivation = await deriveEncryptionKey(walletAddress, signMessage, existingNonce);
        if (!cancelled) {
          cacheEncryptionKey(derivation.derivedKey, derivation.nonce);
          setEncryptionKeyReady(true);
        }
      } catch {
        if (!cancelled) {
          setEncryptionKeyError(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [walletAddress, signMessage, encryptionKeyReady]);

  // 온보딩 상태 관리
  const onboarding = useOnboarding(walletAddress);

  const portfolio = usePortfolio({
    walletAddress,
    // 암호화 키가 준비되지 않았거나, 온보딩 중이거나, 데모 모드인 경우 비활성화
    enabled: !!walletAddress && encryptionKeyReady && !onboarding.shouldShowOnboarding && !onboarding.isDemoMode,
  });

  // 데모 모드용 자산 분포 데이터
  const demoAssetDistribution = useMemo(() => {
    if (!onboarding.isDemoMode || !onboarding.demoPortfolio) return null;
    return getAssetDistribution(onboarding.demoPortfolio);
  }, [onboarding.isDemoMode, onboarding.demoPortfolio]);

  // 거래소별 지갑 요약 (해외 거래소의 Unified/Spot 합계)
  const walletSummaries = usePortfolioStore((s) => s.walletSummaries);

  // 자산 분포 데이터 계산 (차트용)
  const aggregatedPortfolio = usePortfolioStore((s) => s.aggregatedPortfolio);
  const assetDistribution = useMemo(() => {
    if (!aggregatedPortfolio) return null;
    return getAssetDistribution(aggregatedPortfolio);
  }, [aggregatedPortfolio]);

  // 필터 적용 시 요약 수치를 mergedHoldings 기준으로 재계산
  const isFiltered = !!(portfolio.filter.exchanges && portfolio.filter.exchanges.length > 0)
    || !!(portfolio.filter.profitLossType && portfolio.filter.profitLossType !== 'all');

  const filteredSummary = useMemo(() => {
    if (!isFiltered) {
      // 필터 없으면 전체 합산
      return {
        totalEvaluation: portfolio.totalEvaluation,
        totalInvestment: portfolio.totalInvestment,
        totalProfitLoss: portfolio.totalProfitLoss,
        profitLossRate: portfolio.profitLossRate,
        filterLabel: undefined as string | undefined,
      };
    }

    // 필터된 mergedHoldings에서 재계산
    const holdings = portfolio.mergedHoldings;
    const totalEvaluation = holdings.reduce((sum, h) => sum + h.totalEvaluation, 0);
    const totalInvestment = holdings.reduce((sum, h) => sum + h.totalBalance * h.weightedAvgBuyPrice, 0);
    const totalProfitLoss = totalEvaluation - totalInvestment;
    const profitLossRate = totalInvestment > 0 ? (totalProfitLoss / totalInvestment) * 100 : 0;

    // 필터 레이블 생성
    const labels: string[] = [];
    if (portfolio.filter.exchanges && portfolio.filter.exchanges.length > 0) {
      const names = portfolio.filter.exchanges.map((e) => getExchangeName(e, locale));
      labels.push(names.join(', '));
    }

    return {
      totalEvaluation,
      totalInvestment,
      totalProfitLoss,
      profitLossRate,
      filterLabel: labels.length > 0 ? labels.join(' · ') : undefined,
    };
  }, [isFiltered, portfolio.mergedHoldings, portfolio.totalEvaluation, portfolio.totalInvestment, portfolio.totalProfitLoss, portfolio.profitLossRate, portfolio.filter]);

  // 암호화 키 로딩 중
  if (!encryptionKeyReady && !encryptionKeyError && hasEncryptedKeys(walletAddress)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4 md:p-6">
        <LoadingSpinner size="lg" message={t.apiKey.settingsPage.signatureDescription} />
      </div>
    );
  }

  // 암호화 키 도출 실패
  if (encryptionKeyError) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4 md:p-6">
        <ErrorDisplay
          title={t.apiKey.settingsPage.signatureRequired}
          message={t.apiKey.settingsPage.signatureRequiredForDecrypt}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  // 온보딩 마법사 표시 (최초 로그인, API 키 미등록 시)
  if (onboarding.shouldShowOnboarding) {
    return (
      <OnboardingWizard
        onboarding={onboarding}
        walletAddress={walletAddress}
      />
    );
  }

  // 데모 모드: 모의 데이터로 대시보드 표시
  if (onboarding.isDemoMode && onboarding.demoPortfolio) {
    const demo = onboarding.demoPortfolio;
    return (
      <div className="space-y-6 p-4 md:p-6">
        {/* 데모 모드 배너 */}
        <DemoModeBanner onExit={() => {
          // 데모 모드 종료 시 isDemoMode를 false로 변경
          // (페이지가 리렌더링되며 실제 포트폴리오 조회 시작)
          onboarding.exitDemoMode();
        }} />

        {/* 대시보드 헤더 */}
        <DashboardHeader
          lastUpdated={demo.lastUpdated}
          isLoading={false}
          onRefresh={() => {}}
          isDemoMode
        />

        {/* 요약 카드 */}
        <SummaryCards
          totalEvaluation={demo.totalEvaluation}
          totalInvestment={demo.totalInvestment}
          totalProfitLoss={demo.totalProfitLoss}
          profitLossRate={demo.profitLossRate}
        />

        {/* 자산 분포 차트 (데모) */}
        {demoAssetDistribution && (
          <AssetDistributionCharts distribution={demoAssetDistribution} />
        )}

        {/* 데모 보유 코인 테이블 */}
        <HoldingsTable
          mergedHoldings={demo.mergedHoldings}
          sortCriteria="evaluationAmount"
          sortDirection="desc"
          isLoading={false}
          loadingStates={{}}
          onToggleSort={() => {}}
          onSelectCoin={() => {}}
        />
      </div>
    );
  }

  // 초기 로딩 시 스켈레톤 표시
  if (portfolio.isInitialLoading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <DashboardSkeleton />
      </div>
    );
  }

  // 모든 거래소 에러 시 전체 오류 화면
  if (portfolio.isAllError && !portfolio.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4 md:p-6">
        <ErrorDisplay
          title={t.errors.general.title}
          message={t.errors.general.message}
          onRetry={portfolio.refetchAll}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 헤더 영역: 타이틀 + 새로고침 + 마지막 업데이트 */}
      <DashboardHeader
        lastUpdated={portfolio.lastUpdated}
        isLoading={portfolio.isLoading}
        onRefresh={portfolio.refetchAll}
      />

      {/* 거래소 필터 (맨 위) - 등록된 거래소만 표시 */}
      <ExchangeFilterBar
        filter={portfolio.filter}
        onFilterChange={portfolio.setFilter}
        registeredExchanges={Object.keys(portfolio.exchangeStates).filter(
          (ex) => portfolio.exchangeStates[ex as ExchangeType]?.data || portfolio.exchangeStates[ex as ExchangeType]?.errorMessage
        ) as ExchangeType[]}
      />

      {/* 거래소별 오류 배지 */}
      {portfolio.hasPartialError && (
        <ExchangeErrorBadges
          exchangeStates={portfolio.exchangeStates}
          onRetry={portfolio.refetchExchange}
        />
      )}

      {/* 요약 카드 영역 - 필터 적용 시 필터된 데이터 기준으로 재계산 */}
      <SummaryCards
        totalEvaluation={filteredSummary.totalEvaluation}
        totalInvestment={filteredSummary.totalInvestment}
        totalProfitLoss={filteredSummary.totalProfitLoss}
        profitLossRate={filteredSummary.profitLossRate}
        filterLabel={filteredSummary.filterLabel}
      />

      {/* 거래소별 자산 요약 (해외 거래소 Spot/Futures/Margin/Earn 합산) */}
      <ExchangeAssetSummary
        exchangeStates={portfolio.exchangeStates}
        walletSummaries={walletSummaries}
      />

      {/* 자산 분포 차트 (코인별 비중, 거래소별 비중) */}
      {assetDistribution && (
        <AssetDistributionCharts distribution={assetDistribution} />
      )}

      {/* 코인 상세 보기 또는 보유 테이블 */}
      {portfolio.selectedCoin && portfolio.selectedCoinSummary ? (
        <CoinDetailView
          coinSummary={portfolio.selectedCoinSummary}
          onBack={() => portfolio.selectCoin(null)}
        />
      ) : (
        <>
          {/* 필터/정렬 컨트롤 */}
          <TableControls
            viewMode={portfolio.viewMode}
            sortCriteria={portfolio.sortCriteria}
            sortDirection={portfolio.sortDirection}
            filter={portfolio.filter}
            onViewModeChange={portfolio.setViewMode}
            onToggleSort={portfolio.toggleSort}
            onFilterChange={portfolio.setFilter}
          />

          {/* 보유 코인 테이블 */}
          <HoldingsTable
            mergedHoldings={portfolio.mergedHoldings}
            sortCriteria={portfolio.sortCriteria}
            sortDirection={portfolio.sortDirection}
            isLoading={portfolio.isLoading}
            loadingStates={portfolio.loadingStates}
            onToggleSort={portfolio.toggleSort}
            onSelectCoin={portfolio.selectCoin}
          />
        </>
      )}
    </div>
  );
}

// ===== 서브 컴포넌트 =====

// ----- 대시보드 헤더 -----

interface DashboardHeaderProps {
  lastUpdated: Date | null;
  isLoading: boolean;
  onRefresh: () => void;
  /** 데모 모드 여부 */
  isDemoMode?: boolean;
}

/**
 * 대시보드 상단 헤더 영역
 *
 * 페이지 타이틀, 마지막 업데이트 시각, 새로고침 버튼을 표시한다.
 * 데모 모드에서는 새로고침 버튼을 비활성화한다.
 *
 * @see 요구사항 2.5 (수동 새로고침 버튼)
 */
function DashboardHeader({ lastUpdated, isLoading, onRefresh, isDemoMode }: DashboardHeaderProps) {
  const { t } = useTranslation();

  const formattedTime = lastUpdated
    ? lastUpdated.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {t.nav.dashboard}
        </h1>
        {formattedTime && (
          <p className="text-sm text-muted-foreground">
            {t.common.lastUpdate}: {formattedTime}
          </p>
        )}
      </div>
      {!isDemoMode && (
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
      )}
    </div>
  );
}

// ----- 거래소별 오류 배지 -----

interface ExchangeErrorBadgesProps {
  exchangeStates: ReturnType<typeof usePortfolio>['exchangeStates'];
  onRetry: (exchange: ExchangeType) => void;
}

/**
 * 오류 상태인 거래소들의 배지를 표시한다.
 *
 * @see 요구사항 2.6 (거래소 오류 시 마지막 성공 시점 데이터 표시)
 */
function ExchangeErrorBadges({ exchangeStates, onRetry }: ExchangeErrorBadgesProps) {
  const { t, locale } = useTranslation();
  const errorExchanges = Object.values(exchangeStates).filter(
    (s) => s?.errorMessage,
  );

  if (errorExchanges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" role="status" aria-label={t.dashboard.exchangeConnectionStatus}>
      {errorExchanges.map((state) => {
        if (!state) return null;
        return (
          <div key={state.exchange} className="flex items-center gap-1">
            <ExchangeErrorBadge
              exchangeName={getExchangeName(state.exchange, locale)}
              lastUpdated={state.lastUpdated ?? undefined}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs"
              onClick={() => onRetry(state.exchange)}
              aria-label={t.dashboard.exchangeRetry(getExchangeName(state.exchange, locale))}
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

// ----- 요약 카드 영역 -----

interface SummaryCardsProps {
  totalEvaluation: number;
  totalInvestment: number;
  totalProfitLoss: number;
  profitLossRate: number;
  /** 필터 적용 시 표시할 레이블 (예: "빗썸") */
  filterLabel?: string;
}

/**
 * 포트폴리오 요약 카드 4개를 그리드로 표시한다.
 *
 * @see 요구사항 2.1 (총 평가금액, 총 투자금액, 총 손익, 총 수익률)
 */
function SummaryCards({
  totalEvaluation,
  totalInvestment,
  totalProfitLoss,
  profitLossRate,
  filterLabel,
}: SummaryCardsProps) {
  const { t } = useTranslation();

  const cards = [
    {
      label: t.dashboard.totalEvaluation,
      value: totalEvaluation,
      icon: Wallet,
      colorize: false,
    },
    {
      label: t.dashboard.totalInvestment,
      value: totalInvestment,
      icon: BarChart3,
      colorize: false,
    },
    {
      label: t.dashboard.totalProfitLoss,
      value: totalProfitLoss,
      icon: totalProfitLoss >= 0 ? TrendingUp : TrendingDown,
      colorize: true,
    },
    {
      label: t.dashboard.totalProfitLossRate,
      value: profitLossRate,
      icon: totalProfitLoss >= 0 ? TrendingUp : TrendingDown,
      colorize: true,
      isPercent: true,
    },
  ];

  return (
    <div className="space-y-2">
      {filterLabel && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" aria-hidden="true" />
          <span>{filterLabel} 기준</span>
        </div>
      )}
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
    </div>
  );
}

// ----- 거래소별 자산 요약 섹션 -----

interface ExchangeAssetSummaryProps {
  exchangeStates: ReturnType<typeof usePortfolio>['exchangeStates'];
  walletSummaries: Partial<Record<ExchangeType, WalletSummary>>;
}

/**
 * 거래소별 자산 요약 섹션
 *
 * 등록된 각 거래소의 전체 자산 합계를 한눈에 표시한다.
 * - 국내 거래소(업비트/빗썸/코인원): KRW 기준 표시
 * - 해외 거래소(바이빗/OKX): Unified 계정 totalEquity(USDT) + KRW 환산
 * - 해외 거래소(바이낸스/Gate/Bitget): Spot 합계만 표시(USDT) + KRW 환산
 */
function ExchangeAssetSummary({ exchangeStates, walletSummaries }: ExchangeAssetSummaryProps) {
  const { t, locale } = useTranslation();

  // 등록된 거래소만 필터링 (데이터가 있는 거래소)
  const registeredExchanges = SUPPORTED_EXCHANGES.filter(
    (ex) => exchangeStates[ex]?.data,
  );

  if (registeredExchanges.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-base font-semibold text-foreground">
        {t.dashboard.exchangeAssetSummary}
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {registeredExchanges.map((exchange) => {
          const state = exchangeStates[exchange];
          if (!state?.data) return null;

          const isDomestic = (DOMESTIC_EXCHANGES as readonly string[]).includes(exchange);
          const dexList = DEX_EXCHANGES ?? [];
          const isForeign = (FOREIGN_EXCHANGES as readonly string[]).includes(exchange)
            || (dexList as readonly string[]).includes(exchange);
          const walletSummary = walletSummaries[exchange];

          const domesticTotal = isDomestic
            ? (state.data.holdings?.reduce((sum: number, h: { evaluationAmount?: number }) => sum + (h.evaluationAmount ?? 0), 0) ?? 0) + (state.data.krwBalance ?? 0)
            : 0;

          return (
            <Card key={exchange} className="p-0">
              <CardContent className="p-3">
                {/* 거래소 이름 + 뱃지 */}
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-sm font-medium text-foreground truncate">
                    {getExchangeName(exchange, locale)}
                  </span>
                  {isForeign && walletSummary && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                      {walletSummary.wallets.length === 1 && walletSummary.wallets[0]?.name === 'Unified'
                        ? 'Unified'
                        : walletSummary.wallets.some((w) => w.name === 'Futures')
                          ? t.dashboard.spotAndFutures
                          : 'Spot'}
                    </Badge>
                  )}
                </div>

                {/* 금액 */}
                <div>
                  {isDomestic ? (
                    <FormattedCurrency
                      value={domesticTotal}
                      currency="KRW"
                      compact
                      className="text-sm font-semibold text-foreground"
                    />
                  ) : isForeign && walletSummary ? (
                    <>
                      <FormattedCurrency
                        value={walletSummary.totalEquityUsdt}
                        currency="USD"
                        className="text-sm font-semibold text-foreground"
                      />
                      {state.data.krwBalance > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          ≈ {new Intl.NumberFormat('ko-KR', {
                            style: 'currency',
                            currency: 'KRW',
                            maximumFractionDigits: 0,
                            notation: 'compact',
                          }).format(state.data.krwBalance)}
                        </p>
                      )}
                    </>
                  ) : (
                    <FormattedCurrency
                      value={state.data.krwBalance}
                      currency="KRW"
                      compact
                      className="text-sm font-semibold text-foreground"
                    />
                  )}
                </div>

                {/* 해외 거래소: 지갑별 상세 (2개 이상) */}
                {isForeign && walletSummary && walletSummary.wallets.length > 1 && (
                  <div className="mt-1.5 pt-1.5 border-t border-border space-y-0.5">
                    {walletSummary.wallets.map((wallet) => (
                      <div key={wallet.name} className="flex justify-between text-[10px] text-muted-foreground">
                        <span>{wallet.name}</span>
                        <FormattedCurrency value={wallet.balanceUsdt} currency="USD" className="text-[10px]" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {/* 거래소 추가 카드 */}
        <Link href="/settings" className="block">
          <Card className="p-0 h-full border-dashed hover:border-primary/50 transition-colors cursor-pointer">
            <CardContent className="p-3 flex flex-col items-center justify-center h-full min-h-[72px] gap-1.5">
              <Plus className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <span className="text-xs font-medium text-muted-foreground">
                {t.dashboard.addExchange}
              </span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}

// ----- 거래소 필터 바 (화면 상단) -----

interface ExchangeFilterBarProps {
  filter: { exchanges?: ExchangeType[]; profitLossType?: 'profit' | 'loss' | 'all' };
  onFilterChange: (filter: { exchanges?: ExchangeType[]; profitLossType?: 'profit' | 'loss' | 'all' }) => void;
  /** 등록된(API Key가 있는) 거래소 목록 */
  registeredExchanges: ExchangeType[];
}

/**
 * 거래소 필터 바
 *
 * 그룹 필터(전체/국내/해외/DEX) + 개별 거래소 필터를 제공한다.
 * 등록된 거래소만 표시한다.
 */
function ExchangeFilterBar({ filter, onFilterChange, registeredExchanges }: ExchangeFilterBarProps) {
  const { t, locale } = useTranslation();

  /** 그룹 필터 핸들러 */
  const handleGroupFilter = useCallback(
    (group: 'all' | 'domestic' | 'foreign' | 'dex') => {
      if (group === 'all') {
        onFilterChange({ ...filter, exchanges: undefined });
      } else {
        const domestic = DOMESTIC_EXCHANGES ?? [];
        const foreign = FOREIGN_EXCHANGES ?? [];
        const dex = DEX_EXCHANGES ?? [];
        const exchanges = group === 'domestic'
          ? [...domestic]
          : group === 'foreign'
            ? [...foreign]
            : [...dex];
        onFilterChange({ ...filter, exchanges: exchanges as ExchangeType[] });
      }
    },
    [filter, onFilterChange],
  );

  /** 개별 거래소 토글 */
  const handleExchangeToggle = useCallback(
    (exchange: ExchangeType) => {
      const current = filter.exchanges ?? [];
      const isSelected = current.includes(exchange);
      const newExchanges = isSelected
        ? current.filter((e) => e !== exchange)
        : [...current, exchange];
      onFilterChange({ ...filter, exchanges: newExchanges.length > 0 ? newExchanges : undefined });
    },
    [filter, onFilterChange],
  );

  /** 현재 활성 그룹 계산 */
  const activeGroup = useMemo(() => {
    if (!filter.exchanges) return 'all';
    const selected = new Set(filter.exchanges);
    if (selected.size === 0) return 'all';
    const domestic = DOMESTIC_EXCHANGES ?? [];
    const foreign = FOREIGN_EXCHANGES ?? [];
    const dex = DEX_EXCHANGES ?? [];
    if (domestic.length > 0 && domestic.every((e) => selected.has(e)) && selected.size === domestic.length) return 'domestic';
    if (foreign.length > 0 && foreign.every((e) => selected.has(e)) && selected.size === foreign.length) return 'foreign';
    if (dex.length > 0 && dex.every((e) => selected.has(e)) && selected.size === dex.length) return 'dex';
    return null;
  }, [filter.exchanges]);

  // 등록된 거래소가 있는 그룹만 표시
  const registeredSet = new Set(registeredExchanges);
  const hasDomestic = (DOMESTIC_EXCHANGES ?? []).some((e) => registeredSet.has(e));
  const hasForeign = (FOREIGN_EXCHANGES ?? []).some((e) => registeredSet.has(e));
  const hasDex = (DEX_EXCHANGES ?? []).some((e) => registeredSet.has(e));

  const groups = [
    { key: 'all' as const, label: t.dashboard.allLabel, show: true },
    { key: 'domestic' as const, label: t.dashboard.domesticLabel, show: hasDomestic },
    { key: 'foreign' as const, label: t.dashboard.foreignLabel, show: hasForeign },
    { key: 'dex' as const, label: t.dashboard.dexLabel, show: hasDex },
  ].filter((g) => g.show);

  // 등록된 거래소가 1개 이하면 필터 불필요
  if (registeredExchanges.length <= 1) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 그룹 필터 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {groups.map((group) => (
          <Button
            key={group.key}
            variant={activeGroup === group.key ? 'default' : 'outline'}
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => handleGroupFilter(group.key)}
          >
            {group.label}
          </Button>
        ))}
        <div className="w-px h-5 bg-border mx-1" />
        {/* 개별 거래소 필터 (등록된 거래소만) */}
        {registeredExchanges.map((exchange) => {
          const isActive = !filter.exchanges || filter.exchanges.includes(exchange);
          return (
            <Button
              key={exchange}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              className={cn(
                'h-6 px-2 text-[11px]',
                !isActive && 'opacity-40',
              )}
              onClick={() => handleExchangeToggle(exchange)}
            >
              {getExchangeName(exchange, locale)}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

// ----- 테이블 컨트롤 (필터/정렬/뷰 모드) -----

interface TableControlsProps {
  viewMode: 'merged' | 'byExchange';
  sortCriteria: SortCriteria;
  sortDirection: 'asc' | 'desc';
  filter: { exchanges?: ExchangeType[]; profitLossType?: 'profit' | 'loss' | 'all' };
  onViewModeChange: (mode: 'merged' | 'byExchange') => void;
  onToggleSort: (criteria: SortCriteria) => void;
  onFilterChange: (filter: { exchanges?: ExchangeType[]; profitLossType?: 'profit' | 'loss' | 'all' }) => void;
}

/**
 * 보유 코인 테이블 상단의 필터/정렬 컨트롤
 *
 * @see 요구사항 2.9 (정렬 기준 변경)
 * @see 요구사항 2.10 (필터 적용)
 */
function TableControls({
  viewMode: _viewMode,
  sortCriteria: _sortCriteria,
  sortDirection: _sortDirection,
  filter,
  onViewModeChange: _onViewModeChange,
  onToggleSort: _onToggleSort,
  onFilterChange,
}: TableControlsProps) {
  const { t } = useTranslation();

  /** 수익/손실 필터 버튼 핸들러 */
  const handleProfitLossFilter = useCallback(
    (type: 'all' | 'profit' | 'loss') => {
      onFilterChange({ ...filter, profitLossType: type });
    },
    [filter, onFilterChange],
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-lg font-semibold text-foreground">
        {t.dashboard.holdings}
      </h2>

      <div className="flex flex-wrap items-center gap-2">
        {/* 수익/손실 필터 */}
        {(['all', 'profit', 'loss'] as const).map((type) => {
          const labels = { all: t.dashboard.allLabel, profit: t.dashboard.profitLabel, loss: t.dashboard.lossLabel };
          const isActive = (filter.profitLossType ?? 'all') === type;
          return (
            <Button
              key={type}
              variant={isActive ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => handleProfitLossFilter(type)}
              aria-pressed={isActive}
            >
              {labels[type]}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

// ----- 정렬 가능한 테이블 헤더 -----

interface SortableHeaderProps {
  label: string;
  criteria: SortCriteria;
  currentCriteria: SortCriteria;
  currentDirection: 'asc' | 'desc';
  onToggle: (criteria: SortCriteria) => void;
  className?: string;
}

/**
 * 클릭으로 정렬 가능한 테이블 헤더 셀
 */
function SortableHeader({
  label,
  criteria,
  currentCriteria,
  currentDirection,
  onToggle,
  className,
}: SortableHeaderProps) {
  const isActive = currentCriteria === criteria;

  return (
    <button
      type="button"
      className={cn(
        'flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors',
        isActive && 'text-foreground',
        className,
      )}
      onClick={() => onToggle(criteria)}
      aria-label={label}
      aria-sort={
        isActive
          ? currentDirection === 'asc'
            ? 'ascending'
            : 'descending'
          : 'none'
      }
    >
      {label}
      {isActive ? (
        currentDirection === 'asc' ? (
          <ChevronUp className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        )
      ) : (
        <ChevronsUpDown className="h-3 w-3 opacity-50" aria-hidden="true" />
      )}
    </button>
  );
}

// ----- 보유 코인 테이블 -----

interface HoldingsTableProps {
  mergedHoldings: MergedHolding[];
  sortCriteria: SortCriteria;
  sortDirection: 'asc' | 'desc';
  isLoading: boolean;
  loadingStates: Partial<Record<ExchangeType, boolean>>;
  onToggleSort: (criteria: SortCriteria) => void;
  onSelectCoin: (symbol: string) => void;
}

/**
 * 통합 보유 코인 테이블
 *
 * MergedHolding 배열을 테이블로 렌더링한다.
 * 동일 코인을 여러 거래소에서 보유 시 거래소 뱃지를 표시한다.
 *
 * @see 요구사항 2.2 (거래소별 보유 코인 목록)
 * @see 요구사항 2.3 (동일 코인 다중 거래소 보유 시 통합)
 * @see 요구사항 2.8 (특정 코인 선택 시 거래소별 상세)
 * @see 요구사항 2.9 (정렬)
 */
function HoldingsTable({
  mergedHoldings,
  sortCriteria,
  sortDirection,
  isLoading,
  loadingStates: _loadingStates,
  onToggleSort,
  onSelectCoin,
}: HoldingsTableProps) {
  const { t } = useTranslation();

  if (mergedHoldings.length === 0 && !isLoading) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Wallet className="h-12 w-12 text-muted-foreground/50" aria-hidden="true" />
          <p className="mt-4 text-sm text-muted-foreground">
            {t.dashboard.noHoldings}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        {/* 데스크톱 테이블 */}
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full" role="table" aria-label={t.dashboard.holdings}>
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left" scope="col">
                    <SortableHeader
                      label={t.portfolio.coinName}
                      criteria="symbol"
                      currentCriteria={sortCriteria}
                      currentDirection={sortDirection}
                      onToggle={onToggleSort}
                    />
                  </th>
                  <th className="px-4 py-3 text-right" scope="col">
                    <SortableHeader
                      label={t.portfolio.quantity}
                      criteria="balance"
                      currentCriteria={sortCriteria}
                      currentDirection={sortDirection}
                      onToggle={onToggleSort}
                      className="justify-end"
                    />
                  </th>
                  <th className="px-4 py-3 text-right" scope="col">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t.portfolio.avgBuyPrice}
                    </span>
                  </th>
                  <th className="px-4 py-3 text-right" scope="col">
                    <SortableHeader
                      label={t.portfolio.currentPrice}
                      criteria="currentPrice"
                      currentCriteria={sortCriteria}
                      currentDirection={sortDirection}
                      onToggle={onToggleSort}
                      className="justify-end"
                    />
                  </th>
                  <th className="px-4 py-3 text-right" scope="col">
                    <SortableHeader
                      label={t.portfolio.evaluationAmount}
                      criteria="evaluationAmount"
                      currentCriteria={sortCriteria}
                      currentDirection={sortDirection}
                      onToggle={onToggleSort}
                      className="justify-end"
                    />
                  </th>
                  <th className="px-4 py-3 text-right" scope="col">
                    <SortableHeader
                      label={t.portfolio.profitLossRate}
                      criteria="profitLossRate"
                      currentCriteria={sortCriteria}
                      currentDirection={sortDirection}
                      onToggle={onToggleSort}
                      className="justify-end"
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {mergedHoldings.map((holding) => (
                  <HoldingRow
                    key={holding.symbol}
                    holding={holding}
                    onSelect={() => onSelectCoin(holding.symbol)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 모바일 카드 리스트 */}
        <div className="md:hidden divide-y divide-border">
          {mergedHoldings.map((holding) => (
            <HoldingCard
              key={holding.symbol}
              holding={holding}
              onSelect={() => onSelectCoin(holding.symbol)}
            />
          ))}
        </div>

        {/* 로딩 중 추가 인디케이터 */}
        {isLoading && mergedHoldings.length > 0 && (
          <div className="border-t border-border p-3">
            <LoadingSpinner
              size="sm"
              message={t.dashboard.loadingAssets}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ----- 보유 코인 행 (데스크톱) -----

interface HoldingRowProps {
  holding: MergedHolding;
  onSelect: () => void;
}

/**
 * 테이블 행: 코인 한 줄 표시 (데스크톱)
 *
 * 코인명, 수량, 매수평균가, 현재가, 평가금액, 수익률을 표시한다.
 * 여러 거래소에서 보유 시 거래소 뱃지를 함께 표시한다.
 *
 * @see 요구사항 2.2 (코인명, 수량, 매수 평균가, 현재가, 평가금액, 수익률)
 * @see 요구사항 2.3 (동일 코인 다중 거래소 보유 시 통합 + 개별 내역)
 */
function HoldingRow({ holding, onSelect }: HoldingRowProps) {
  const { locale } = useTranslation();

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
      aria-label={holding.symbol}
    >
      {/* 코인명 + 거래소 뱃지 */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-foreground">{holding.symbol}</span>
          <div className="flex flex-wrap gap-1">
            {holding.exchanges.map((ex) => (
              <Badge
                key={ex.exchange}
                variant="secondary"
                className="text-[10px] px-1.5 py-0"
              >
                {getExchangeName(ex.exchange, locale)}
              </Badge>
            ))}
          </div>
        </div>
      </td>

      {/* 수량 */}
      <td className="px-4 py-3 text-right">
        <FormattedQuantity value={holding.totalBalance} />
      </td>

      {/* 매수 평균가 */}
      <td className="px-4 py-3 text-right">
        <FormattedPrice value={holding.weightedAvgBuyPrice} symbol={holding.symbol} />
      </td>

      {/* 현재가 */}
      <td className="px-4 py-3 text-right">
        <FormattedPrice value={holding.currentPrice} symbol={holding.symbol} />
      </td>

      {/* 평가금액 */}
      <td className="px-4 py-3 text-right">
        <FormattedCurrency value={holding.totalEvaluation} className="font-medium" />
      </td>

      {/* 수익률 */}
      <td className="px-4 py-3 text-right">
        <ProfitLossIndicator
          amount={holding.totalProfitLoss}
          rate={holding.profitLossRate}
        />
      </td>
    </tr>
  );
}

// ----- 보유 코인 카드 (모바일) -----

interface HoldingCardProps {
  holding: MergedHolding;
  onSelect: () => void;
}

/**
 * 모바일용 보유 코인 카드
 *
 * @see 요구사항 9.1 (모바일에 최적화된 레이아웃)
 */
function HoldingCard({ holding, onSelect }: HoldingCardProps) {
  const { t, locale } = useTranslation();

  return (
    <button
      type="button"
      className="w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors"
      onClick={onSelect}
      aria-label={holding.symbol}
    >
      {/* 상단: 코인명 + 수익률 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{holding.symbol}</span>
          <div className="flex gap-0.5">
            {holding.exchanges.map((ex) => (
              <Badge
                key={ex.exchange}
                variant="secondary"
                className="text-[10px] px-1 py-0"
              >
                {getExchangeName(ex.exchange, locale)[0]}
              </Badge>
            ))}
          </div>
        </div>
        <FormattedPercent
          value={holding.profitLossRate}
          colorize
          className="text-sm font-medium"
        />
      </div>

      {/* 하단: 평가금액 + 손익 */}
      <div className="mt-1 flex items-center justify-between">
        <FormattedCurrency
          value={holding.totalEvaluation}
          className="text-sm text-foreground"
        />
        <FormattedCurrency
          value={holding.totalProfitLoss}
          colorize
          showSign
          className="text-xs"
        />
      </div>

      {/* 추가 정보: 수량 + 현재가 */}
      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {t.portfolio.quantity}: <FormattedQuantity value={holding.totalBalance} />
        </span>
        <span>
          {t.portfolio.currentPrice}: <FormattedPrice value={holding.currentPrice} symbol={holding.symbol} />
        </span>
      </div>
    </button>
  );
}

// ----- 코인 상세 보기 -----

interface CoinDetailViewProps {
  coinSummary: {
    symbol: string;
    totalBalance: number;
    weightedAvgBuyPrice: number;
    currentPrice: number;
    totalEvaluation: number;
    totalProfitLoss: number;
    profitLossRate: number;
    exchanges: {
      exchange: ExchangeType;
      balance: number;
      avgBuyPrice: number;
      currentPrice: number;
      evaluation: number;
      profitLoss: number;
      profitLossRate: number;
    }[];
  };
  onBack: () => void;
}

/**
 * 특정 코인의 거래소별 보유 상세 비교 화면
 *
 * 사용자가 보유 테이블에서 코인을 선택하면 표시된다.
 * 거래소별 수량, 매수가, 현재가, 수익률을 비교한다.
 *
 * @see 요구사항 2.8 (특정 코인 선택 시 거래소별 보유 상세 비교)
 */
function CoinDetailView({ coinSummary, onBack }: CoinDetailViewProps) {
  const { t, locale } = useTranslation();

  return (
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
            <CardTitle className="text-xl">{coinSummary.symbol}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t.portfolio.quantity}: <FormattedQuantity value={coinSummary.totalBalance} />
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 통합 요약 */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">{t.portfolio.avgBuyPrice}</p>
            <FormattedPrice
              value={coinSummary.weightedAvgBuyPrice}
              symbol={coinSummary.symbol}
              className="font-medium"
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t.portfolio.currentPrice}</p>
            <FormattedPrice
              value={coinSummary.currentPrice}
              symbol={coinSummary.symbol}
              className="font-medium"
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t.portfolio.evaluationAmount}</p>
            <FormattedCurrency value={coinSummary.totalEvaluation} className="font-medium" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t.dashboard.totalProfitLoss}</p>
            <ProfitLossIndicator
              amount={coinSummary.totalProfitLoss}
              rate={coinSummary.profitLossRate}
            />
          </div>
        </div>

        {/* 거래소별 상세 비교 테이블 */}
        <div className="overflow-x-auto">
          <table className="w-full" role="table" aria-label={t.dashboard.exchangeDetailHoldings(coinSummary.symbol)}>
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground" scope="col">
                  {t.dashboard.exchangeLabel}
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground" scope="col">
                  {t.portfolio.quantity}
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground" scope="col">
                  {t.portfolio.avgBuyPrice}
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground" scope="col">
                  {t.portfolio.currentPrice}
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground" scope="col">
                  {t.portfolio.evaluationAmount}
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground" scope="col">
                  {t.portfolio.profitLossRate}
                </th>
              </tr>
            </thead>
            <tbody>
              {coinSummary.exchanges.map((ex) => {
                return (
                  <tr
                    key={ex.exchange}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="px-4 py-2">
                      <Badge variant="outline">
                        {getExchangeName(ex.exchange, locale)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <FormattedQuantity value={ex.balance} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <FormattedPrice value={ex.avgBuyPrice} symbol={coinSummary.symbol} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <FormattedPrice value={ex.currentPrice} symbol={coinSummary.symbol} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <FormattedCurrency value={ex.evaluation} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <ProfitLossIndicator
                        amount={ex.profitLoss}
                        rate={ex.profitLossRate}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
