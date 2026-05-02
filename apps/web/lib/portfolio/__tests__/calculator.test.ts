/**
 * PortfolioCalculator 단위 테스트
 *
 * 수익률 계산, 자산 분포 비율, 가중 평균 매수가 등
 * 포트폴리오 계산 유틸리티 함수를 검증한다.
 *
 * @see 요구사항 2.1, 2.2, 2.7
 */

import { describe, it, expect } from 'vitest';
import {
  calculateProfitLoss,
  calculateAssetDistribution,
  calculateRate,
  calculateWeightedAvgBuyPrice,
} from '../calculator';
import type {
  Holding,
  MergedHolding,
  ExchangePortfolio,
} from '@bitscope/shared';

// ===== 테스트 헬퍼: Holding 생성 =====

function createHolding(overrides: Partial<Holding> = {}): Holding {
  return {
    exchange: 'upbit',
    symbol: 'BTC',
    currency: 'KRW',
    balance: 1,
    lockedBalance: 0,
    avgBuyPrice: 50000000,
    currentPrice: 55000000,
    evaluationAmount: 55000000,
    profitLoss: 5000000,
    profitLossRate: 10,
    ...overrides,
  };
}

describe('calculateProfitLoss', () => {
  it('단일 보유 자산의 손익을 정확하게 계산한다', () => {
    const holdings: Holding[] = [
      createHolding({
        symbol: 'BTC',
        balance: 0.5,
        avgBuyPrice: 50000000,
        currentPrice: 55000000,
        evaluationAmount: 27500000,
      }),
    ];

    const result = calculateProfitLoss(holdings, {});

    expect(result.totalEvaluation).toBe(27500000); // 0.5 * 55000000
    expect(result.totalInvestment).toBe(25000000); // 0.5 * 50000000
    expect(result.totalProfitLoss).toBe(2500000);
    expect(result.profitLossRate).toBeCloseTo(10, 1); // (2500000 / 25000000) * 100
  });

  it('PriceMap에 최신 가격이 있으면 현재가를 갱신하여 계산한다', () => {
    const holdings: Holding[] = [
      createHolding({
        symbol: 'BTC',
        balance: 1,
        avgBuyPrice: 50000000,
        currentPrice: 55000000,
      }),
    ];

    // 최신 가격을 60000000으로 갱신
    const result = calculateProfitLoss(holdings, { BTC: 60000000 });

    expect(result.totalEvaluation).toBe(60000000); // 1 * 60000000 (PriceMap 가격)
    expect(result.totalInvestment).toBe(50000000);
    expect(result.totalProfitLoss).toBe(10000000);
    expect(result.profitLossRate).toBe(20);
  });

  it('PriceMap에 없는 심볼은 기존 currentPrice를 사용한다', () => {
    const holdings: Holding[] = [
      createHolding({
        symbol: 'ETH',
        balance: 10,
        avgBuyPrice: 2000000,
        currentPrice: 2200000,
      }),
    ];

    const result = calculateProfitLoss(holdings, { BTC: 60000000 }); // ETH 가격 없음

    expect(result.totalEvaluation).toBe(22000000); // 10 * 2200000 (기존 가격)
    expect(result.totalInvestment).toBe(20000000);
    expect(result.totalProfitLoss).toBe(2000000);
    expect(result.profitLossRate).toBe(10);
  });

  it('다중 보유 자산의 손익을 합산하여 계산한다', () => {
    const holdings: Holding[] = [
      createHolding({
        symbol: 'BTC',
        balance: 1,
        avgBuyPrice: 50000000,
        currentPrice: 55000000,
      }),
      createHolding({
        symbol: 'ETH',
        balance: 10,
        avgBuyPrice: 2000000,
        currentPrice: 1800000,
      }),
    ];

    const result = calculateProfitLoss(holdings, {});

    // BTC: evaluation = 55000000, investment = 50000000
    // ETH: evaluation = 18000000, investment = 20000000
    expect(result.totalEvaluation).toBe(73000000);
    expect(result.totalInvestment).toBe(70000000);
    expect(result.totalProfitLoss).toBe(3000000);
    expect(result.profitLossRate).toBeCloseTo((3000000 / 70000000) * 100, 5);
  });

  it('빈 보유 목록에 대해 모든 값이 0인 결과를 반환한다', () => {
    const result = calculateProfitLoss([], {});

    expect(result.totalEvaluation).toBe(0);
    expect(result.totalInvestment).toBe(0);
    expect(result.totalProfitLoss).toBe(0);
    expect(result.profitLossRate).toBe(0);
  });

  it('투자금액이 0인 경우 수익률을 0으로 반환한다', () => {
    const holdings: Holding[] = [
      createHolding({
        symbol: 'BTC',
        balance: 0,
        avgBuyPrice: 0,
        currentPrice: 55000000,
      }),
    ];

    const result = calculateProfitLoss(holdings, {});

    expect(result.profitLossRate).toBe(0);
  });

  it('손실이 있는 포트폴리오의 음수 수익률을 정확히 계산한다', () => {
    const holdings: Holding[] = [
      createHolding({
        symbol: 'BTC',
        balance: 1,
        avgBuyPrice: 60000000,
        currentPrice: 50000000,
      }),
    ];

    const result = calculateProfitLoss(holdings, {});

    expect(result.totalProfitLoss).toBe(-10000000);
    expect(result.profitLossRate).toBeCloseTo(-16.6667, 3);
  });
});

