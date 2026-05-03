/**
 * 포트폴리오 통합기 (PortfolioAggregator)
 *
 * 여러 거래소 데이터를 통합하고, 코인별 합산(MergedHolding)을 생성하며,
 * 정렬/필터링 기능을 제공한다. 순수 비즈니스 로직으로 외부 의존성이 없다.
 *
 * 핵심 기능:
 * - 거래소별 포트폴리오 통합 -> AggregatedPortfolio 생성
 * - 동일 코인 다중 거래소 보유 시 코인별 합산 (가중 평균 매수가)
 * - 정렬 (평가금액, 수익률, 코인명 등)
 * - 필터링 (거래소별, 수익/손실 구분)
 * - 개별 코인 상세 요약 (거래소별 보유 비교)
 *
 * @see 요구사항 2.1, 2.2, 2.3, 2.9, 2.10
 * @see 설계 문서 3.1.4 PortfolioAggregator
 */

import type {
  ExchangePortfolio,
  AggregatedPortfolio,
  MergedHolding,
  Holding,
  SortCriteria,
  SortDirection,
  HoldingFilter,
  CoinSummary,
  PriceMap,
  AssetDistribution,
  ProfitLossResult,
} from '@bitscope/shared';

import {
  calculateProfitLoss,
  calculateAssetDistribution,
  calculateWeightedAvgBuyPrice,
  calculateRate,
} from './calculator';

/**
 * 여러 거래소 포트폴리오를 통합하여 AggregatedPortfolio를 생성한다.
 *
 * 1. 모든 거래소의 Holding 데이터를 코인 심볼 기준으로 그룹핑한다.
 * 2. 동일 코인이 여러 거래소에 존재하면 가중 평균 매수가를 산출한다.
 * 3. 전체 통합 수치(총 평가금액, 총 투자금액, 총 손익, 수익률)를 계산한다.
 *
 * @param portfolios 거래소별 포트폴리오 배열
 * @returns 통합된 전체 포트폴리오
 *
 * @see 요구사항 2.1 (통합 총 평가금액, 투자금액, 손익, 수익률)
 * @see 요구사항 2.3 (동일 코인 다중 거래소 보유 시 통합)
 */
export function aggregatePortfolios(
  portfolios: ExchangePortfolio[],
): AggregatedPortfolio {
  // connected 상태인 포트폴리오만 통합 대상으로 한다
  const activePortfolios = portfolios.filter((p) => p.status === 'connected');

  // 코인 심볼 기준으로 보유 내역을 그룹핑한다
  const mergedHoldings = mergeHoldingsBySymbol(activePortfolios);

  // 전체 통합 수치를 계산한다
  const totalEvaluation = activePortfolios.reduce(
    (sum, p) => sum + p.totalEvaluation,
    0,
  );
  const totalInvestment = activePortfolios.reduce(
    (sum, p) => sum + p.totalInvestment,
    0,
  );
  const totalProfitLoss = totalEvaluation - totalInvestment;
  const profitLossRate =
    totalInvestment > 0 ? (totalProfitLoss / totalInvestment) * 100 : 0;
  const totalKrwBalance = activePortfolios.reduce(
    (sum, p) => sum + p.krwBalance,
    0,
  );

  // 가장 최근 업데이트 시각을 기준으로 한다
  const lastUpdated =
    activePortfolios.length > 0
      ? new Date(
          Math.max(...activePortfolios.map((p) => p.lastUpdated.getTime())),
        )
      : new Date();

  return {
    portfolios,
    mergedHoldings,
    totalEvaluation,
    totalInvestment,
    totalProfitLoss,
    profitLossRate,
    totalKrwBalance,
    lastUpdated,
  };
}

/**
 * 모든 거래소의 보유 내역을 코인 심볼 기준으로 합산한다.
 *
 * 동일 코인을 여러 거래소에서 보유하는 경우:
 * - 보유 수량은 합산한다.
 * - 매수 평균가는 보유 수량을 가중치로 한 가중 평균을 사용한다.
 * - 현재가는 거래소 중 가장 최신 데이터를 기준으로 한다.
 *
 * @param portfolios connected 상태의 거래소 포트폴리오 배열
 * @returns 코인별 통합 보유 내역 배열
 */
