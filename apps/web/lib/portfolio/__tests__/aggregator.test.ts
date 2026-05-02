/**
 * PortfolioAggregator 단위 테스트
 *
 * 여러 거래소 포트폴리오 통합, 코인별 합산(MergedHolding), 정렬, 필터링,
 * 개별 코인 요약 등 포트폴리오 통합기의 전체 기능을 검증한다.
 *
 * @see 요구사항 2.1, 2.2, 2.3, 2.8, 2.9, 2.10
 */

import { describe, it, expect } from 'vitest';
import {
  aggregatePortfolios,
  getCoinSummary,
  sortHoldings,
  sortMergedHoldings,
  filterHoldings,
  filterMergedHoldings,
  recalculateProfitLoss,
  getAssetDistribution,
} from '../aggregator';
import type {
  ExchangePortfolio,
  Holding,
  MergedHolding,
  AggregatedPortfolio,
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

// ===== 테스트 헬퍼: ExchangePortfolio 생성 =====

function createPortfolio(
  overrides: Partial<ExchangePortfolio> = {},
): ExchangePortfolio {
  return {
    exchange: 'upbit',
    holdings: [],
    totalEvaluation: 0,
    totalInvestment: 0,
    totalProfitLoss: 0,
    profitLossRate: 0,
    krwBalance: 0,
    lastUpdated: new Date('2025-01-01T00:00:00Z'),
    status: 'connected',
    ...overrides,
  };
}

// ===== aggregatePortfolios =====

describe('aggregatePortfolios', () => {
  it('단일 거래소 포트폴리오를 통합한다', () => {
    const btcHolding = createHolding({
      symbol: 'BTC',
      balance: 0.5,
      avgBuyPrice: 50000000,
      currentPrice: 55000000,
      evaluationAmount: 27500000,
      profitLoss: 2500000,
      profitLossRate: 10,
    });

    const portfolio = createPortfolio({
      exchange: 'upbit',
      holdings: [btcHolding],
      totalEvaluation: 27500000,
      totalInvestment: 25000000,
      totalProfitLoss: 2500000,
      profitLossRate: 10,
      krwBalance: 1000000,
    });

    const result = aggregatePortfolios([portfolio]);

    expect(result.totalEvaluation).toBe(27500000);
    expect(result.totalInvestment).toBe(25000000);
    expect(result.totalProfitLoss).toBe(2500000);
    expect(result.profitLossRate).toBe(10);
    expect(result.totalKrwBalance).toBe(1000000);
    expect(result.mergedHoldings).toHaveLength(1);
    expect(result.mergedHoldings[0]!.symbol).toBe('BTC');
    expect(result.mergedHoldings[0]!.totalBalance).toBe(0.5);
  });

  it('여러 거래소 포트폴리오를 통합한다', () => {
    const upbitPortfolio = createPortfolio({
      exchange: 'upbit',
      holdings: [
        createHolding({
          exchange: 'upbit',
          symbol: 'BTC',
          balance: 1,
          avgBuyPrice: 50000000,
          currentPrice: 55000000,
          evaluationAmount: 55000000,
          profitLoss: 5000000,
          profitLossRate: 10,
        }),
      ],
      totalEvaluation: 55000000,
      totalInvestment: 50000000,
      totalProfitLoss: 5000000,
      profitLossRate: 10,
      krwBalance: 2000000,
    });

    const bithumbPortfolio = createPortfolio({
      exchange: 'bithumb',
      holdings: [
        createHolding({
          exchange: 'bithumb',
          symbol: 'ETH',
          balance: 10,
          avgBuyPrice: 2000000,
          currentPrice: 2200000,
          evaluationAmount: 22000000,
          profitLoss: 2000000,
          profitLossRate: 10,
        }),
      ],
      totalEvaluation: 22000000,
      totalInvestment: 20000000,
      totalProfitLoss: 2000000,
      profitLossRate: 10,
      krwBalance: 500000,
    });

    const result = aggregatePortfolios([upbitPortfolio, bithumbPortfolio]);

    expect(result.totalEvaluation).toBe(77000000);
    expect(result.totalInvestment).toBe(70000000);
    expect(result.totalProfitLoss).toBe(7000000);
    expect(result.profitLossRate).toBe(10);
    expect(result.totalKrwBalance).toBe(2500000);
    expect(result.mergedHoldings).toHaveLength(2);
    expect(result.portfolios).toHaveLength(2);
  });

  it('동일 코인을 여러 거래소에서 보유하면 합산한다 (요구사항 2.3)', () => {
    const upbitBtc = createHolding({
      exchange: 'upbit',
      symbol: 'BTC',
      balance: 1,
      avgBuyPrice: 50000000,
      currentPrice: 55000000,
      evaluationAmount: 55000000,
      profitLoss: 5000000,
      profitLossRate: 10,
    });

    const bithumbBtc = createHolding({
      exchange: 'bithumb',
      symbol: 'BTC',
      balance: 0.5,
      avgBuyPrice: 52000000,
      currentPrice: 54800000,
      evaluationAmount: 27400000,
      profitLoss: 1400000,
      profitLossRate: 5.38,
    });

    const upbitPortfolio = createPortfolio({
      exchange: 'upbit',
      holdings: [upbitBtc],
      totalEvaluation: 55000000,
      totalInvestment: 50000000,
    });

    const bithumbPortfolio = createPortfolio({
      exchange: 'bithumb',
      holdings: [bithumbBtc],
      totalEvaluation: 27400000,
      totalInvestment: 26000000,
    });

    const result = aggregatePortfolios([upbitPortfolio, bithumbPortfolio]);

    expect(result.mergedHoldings).toHaveLength(1);

    const btcMerged = result.mergedHoldings[0]!;
    expect(btcMerged.symbol).toBe('BTC');
    expect(btcMerged.totalBalance).toBe(1.5);
    // 가중 평균: (1 * 50000000 + 0.5 * 52000000) / 1.5 = 50666666.67
    expect(btcMerged.weightedAvgBuyPrice).toBeCloseTo(50666666.67, 0);
    expect(btcMerged.totalEvaluation).toBe(82400000); // 55000000 + 27400000
    expect(btcMerged.exchanges).toHaveLength(2);
  });

  it('error 상태의 포트폴리오는 통합 수치에서 제외한다', () => {
    const upbitPortfolio = createPortfolio({
      exchange: 'upbit',
      holdings: [
        createHolding({
          exchange: 'upbit',
          symbol: 'BTC',
          balance: 1,
          avgBuyPrice: 50000000,
          currentPrice: 55000000,
          evaluationAmount: 55000000,
        }),
      ],
      totalEvaluation: 55000000,
      totalInvestment: 50000000,
      krwBalance: 1000000,
      status: 'connected',
    });

    const bithumbPortfolio = createPortfolio({
      exchange: 'bithumb',
      holdings: [],
      totalEvaluation: 0,
      totalInvestment: 0,
      status: 'error',
      errorMessage: '빗썸 API 오류',
    });

    const result = aggregatePortfolios([upbitPortfolio, bithumbPortfolio]);

    // error 거래소는 통합 수치에서 제외
    expect(result.totalEvaluation).toBe(55000000);
    expect(result.totalKrwBalance).toBe(1000000);
    expect(result.mergedHoldings).toHaveLength(1);

    // 그러나 portfolios 배열에는 포함 (UI에서 오류 상태 표시 필요)
    expect(result.portfolios).toHaveLength(2);
  });

  it('loading 상태의 포트폴리오는 통합 수치에서 제외한다', () => {
    const loadingPortfolio = createPortfolio({
      exchange: 'upbit',
      holdings: [],
      totalEvaluation: 0,
      status: 'loading',
    });

    const result = aggregatePortfolios([loadingPortfolio]);

    expect(result.totalEvaluation).toBe(0);
    expect(result.mergedHoldings).toHaveLength(0);
    expect(result.portfolios).toHaveLength(1);
  });

  it('빈 포트폴리오 배열에 대해 기본값을 반환한다', () => {
    const result = aggregatePortfolios([]);

    expect(result.totalEvaluation).toBe(0);
    expect(result.totalInvestment).toBe(0);
    expect(result.totalProfitLoss).toBe(0);
    expect(result.profitLossRate).toBe(0);
    expect(result.totalKrwBalance).toBe(0);
    expect(result.mergedHoldings).toHaveLength(0);
    expect(result.portfolios).toHaveLength(0);
  });

  it('통합 투자금액이 0이면 수익률을 0으로 반환한다', () => {
    const portfolio = createPortfolio({
      exchange: 'upbit',
      holdings: [],
      totalEvaluation: 0,
      totalInvestment: 0,
    });

    const result = aggregatePortfolios([portfolio]);

    expect(result.profitLossRate).toBe(0);
  });

  it('mergedHoldings가 평가금액 기준 내림차순으로 정렬된다', () => {
    const portfolio = createPortfolio({
      exchange: 'upbit',
      holdings: [
        createHolding({
          symbol: 'XRP',
          balance: 1000,
          evaluationAmount: 600000,
          avgBuyPrice: 500,
          currentPrice: 600,
        }),
        createHolding({
          symbol: 'BTC',
          balance: 1,
          evaluationAmount: 55000000,
          avgBuyPrice: 50000000,
          currentPrice: 55000000,
        }),
        createHolding({
          symbol: 'ETH',
          balance: 5,
          evaluationAmount: 11000000,
          avgBuyPrice: 2000000,
          currentPrice: 2200000,
        }),
      ],
      totalEvaluation: 66600000,
      totalInvestment: 60500000,
    });

    const result = aggregatePortfolios([portfolio]);

    expect(result.mergedHoldings[0]!.symbol).toBe('BTC');
    expect(result.mergedHoldings[1]!.symbol).toBe('ETH');
    expect(result.mergedHoldings[2]!.symbol).toBe('XRP');
  });

  it('lastUpdated가 가장 최근 시각으로 설정된다', () => {
    const older = new Date('2025-01-01T00:00:00Z');
    const newer = new Date('2025-01-02T00:00:00Z');

    const portfolio1 = createPortfolio({
      exchange: 'upbit',
      lastUpdated: older,
    });
    const portfolio2 = createPortfolio({
      exchange: 'bithumb',
      lastUpdated: newer,
    });

    const result = aggregatePortfolios([portfolio1, portfolio2]);

    expect(result.lastUpdated.getTime()).toBe(newer.getTime());
  });
});

// ===== getCoinSummary =====

describe('getCoinSummary', () => {
  it('단일 거래소에서 보유한 코인의 상세 요약을 반환한다', () => {
    const btcHolding = createHolding({
      exchange: 'upbit',
      symbol: 'BTC',
      balance: 0.5,
      avgBuyPrice: 50000000,
      currentPrice: 55000000,
      evaluationAmount: 27500000,
      profitLoss: 2500000,
      profitLossRate: 10,
    });

    const portfolio = createPortfolio({
      exchange: 'upbit',
      holdings: [btcHolding],
    });

    const summary = getCoinSummary('BTC', [portfolio]);

    expect(summary).not.toBeNull();
    expect(summary!.symbol).toBe('BTC');
    expect(summary!.totalBalance).toBe(0.5);
    expect(summary!.weightedAvgBuyPrice).toBe(50000000);
    expect(summary!.currentPrice).toBe(55000000);
    expect(summary!.exchanges).toHaveLength(1);
    expect(summary!.exchanges[0]!.exchange).toBe('upbit');
  });

  it('여러 거래소에서 보유한 코인의 통합 요약을 반환한다 (요구사항 2.8)', () => {
    const upbitBtc = createHolding({
      exchange: 'upbit',
      symbol: 'BTC',
      balance: 1,
      avgBuyPrice: 50000000,
      currentPrice: 55000000,
      evaluationAmount: 55000000,
      profitLoss: 5000000,
      profitLossRate: 10,
    });

    const bithumbBtc = createHolding({
      exchange: 'bithumb',
      symbol: 'BTC',
      balance: 0.5,
      avgBuyPrice: 52000000,
      currentPrice: 54800000,
      evaluationAmount: 27400000,
      profitLoss: 1400000,
      profitLossRate: 5.38,
    });

    const portfolios = [
      createPortfolio({ exchange: 'upbit', holdings: [upbitBtc] }),
      createPortfolio({ exchange: 'bithumb', holdings: [bithumbBtc] }),
    ];

    const summary = getCoinSummary('BTC', portfolios);

    expect(summary).not.toBeNull();
    expect(summary!.totalBalance).toBe(1.5);
    expect(summary!.weightedAvgBuyPrice).toBeCloseTo(50666666.67, 0);
    expect(summary!.totalEvaluation).toBe(82400000);
    expect(summary!.exchanges).toHaveLength(2);
  });

  it('보유하지 않은 코인에 대해 null을 반환한다', () => {
    const portfolio = createPortfolio({
      exchange: 'upbit',
      holdings: [createHolding({ symbol: 'BTC' })],
    });

    const summary = getCoinSummary('DOGE', [portfolio]);

    expect(summary).toBeNull();
  });

  it('error 상태의 거래소는 무시한다', () => {
    const upbitBtc = createHolding({
      exchange: 'upbit',
      symbol: 'BTC',
      balance: 1,
      avgBuyPrice: 50000000,
      currentPrice: 55000000,
      evaluationAmount: 55000000,
      profitLoss: 5000000,
      profitLossRate: 10,
    });

    const bithumbBtc = createHolding({
      exchange: 'bithumb',
      symbol: 'BTC',
      balance: 0.5,
    });

    const portfolios = [
      createPortfolio({ exchange: 'upbit', holdings: [upbitBtc], status: 'connected' }),
      createPortfolio({ exchange: 'bithumb', holdings: [bithumbBtc], status: 'error' }),
    ];

    const summary = getCoinSummary('BTC', portfolios);

    expect(summary).not.toBeNull();
    expect(summary!.exchanges).toHaveLength(1);
    expect(summary!.exchanges[0]!.exchange).toBe('upbit');
    expect(summary!.totalBalance).toBe(1);
  });

  it('빈 포트폴리오 배열에 대해 null을 반환한다', () => {
    const summary = getCoinSummary('BTC', []);
    expect(summary).toBeNull();
  });
});

// ===== sortHoldings =====

describe('sortHoldings', () => {
  const holdings: Holding[] = [
    createHolding({
      symbol: 'ETH',
      evaluationAmount: 22000000,
      profitLossRate: 10,
      balance: 10,
      currentPrice: 2200000,
    }),
    createHolding({
      symbol: 'BTC',
      evaluationAmount: 55000000,
      profitLossRate: 5,
      balance: 1,
      currentPrice: 55000000,
    }),
    createHolding({
      symbol: 'XRP',
      evaluationAmount: 600000,
      profitLossRate: -5,
      balance: 1000,
      currentPrice: 600,
    }),
  ];

  it('평가금액 기준 내림차순으로 정렬한다', () => {
    const sorted = sortHoldings(holdings, 'evaluationAmount', 'desc');

    expect(sorted[0]!.symbol).toBe('BTC');
    expect(sorted[1]!.symbol).toBe('ETH');
    expect(sorted[2]!.symbol).toBe('XRP');
  });

  it('평가금액 기준 오름차순으로 정렬한다', () => {
    const sorted = sortHoldings(holdings, 'evaluationAmount', 'asc');

    expect(sorted[0]!.symbol).toBe('XRP');
    expect(sorted[1]!.symbol).toBe('ETH');
    expect(sorted[2]!.symbol).toBe('BTC');
  });

  it('수익률 기준으로 정렬한다', () => {
    const sorted = sortHoldings(holdings, 'profitLossRate', 'desc');

    expect(sorted[0]!.symbol).toBe('ETH');
    expect(sorted[1]!.symbol).toBe('BTC');
    expect(sorted[2]!.symbol).toBe('XRP');
  });

  it('코인명(symbol) 기준으로 정렬한다', () => {
    const sorted = sortHoldings(holdings, 'symbol', 'asc');

    expect(sorted[0]!.symbol).toBe('BTC');
    expect(sorted[1]!.symbol).toBe('ETH');
    expect(sorted[2]!.symbol).toBe('XRP');
  });

  it('보유 수량 기준으로 정렬한다', () => {
    const sorted = sortHoldings(holdings, 'balance', 'desc');

    expect(sorted[0]!.symbol).toBe('XRP');
    expect(sorted[1]!.symbol).toBe('ETH');
    expect(sorted[2]!.symbol).toBe('BTC');
  });

  it('현재가 기준으로 정렬한다', () => {
    const sorted = sortHoldings(holdings, 'currentPrice', 'desc');

    expect(sorted[0]!.symbol).toBe('BTC');
    expect(sorted[1]!.symbol).toBe('ETH');
    expect(sorted[2]!.symbol).toBe('XRP');
  });

  it('기본 정렬 방향은 내림차순이다', () => {
    const sorted = sortHoldings(holdings, 'evaluationAmount');

    expect(sorted[0]!.symbol).toBe('BTC');
  });

  it('원본 배열을 변경하지 않는다 (불변성)', () => {
    const original = [...holdings];
    sortHoldings(holdings, 'evaluationAmount', 'asc');

    expect(holdings[0]!.symbol).toBe(original[0]!.symbol);
    expect(holdings[1]!.symbol).toBe(original[1]!.symbol);
    expect(holdings[2]!.symbol).toBe(original[2]!.symbol);
  });

  it('빈 배열에 대해 빈 배열을 반환한다', () => {
    const sorted = sortHoldings([], 'evaluationAmount');
    expect(sorted).toHaveLength(0);
  });
});

// ===== sortMergedHoldings =====

describe('sortMergedHoldings', () => {
  const mergedHoldings: MergedHolding[] = [
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
    {
      symbol: 'BTC',
      totalBalance: 1.5,
      weightedAvgBuyPrice: 50000000,
      currentPrice: 55000000,
      totalEvaluation: 82500000,
      totalProfitLoss: 7500000,
      profitLossRate: 10,
      exchanges: [],
    },
  ];

  it('평가금액 기준 내림차순으로 정렬한다', () => {
    const sorted = sortMergedHoldings(mergedHoldings, 'evaluationAmount', 'desc');

    expect(sorted[0]!.symbol).toBe('BTC');
    expect(sorted[1]!.symbol).toBe('ETH');
  });

  it('코인명 기준 오름차순으로 정렬한다', () => {
    const sorted = sortMergedHoldings(mergedHoldings, 'symbol', 'asc');

    expect(sorted[0]!.symbol).toBe('BTC');
    expect(sorted[1]!.symbol).toBe('ETH');
  });

  it('원본 배열을 변경하지 않는다 (불변성)', () => {
    const original = mergedHoldings[0]!.symbol;
    sortMergedHoldings(mergedHoldings, 'evaluationAmount', 'asc');

    expect(mergedHoldings[0]!.symbol).toBe(original);
  });
});

// ===== filterHoldings =====

describe('filterHoldings', () => {
  const holdings: Holding[] = [
    createHolding({
      exchange: 'upbit',
      symbol: 'BTC',
      profitLoss: 5000000,
      profitLossRate: 10,
    }),
    createHolding({
      exchange: 'bithumb',
      symbol: 'ETH',
      profitLoss: -1000000,
      profitLossRate: -5,
    }),
    createHolding({
      exchange: 'coinone',
      symbol: 'XRP',
      profitLoss: 100000,
      profitLossRate: 2,
    }),
    createHolding({
      exchange: 'upbit',
      symbol: 'SOL',
      profitLoss: -500000,
      profitLossRate: -10,
    }),
  ];

  it('거래소 필터: 업비트만 표시한다', () => {
    const filtered = filterHoldings(holdings, { exchanges: ['upbit'] });

    expect(filtered).toHaveLength(2);
    expect(filtered.every((h) => h.exchange === 'upbit')).toBe(true);
  });

  it('거래소 필터: 복수 거래소를 필터링한다', () => {
    const filtered = filterHoldings(holdings, {
      exchanges: ['upbit', 'bithumb'],
    });

    expect(filtered).toHaveLength(3);
  });

  it('수익/손실 필터: 수익만 표시한다', () => {
    const filtered = filterHoldings(holdings, { profitLossType: 'profit' });

    expect(filtered).toHaveLength(2);
    expect(filtered.every((h) => h.profitLoss >= 0)).toBe(true);
  });

  it('수익/손실 필터: 손실만 표시한다', () => {
    const filtered = filterHoldings(holdings, { profitLossType: 'loss' });

    expect(filtered).toHaveLength(2);
    expect(filtered.every((h) => h.profitLoss < 0)).toBe(true);
  });

  it('수익/손실 필터: all은 모든 항목을 표시한다', () => {
    const filtered = filterHoldings(holdings, { profitLossType: 'all' });

    expect(filtered).toHaveLength(4);
  });

  it('거래소 필터 + 수익/손실 필터를 동시에 적용한다', () => {
    const filtered = filterHoldings(holdings, {
      exchanges: ['upbit'],
      profitLossType: 'profit',
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.symbol).toBe('BTC');
  });

  it('필터 조건이 없으면 모든 항목을 반환한다', () => {
    const filtered = filterHoldings(holdings, {});

    expect(filtered).toHaveLength(4);
  });

  it('빈 거래소 배열 필터는 모든 항목을 반환한다', () => {
    const filtered = filterHoldings(holdings, { exchanges: [] });

    expect(filtered).toHaveLength(4);
  });

  it('원본 배열을 변경하지 않는다 (불변성)', () => {
    const originalLength = holdings.length;
    filterHoldings(holdings, { exchanges: ['upbit'] });

    expect(holdings).toHaveLength(originalLength);
  });
});

// ===== filterMergedHoldings =====

describe('filterMergedHoldings', () => {
  const mergedHoldings: MergedHolding[] = [
    {
      symbol: 'BTC',
      totalBalance: 1.5,
      weightedAvgBuyPrice: 50000000,
      currentPrice: 55000000,
      totalEvaluation: 82500000,
      totalProfitLoss: 7500000,
      profitLossRate: 10,
      exchanges: [
        {
          exchange: 'upbit',
          balance: 1,
          avgBuyPrice: 50000000,
          evaluation: 55000000,
          profitLoss: 5000000,
          profitLossRate: 10,
        },
        {
          exchange: 'bithumb',
          balance: 0.5,
          avgBuyPrice: 50000000,
          evaluation: 27500000,
          profitLoss: 2500000,
          profitLossRate: 10,
        },
      ],
    },
    {
      symbol: 'ETH',
      totalBalance: 10,
      weightedAvgBuyPrice: 2200000,
      currentPrice: 2000000,
      totalEvaluation: 20000000,
      totalProfitLoss: -2000000,
      profitLossRate: -9.09,
      exchanges: [
        {
          exchange: 'coinone',
          balance: 10,
          avgBuyPrice: 2200000,
          evaluation: 20000000,
          profitLoss: -2000000,
          profitLossRate: -9.09,
        },
      ],
    },
  ];

  it('거래소 필터: 해당 거래소에 보유 내역이 있는 코인만 표시한다', () => {
    const filtered = filterMergedHoldings(mergedHoldings, {
      exchanges: ['upbit'],
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.symbol).toBe('BTC');
  });

  it('수익/손실 필터: 수익인 코인만 표시한다', () => {
    const filtered = filterMergedHoldings(mergedHoldings, {
      profitLossType: 'profit',
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.symbol).toBe('BTC');
  });

  it('수익/손실 필터: 손실인 코인만 표시한다', () => {
    const filtered = filterMergedHoldings(mergedHoldings, {
      profitLossType: 'loss',
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.symbol).toBe('ETH');
  });

  it('원본 배열을 변경하지 않는다 (불변성)', () => {
    const originalLength = mergedHoldings.length;
    filterMergedHoldings(mergedHoldings, { exchanges: ['upbit'] });

    expect(mergedHoldings).toHaveLength(originalLength);
  });
});

// ===== recalculateProfitLoss =====

describe('recalculateProfitLoss', () => {
  it('최신 가격을 반영하여 손익을 재계산한다', () => {
    const holdings: Holding[] = [
      createHolding({
        symbol: 'BTC',
        balance: 1,
        avgBuyPrice: 50000000,
        currentPrice: 55000000,
      }),
    ];

    const result = recalculateProfitLoss(holdings, { BTC: 60000000 });

    expect(result.totalEvaluation).toBe(60000000);
    expect(result.totalInvestment).toBe(50000000);
    expect(result.totalProfitLoss).toBe(10000000);
    expect(result.profitLossRate).toBe(20);
  });
});

// ===== getAssetDistribution =====

describe('getAssetDistribution', () => {
  it('통합 포트폴리오의 자산 분포를 반환한다', () => {
    const portfolio: AggregatedPortfolio = {
      portfolios: [
        createPortfolio({
          exchange: 'upbit',
          totalEvaluation: 55000000,
          status: 'connected',
        }),
        createPortfolio({
          exchange: 'bithumb',
          totalEvaluation: 22000000,
          status: 'connected',
        }),
      ],
      mergedHoldings: [
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
      ],
      totalEvaluation: 77000000,
      totalInvestment: 70000000,
      totalProfitLoss: 7000000,
      profitLossRate: 10,
      totalKrwBalance: 2500000,
      lastUpdated: new Date(),
    };

    const distribution = getAssetDistribution(portfolio);

    // 코인별 비중
    expect(distribution.byCoin).toHaveLength(2);
    expect(distribution.byCoin[0]!.symbol).toBe('BTC');
    expect(distribution.byCoin[0]!.ratio).toBeCloseTo(71.43, 1);

    // 거래소별 비중
    expect(distribution.byExchange).toHaveLength(2);
    expect(distribution.byExchange[0]!.exchange).toBe('upbit');
    expect(distribution.byExchange[0]!.ratio).toBeCloseTo(71.43, 1);
  });

  it('error 상태의 거래소는 거래소별 비중 계산에서 제외한다', () => {
    const portfolio: AggregatedPortfolio = {
      portfolios: [
        createPortfolio({
          exchange: 'upbit',
          totalEvaluation: 55000000,
          status: 'connected',
        }),
        createPortfolio({
          exchange: 'bithumb',
          totalEvaluation: 0,
          status: 'error',
        }),
      ],
      mergedHoldings: [
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
      ],
      totalEvaluation: 55000000,
      totalInvestment: 50000000,
      totalProfitLoss: 5000000,
      profitLossRate: 10,
      totalKrwBalance: 1000000,
      lastUpdated: new Date(),
    };

    const distribution = getAssetDistribution(portfolio);

    // error 거래소는 비중 0이므로 제외
    expect(distribution.byExchange).toHaveLength(1);
    expect(distribution.byExchange[0]!.exchange).toBe('upbit');
    expect(distribution.byExchange[0]!.ratio).toBe(100);
  });
});