describe('calculateAssetDistribution', () => {
  it('코인별 비중을 정확하게 계산한다', () => {
    const mergedHoldings: MergedHolding[] = [
      {
        symbol: 'BTC',
        totalBalance: 1,
        weightedAvgBuyPrice: 50000000,
        currentPrice: 55000000,
        totalEvaluation: 55000000,
        totalProfitLoss: 5000000,
        profitLossRate: 10,
        exchanges: [],
      },
      {
        symbol: 'ETH',
        totalBalance: 10,
        weightedAvgBuyPrice: 2000000,
        currentPrice: 2200000,
        totalEvaluation: 22000000,
        totalProfitLoss: 2000000,
        profitLossRate: 10,
        exchanges: [],
      },
    ];

    const result = calculateAssetDistribution(mergedHoldings, []);

    // BTC 비중: 55000000 / 77000000 * 100 = ~71.43%
    // ETH 비중: 22000000 / 77000000 * 100 = ~28.57%
    expect(result.byCoin).toHaveLength(2);
    expect(result.byCoin[0]!.symbol).toBe('BTC');
    expect(result.byCoin[0]!.ratio).toBeCloseTo(71.43, 1);
    expect(result.byCoin[1]!.symbol).toBe('ETH');
    expect(result.byCoin[1]!.ratio).toBeCloseTo(28.57, 1);
  });

  it('거래소별 비중을 정확하게 계산한다', () => {
    const portfolios: ExchangePortfolio[] = [
      {
        exchange: 'upbit',
        holdings: [],
        totalEvaluation: 30000000,
        totalInvestment: 25000000,
        totalProfitLoss: 5000000,
        profitLossRate: 20,
        krwBalance: 1000000,
        lastUpdated: new Date(),
        status: 'connected',
      },
      {
        exchange: 'bithumb',
        holdings: [],
        totalEvaluation: 20000000,
        totalInvestment: 18000000,
        totalProfitLoss: 2000000,
        profitLossRate: 11.11,
        krwBalance: 500000,
        lastUpdated: new Date(),
        status: 'connected',
      },
    ];

    const result = calculateAssetDistribution([], portfolios);

    // 업비트: 30000000 / 50000000 * 100 = 60%
    // 빗썸: 20000000 / 50000000 * 100 = 40%
    expect(result.byExchange).toHaveLength(2);
    expect(result.byExchange[0]!.exchange).toBe('upbit');
    expect(result.byExchange[0]!.ratio).toBe(60);
    expect(result.byExchange[1]!.exchange).toBe('bithumb');
    expect(result.byExchange[1]!.ratio).toBe(40);
  });

  it('평가금액이 0인 항목은 비중 목록에서 제외한다', () => {
    const mergedHoldings: MergedHolding[] = [
      {
        symbol: 'BTC',
        totalBalance: 1,
        weightedAvgBuyPrice: 50000000,
        currentPrice: 55000000,
        totalEvaluation: 55000000,
        totalProfitLoss: 5000000,
        profitLossRate: 10,
        exchanges: [],
      },
      {
        symbol: 'DOGE',
        totalBalance: 0,
        weightedAvgBuyPrice: 0,
        currentPrice: 100,
        totalEvaluation: 0,
        totalProfitLoss: 0,
        profitLossRate: 0,
        exchanges: [],
      },
    ];

    const result = calculateAssetDistribution(mergedHoldings, []);

    expect(result.byCoin).toHaveLength(1);
    expect(result.byCoin[0]!.symbol).toBe('BTC');
    expect(result.byCoin[0]!.ratio).toBe(100);
  });

  it('빈 데이터에 대해 빈 분포를 반환한다', () => {
    const result = calculateAssetDistribution([], []);

    expect(result.byCoin).toHaveLength(0);
    expect(result.byExchange).toHaveLength(0);
  });

  it('코인별 비중이 평가금액 내림차순으로 정렬된다', () => {
    const mergedHoldings: MergedHolding[] = [
      {
        symbol: 'XRP',
        totalBalance: 100,
        weightedAvgBuyPrice: 500,
        currentPrice: 600,
        totalEvaluation: 60000,
        totalProfitLoss: 10000,
        profitLossRate: 20,
        exchanges: [],
      },
      {
        symbol: 'BTC',
        totalBalance: 1,
        weightedAvgBuyPrice: 50000000,
        currentPrice: 55000000,
        totalEvaluation: 55000000,
        totalProfitLoss: 5000000,
        profitLossRate: 10,
        exchanges: [],
      },
      {
        symbol: 'ETH',
        totalBalance: 10,
        weightedAvgBuyPrice: 2000000,
        currentPrice: 2200000,
        totalEvaluation: 22000000,
        totalProfitLoss: 2000000,
        profitLossRate: 10,
        exchanges: [],
      },
    ];

    const result = calculateAssetDistribution(mergedHoldings, []);

    expect(result.byCoin[0]!.symbol).toBe('BTC');
    expect(result.byCoin[1]!.symbol).toBe('ETH');
    expect(result.byCoin[2]!.symbol).toBe('XRP');
  });
});