function mergeHoldingsBySymbol(
  portfolios: ExchangePortfolio[],
): MergedHolding[] {
  // 심볼 기준으로 그룹핑한다
  const symbolMap = new Map<string, Holding[]>();

  for (const portfolio of portfolios) {
    for (const holding of portfolio.holdings) {
      const existing = symbolMap.get(holding.symbol);
      if (existing) {
        existing.push(holding);
      } else {
        symbolMap.set(holding.symbol, [holding]);
      }
    }
  }

  // 그룹별로 MergedHolding을 생성한다
  const merged: MergedHolding[] = [];

  for (const [symbol, holdings] of symbolMap) {
    const totalBalance = holdings.reduce((sum, h) => sum + h.balance, 0);

    // 가중 평균 매수가를 계산한다
    const weightedAvgBuyPrice = calculateWeightedAvgBuyPrice(
      holdings.map((h) => ({ balance: h.balance, avgBuyPrice: h.avgBuyPrice })),
    );

    // 현재가는 평가금액이 가장 큰 거래소(주거래소)의 가격을 기준으로 한다
    const primaryHolding = holdings.reduce((prev, curr) =>
      curr.evaluationAmount > prev.evaluationAmount ? curr : prev,
    );
    const currentPrice = primaryHolding.currentPrice;

    // 총 평가금액과 총 손익을 계산한다
    const totalEvaluation = holdings.reduce(
      (sum, h) => sum + h.evaluationAmount,
      0,
    );
    const totalInvestment = holdings.reduce(
      (sum, h) => sum + h.balance * h.avgBuyPrice,
      0,
    );
    const totalProfitLoss = totalEvaluation - totalInvestment;
    const profitLossRate = calculateRate(weightedAvgBuyPrice, currentPrice);

    // 거래소별 상세 내역을 구성한다
    const exchanges = holdings.map((h) => ({
      exchange: h.exchange,
      balance: h.balance,
      avgBuyPrice: h.avgBuyPrice,
      evaluation: h.evaluationAmount,
      profitLoss: h.profitLoss,
      profitLossRate: h.profitLossRate,
    }));

    merged.push({
      symbol,
      totalBalance,
      weightedAvgBuyPrice,
      currentPrice,
      totalEvaluation,
      totalProfitLoss,
      profitLossRate,
      exchanges,
    });
  }

  // 평가금액 기준 내림차순으로 기본 정렬한다
  merged.sort((a, b) => b.totalEvaluation - a.totalEvaluation);

  return merged;
}

/**
 * 특정 코인의 거래소별 보유 상세 요약을 생성한다.
 *
 * 사용자가 대시보드에서 특정 코인을 선택했을 때
 * 거래소별 보유 수량, 매수가, 현재가, 수익률을 비교할 수 있다.
 *
 * @param symbol 코인 심볼
 * @param portfolios 거래소별 포트폴리오 배열
 * @returns 코인 상세 요약. 해당 코인을 보유하지 않으면 null
 *
 * @see 요구사항 2.8 (특정 코인 선택 시 거래소별 보유 상세 비교)
 */
export function getCoinSummary(
  symbol: string,
  portfolios: ExchangePortfolio[],
): CoinSummary | null {
  const matchingHoldings: Holding[] = [];

  for (const portfolio of portfolios) {
    if (portfolio.status !== 'connected') {
      continue;
    }
    for (const holding of portfolio.holdings) {
      if (holding.symbol === symbol) {
        matchingHoldings.push(holding);
      }
    }
  }

  if (matchingHoldings.length === 0) {
    return null;
  }

  const totalBalance = matchingHoldings.reduce((sum, h) => sum + h.balance, 0);
  const weightedAvgBuyPrice = calculateWeightedAvgBuyPrice(
    matchingHoldings.map((h) => ({
      balance: h.balance,
      avgBuyPrice: h.avgBuyPrice,
    })),
  );

  // 평가금액이 가장 큰 거래소의 현재가를 대표 가격으로 사용한다
  const primaryHolding = matchingHoldings.reduce((prev, curr) =>
    curr.evaluationAmount > prev.evaluationAmount ? curr : prev,
  );
  const currentPrice = primaryHolding.currentPrice;

  const totalEvaluation = matchingHoldings.reduce(
    (sum, h) => sum + h.evaluationAmount,
    0,
  );
  const totalInvestment = matchingHoldings.reduce(
    (sum, h) => sum + h.balance * h.avgBuyPrice,
    0,
  );
  const totalProfitLoss = totalEvaluation - totalInvestment;
  const profitLossRate = calculateRate(weightedAvgBuyPrice, currentPrice);

  const exchanges = matchingHoldings.map((h) => ({
    exchange: h.exchange,
    balance: h.balance,
    avgBuyPrice: h.avgBuyPrice,
    currentPrice: h.currentPrice,
    evaluation: h.evaluationAmount,
    profitLoss: h.profitLoss,
    profitLossRate: h.profitLossRate,
  }));

  return {
    symbol,
    totalBalance,
    weightedAvgBuyPrice,
    currentPrice,
    totalEvaluation,
    totalProfitLoss,
    profitLossRate,
    exchanges,
  };
}

