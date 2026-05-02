/**
 * 포트폴리오 수익률/손익 계산 유틸리티
 *
 * 수익률 계산, 자산 분포 비율 계산, 총 평가금액/투자금액/손익 산출을 담당한다.
 * 순수 비즈니스 로직으로 외부 의존성이 없다.
 *
 * @see 요구사항 2.1, 2.2 (총 평가금액, 투자금액, 손익, 수익률)
 * @see 설계 문서 3.1.4 PortfolioAggregator
 */

import type {
  ExchangeType,
  Holding,
  ExchangePortfolio,
  MergedHolding,
  AssetDistribution,
  PriceMap,
  ProfitLossResult,
} from '@bitscope/shared';

/**
 * 보유 자산 목록에 대해 최신 가격을 반영한 손익을 계산한다.
 *
 * PriceMap에 해당 심볼의 가격이 있으면 현재가를 갱신하고,
 * 없으면 기존 currentPrice를 유지한다.
 *
 * @param holdings 보유 자산 목록
 * @param currentPrices 심볼별 최신 가격 맵
 * @returns 총 평가금액, 총 투자금액, 총 손익, 수익률
 */
export function calculateProfitLoss(
  holdings: Holding[],
  currentPrices: PriceMap,
): ProfitLossResult {
  let totalEvaluation = 0;
  let totalInvestment = 0;

  for (const holding of holdings) {
    const price = currentPrices[holding.symbol] ?? holding.currentPrice;
    const evaluation = holding.balance * price;
    const investment = holding.balance * holding.avgBuyPrice;

    totalEvaluation += evaluation;
    totalInvestment += investment;
  }

  const totalProfitLoss = totalEvaluation - totalInvestment;
  const profitLossRate =
    totalInvestment > 0 ? (totalProfitLoss / totalInvestment) * 100 : 0;

  return {
    totalEvaluation,
    totalInvestment,
    totalProfitLoss,
    profitLossRate,
  };
}

/**
 * 통합 포트폴리오의 자산 분포를 계산한다.
 *
 * 코인별 비중과 거래소별 비중을 각각 산출하여 차트 렌더링에 사용한다.
 * 비율(ratio)은 0~100 사이의 퍼센트 값이다.
 *
 * @param mergedHoldings 코인별 통합 보유 내역
 * @param portfolios 거래소별 포트폴리오 배열
 * @returns 코인별, 거래소별 자산 분포
 *
 * @see 요구사항 2.7 (자산 분포 도넛/파이 차트)
 */
export function calculateAssetDistribution(
  mergedHoldings: MergedHolding[],
  portfolios: ExchangePortfolio[],
): AssetDistribution {
  // 코인별 비중 계산
  const totalCoinAmount = mergedHoldings.reduce(
    (sum, h) => sum + h.totalEvaluation,
    0,
  );

  const byCoin = mergedHoldings
    .filter((h) => h.totalEvaluation > 0)
    .map((h) => ({
      symbol: h.symbol,
      amount: h.totalEvaluation,
      ratio: totalCoinAmount > 0 ? (h.totalEvaluation / totalCoinAmount) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  // 거래소별 비중 계산
  const totalExchangeAmount = portfolios.reduce(
    (sum, p) => sum + p.totalEvaluation,
    0,
  );

  const byExchange = portfolios
    .filter((p) => p.totalEvaluation > 0)
    .map((p) => ({
      exchange: p.exchange,
      amount: p.totalEvaluation,
      ratio:
        totalExchangeAmount > 0
          ? (p.totalEvaluation / totalExchangeAmount) * 100
          : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return { byCoin, byExchange };
}

/**
 * 개별 보유 자산의 수익률을 계산한다.
 *
 * @param avgBuyPrice 매수 평균가
 * @param currentPrice 현재가
 * @returns 수익률 (%)
 */
export function calculateRate(avgBuyPrice: number, currentPrice: number): number {
  if (avgBuyPrice <= 0) {
    return 0;
  }
  return ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100;
}

/**
 * 여러 거래소에 분산된 동일 코인의 가중 평균 매수가를 계산한다.
 *
 * 가중 평균 = (거래소별 보유수량 * 매수평균가의 합) / 전체 보유수량
 *
 * @param entries 거래소별 보유 정보 배열 (수량 및 매수평균가)
 * @returns 가중 평균 매수가
 */
export function calculateWeightedAvgBuyPrice(
  entries: { balance: number; avgBuyPrice: number }[],
): number {
  const totalBalance = entries.reduce((sum, e) => sum + e.balance, 0);
  if (totalBalance <= 0) {
    return 0;
  }

  const weightedSum = entries.reduce(
    (sum, e) => sum + e.balance * e.avgBuyPrice,
    0,
  );

  return weightedSum / totalBalance;
}