describe('calculateRate', () => {
  it('양수 수익률을 정확하게 계산한다', () => {
    expect(calculateRate(50000000, 55000000)).toBe(10);
  });

  it('음수 수익률(손실)을 정확하게 계산한다', () => {
    expect(calculateRate(50000000, 45000000)).toBe(-10);
  });

  it('매수가와 현재가가 같으면 0을 반환한다', () => {
    expect(calculateRate(50000000, 50000000)).toBe(0);
  });

  it('매수가가 0이면 0을 반환한다', () => {
    expect(calculateRate(0, 55000000)).toBe(0);
  });

  it('매수가가 음수이면 0을 반환한다', () => {
    expect(calculateRate(-50000000, 55000000)).toBe(0);
  });

  it('소수점 수익률을 정확하게 계산한다', () => {
    // (2200000 - 2000000) / 2000000 * 100 = 10
    expect(calculateRate(2000000, 2200000)).toBe(10);
  });
});

describe('calculateWeightedAvgBuyPrice', () => {
  it('단일 거래소의 평균 매수가를 그대로 반환한다', () => {
    const result = calculateWeightedAvgBuyPrice([
      { balance: 1, avgBuyPrice: 50000000 },
    ]);

    expect(result).toBe(50000000);
  });

  it('두 거래소의 가중 평균 매수가를 정확하게 계산한다', () => {
    // 업비트: 1 BTC @ 50000000, 빗썸: 0.5 BTC @ 52000000
    // 가중 평균 = (1 * 50000000 + 0.5 * 52000000) / 1.5 = 50666666.67
    const result = calculateWeightedAvgBuyPrice([
      { balance: 1, avgBuyPrice: 50000000 },
      { balance: 0.5, avgBuyPrice: 52000000 },
    ]);

    expect(result).toBeCloseTo(50666666.67, 0);
  });

  it('동일 수량일 때 산술 평균과 같다', () => {
    const result = calculateWeightedAvgBuyPrice([
      { balance: 1, avgBuyPrice: 50000000 },
      { balance: 1, avgBuyPrice: 52000000 },
    ]);

    expect(result).toBe(51000000);
  });

  it('세 거래소의 가중 평균을 정확하게 계산한다', () => {
    // 업비트: 2 @ 50000000, 빗썸: 1 @ 52000000, 코인원: 1 @ 48000000
    // = (100000000 + 52000000 + 48000000) / 4 = 50000000
    const result = calculateWeightedAvgBuyPrice([
      { balance: 2, avgBuyPrice: 50000000 },
      { balance: 1, avgBuyPrice: 52000000 },
      { balance: 1, avgBuyPrice: 48000000 },
    ]);

    expect(result).toBe(50000000);
  });

  it('빈 배열에 대해 0을 반환한다', () => {
    expect(calculateWeightedAvgBuyPrice([])).toBe(0);
  });

  it('보유 수량이 모두 0인 경우 0을 반환한다', () => {
    const result = calculateWeightedAvgBuyPrice([
      { balance: 0, avgBuyPrice: 50000000 },
      { balance: 0, avgBuyPrice: 52000000 },
    ]);

    expect(result).toBe(0);
  });
});