/**
 * 보유 내역을 지정한 기준으로 정렬한다.
 *
 * @param holdings 정렬할 보유 내역 배열
 * @param criteria 정렬 기준 (evaluationAmount, profitLossRate, symbol, balance, currentPrice)
 * @param direction 정렬 방향 (기본값: 'desc')
 * @returns 정렬된 보유 내역 배열 (새로운 배열, 원본 불변)
 *
 * @see 요구사항 2.9 (정렬 기준 변경 시 즉시 재정렬)
 */
export function sortHoldings(
  holdings: Holding[],
  criteria: SortCriteria,
  direction: SortDirection = 'desc',
): Holding[] {
  const sorted = [...holdings];
  const multiplier = direction === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    switch (criteria) {
      case 'evaluationAmount':
        return (a.evaluationAmount - b.evaluationAmount) * multiplier;
      case 'profitLossRate':
        return (a.profitLossRate - b.profitLossRate) * multiplier;
      case 'symbol':
        return a.symbol.localeCompare(b.symbol) * multiplier;
      case 'balance':
        return (a.balance - b.balance) * multiplier;
      case 'currentPrice':
        return (a.currentPrice - b.currentPrice) * multiplier;
      default:
        return 0;
    }
  });

  return sorted;
}

/**
 * MergedHolding 배열을 지정한 기준으로 정렬한다.
 *
 * 통합 뷰에서 코인별 합산 데이터를 정렬할 때 사용한다.
 *
 * @param mergedHoldings 정렬할 통합 보유 내역 배열
 * @param criteria 정렬 기준
 * @param direction 정렬 방향 (기본값: 'desc')
 * @returns 정렬된 통합 보유 내역 배열 (새로운 배열, 원본 불변)
 */
export function sortMergedHoldings(
  mergedHoldings: MergedHolding[],
  criteria: SortCriteria,
  direction: SortDirection = 'desc',
): MergedHolding[] {
  const sorted = [...mergedHoldings];
  const multiplier = direction === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    switch (criteria) {
      case 'evaluationAmount':
        return (a.totalEvaluation - b.totalEvaluation) * multiplier;
      case 'profitLossRate':
        return (a.profitLossRate - b.profitLossRate) * multiplier;
      case 'symbol':
        return a.symbol.localeCompare(b.symbol) * multiplier;
      case 'balance':
        return (a.totalBalance - b.totalBalance) * multiplier;
      case 'currentPrice':
        return (a.currentPrice - b.currentPrice) * multiplier;
      default:
        return 0;
    }
  });

  return sorted;
}

/**
 * 보유 내역을 필터 조건에 따라 필터링한다.
 *
 * @param holdings 필터링할 보유 내역 배열
 * @param filter 필터 조건 (거래소별, 수익/손실 구분)
 * @returns 필터 조건에 맞는 보유 내역 배열 (새로운 배열, 원본 불변)
 *
 * @see 요구사항 2.10 (거래소별, 수익/손실 구분 필터)
 */
export function filterHoldings(
  holdings: Holding[],
  filter: HoldingFilter,
): Holding[] {
  let result = [...holdings];

  // 거래소 필터 적용
  if (filter.exchanges && filter.exchanges.length > 0) {
    result = result.filter((h) => filter.exchanges!.includes(h.exchange));
  }

  // 수익/손실 필터 적용
  if (filter.profitLossType && filter.profitLossType !== 'all') {
    if (filter.profitLossType === 'profit') {
      result = result.filter((h) => h.profitLoss >= 0);
    } else {
      result = result.filter((h) => h.profitLoss < 0);
    }
  }

  return result;
}

/**
 * MergedHolding 배열을 필터 조건에 따라 필터링한다.
 *
 * 통합 뷰에서 코인별 합산 데이터를 필터링할 때 사용한다.
 * 거래소 필터는 해당 거래소에 보유 내역이 있는 코인만 표시한다.
 *
 * @param mergedHoldings 필터링할 통합 보유 내역 배열
 * @param filter 필터 조건
 * @returns 필터 조건에 맞는 통합 보유 내역 배열 (새로운 배열, 원본 불변)
 */
export function filterMergedHoldings(
  mergedHoldings: MergedHolding[],
  filter: HoldingFilter,
): MergedHolding[] {
  let result = [...mergedHoldings];

  // 거래소 필터: 선택된 거래소의 데이터만 남기고 수치를 재계산
  if (filter.exchanges && filter.exchanges.length > 0) {
    const selectedExchanges = filter.exchanges;

    result = result
      .map((m) => {
        // 선택된 거래소의 내역만 필터링
        const filteredExchanges = m.exchanges.filter((e) =>
          selectedExchanges.includes(e.exchange),
        );

        // 선택된 거래소에 해당 코인이 없으면 제외
        if (filteredExchanges.length === 0) return null;

        // 모든 거래소가 포함되면 원본 그대로 반환 (재계산 불필요)
        if (filteredExchanges.length === m.exchanges.length) return m;

        // 선택된 거래소만으로 수치 재계산
        const totalBalance = filteredExchanges.reduce((sum, e) => sum + e.balance, 0);
        const totalEvaluation = filteredExchanges.reduce((sum, e) => sum + e.evaluation, 0);
        const totalProfitLoss = filteredExchanges.reduce((sum, e) => sum + e.profitLoss, 0);
        const weightedAvgBuyPrice = totalBalance > 0
          ? filteredExchanges.reduce((sum, e) => sum + e.balance * e.avgBuyPrice, 0) / totalBalance
          : 0;
        const profitLossRate = weightedAvgBuyPrice > 0
          ? ((m.currentPrice - weightedAvgBuyPrice) / weightedAvgBuyPrice) * 100
          : 0;

        return {
          ...m,
          exchanges: filteredExchanges,
          totalBalance,
          weightedAvgBuyPrice,
          totalEvaluation,
          totalProfitLoss,
          profitLossRate,
        };
      })
      .filter((m): m is MergedHolding => m !== null);
  }

  // 수익/손실 필터 적용
  if (filter.profitLossType && filter.profitLossType !== 'all') {
    if (filter.profitLossType === 'profit') {
      result = result.filter((m) => m.totalProfitLoss >= 0);
    } else {
      result = result.filter((m) => m.totalProfitLoss < 0);
    }
  }

  return result;
}

/**
 * 최신 가격을 반영하여 포트폴리오 손익을 재계산한다.
 *
 * 실시간 시세 업데이트 시 포트폴리오 전체 손익을 갱신하는 데 사용한다.
 *
 * @param holdings 보유 자산 목록
 * @param currentPrices 심볼별 최신 가격 맵
 * @returns 재계산된 손익 결과
 */
export function recalculateProfitLoss(
  holdings: Holding[],
  currentPrices: PriceMap,
): ProfitLossResult {
  return calculateProfitLoss(holdings, currentPrices);
}

/**
 * 통합 포트폴리오의 자산 분포를 계산한다.
 *
 * @param portfolio 통합 포트폴리오
 * @returns 코인별, 거래소별 자산 분포
 *
 * @see 요구사항 2.7 (자산 분포 도넛/파이 차트)
 */
export function getAssetDistribution(
  portfolio: AggregatedPortfolio,
): AssetDistribution {
  return calculateAssetDistribution(
    portfolio.mergedHoldings,
    portfolio.portfolios.filter((p) => p.status === 'connected'),
  );
}
