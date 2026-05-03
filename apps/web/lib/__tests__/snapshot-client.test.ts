/**
 * 스냅샷 API 클라이언트 단위 테스트
 *
 * sendSnapshot, createSnapshotFromPortfolio, isSnapshotEqual 함수의
 * 동작을 검증한다.
 *
 * @see 요구사항 4.9 (클라이언트가 포트폴리오 스냅샷을 NestJS에 전송)
 * @see 요구사항 12.14, 12.15 (클라이언트 접속 시 스냅샷 축적)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sendSnapshot,
  createSnapshotFromPortfolio,
  isSnapshotEqual,
  type CreateSnapshotRequest,
} from '../snapshot-client';
import type {
  PortfolioSnapshot,
  AggregatedPortfolio,
  ExchangePortfolio,
  Holding,
} from '@bitscope/shared';

// ===== fetch 모킹 =====

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ===== 테스트 헬퍼 =====

/** 테스트용 PortfolioSnapshot 생성 */
function createMockSnapshot(overrides?: Partial<PortfolioSnapshot>): PortfolioSnapshot {
  return {
    walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
    timestamp: new Date('2026-01-15T10:00:00Z'),
    totalEvaluation: 10_000_000,
    totalInvestment: 8_000_000,
    totalProfitLoss: 2_000_000,
    profitLossRate: 25.0,
    holdings: [
      {
        symbol: 'BTC',
        exchange: 'upbit',
        balance: 0.1,
        avgBuyPrice: 50_000_000,
        currentPrice: 55_000_000,
        evaluation: 5_500_000,
      },
      {
        symbol: 'ETH',
        exchange: 'bithumb',
        balance: 2.0,
        avgBuyPrice: 2_000_000,
        currentPrice: 2_250_000,
        evaluation: 4_500_000,
      },
    ],
    ...overrides,
  };
}

/** 테스트용 Holding 생성 */
function createMockHolding(overrides?: Partial<Holding>): Holding {
  return {
    exchange: 'upbit',
    symbol: 'BTC',
    currency: 'KRW',
    balance: 0.1,
    lockedBalance: 0,
    avgBuyPrice: 50_000_000,
    currentPrice: 55_000_000,
    evaluationAmount: 5_500_000,
    profitLoss: 500_000,
    profitLossRate: 10.0,
    ...overrides,
  };
}

/** 테스트용 ExchangePortfolio 생성 */
function createMockExchangePortfolio(
  exchange: 'upbit' | 'bithumb' | 'coinone',
  holdings: Holding[],
  overrides?: Partial<ExchangePortfolio>,
): ExchangePortfolio {
  const totalEvaluation = holdings.reduce((sum, h) => sum + h.evaluationAmount, 0);
  const totalInvestment = holdings.reduce((sum, h) => sum + h.balance * h.avgBuyPrice, 0);
  return {
    exchange,
    holdings,
    totalEvaluation,
    totalInvestment,
    totalProfitLoss: totalEvaluation - totalInvestment,
    profitLossRate: totalInvestment > 0 ? ((totalEvaluation - totalInvestment) / totalInvestment) * 100 : 0,
    krwBalance: 1_000_000,
    lastUpdated: new Date('2026-01-15T10:00:00Z'),
    status: 'connected',
    ...overrides,
  };
}

/** 테스트용 AggregatedPortfolio 생성 */
function createMockAggregatedPortfolio(
  portfolios: ExchangePortfolio[],
): AggregatedPortfolio {
  const totalEvaluation = portfolios.reduce((sum, p) => sum + p.totalEvaluation, 0);
  const totalInvestment = portfolios.reduce((sum, p) => sum + p.totalInvestment, 0);
  const totalProfitLoss = totalEvaluation - totalInvestment;
  const profitLossRate = totalInvestment > 0 ? (totalProfitLoss / totalInvestment) * 100 : 0;
  const totalKrwBalance = portfolios.reduce((sum, p) => sum + p.krwBalance, 0);

  return {
    portfolios,
    mergedHoldings: [], // 테스트에서는 상세 holdings가 중요
    totalEvaluation,
    totalInvestment,
    totalProfitLoss,
    profitLossRate,
    totalKrwBalance,
    lastUpdated: new Date('2026-01-15T10:00:00Z'),
  };
}

// ===== sendSnapshot 테스트 =====

describe('sendSnapshot', () => {
  const walletAddress = '0x1234567890abcdef1234567890abcdef12345678';

  it('스냅샷을 NestJS 백엔드에 POST 요청으로 전송한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'snapshot-1' }),
    });

    const snapshot = createMockSnapshot();
    await sendSnapshot(walletAddress, snapshot);

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit & { body: string; headers: Record<string, string> }];
    const [url, options] = callArgs;
    expect(url).toContain('/snapshots');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');

    const body: CreateSnapshotRequest = JSON.parse(options.body);
    expect(body.walletAddress).toBe(walletAddress);
    expect(body.totalEvaluation).toBe(10_000_000);
    expect(body.totalInvestment).toBe(8_000_000);
    expect(body.totalProfitLoss).toBe(2_000_000);
    expect(body.profitLossRate).toBe(25.0);
    expect(body.holdings).toHaveLength(2);
    expect(body.holdings[0]!.symbol).toBe('BTC');
    expect(body.holdings[0]!.exchange).toBe('upbit');
    expect(body.holdings[1]!.symbol).toBe('ETH');
    expect(body.holdings[1]!.exchange).toBe('bithumb');
  });

  it('HTTP 오류 응답 시 에러를 throw한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const snapshot = createMockSnapshot();
    await expect(sendSnapshot(walletAddress, snapshot)).rejects.toThrow(
      '스냅샷 전송 실패: HTTP 500',
    );
  });

  it('네트워크 오류 시 에러를 throw한다', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const snapshot = createMockSnapshot();
    await expect(sendSnapshot(walletAddress, snapshot)).rejects.toThrow('Network error');
  });

  it('타임아웃(AbortError) 시 적절한 에러 메시지를 생성한다', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    mockFetch.mockRejectedValueOnce(abortError);

    const snapshot = createMockSnapshot();
    await expect(sendSnapshot(walletAddress, snapshot)).rejects.toThrow(
      '스냅샷 전송 타임아웃',
    );
  });

  it('holdings 데이터를 올바른 형태로 변환하여 전송한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'snapshot-2' }),
    });

    const snapshot = createMockSnapshot();
    await sendSnapshot(walletAddress, snapshot);

    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit & { body: string }];
    const body: CreateSnapshotRequest = JSON.parse(callArgs[1].body);
    const btcHolding = body.holdings[0];

    expect(btcHolding).toEqual({
      symbol: 'BTC',
      exchange: 'upbit',
      balance: 0.1,
      avgBuyPrice: 50_000_000,
      currentPrice: 55_000_000,
      evaluation: 5_500_000,
    });
  });
});

// ===== createSnapshotFromPortfolio 테스트 =====

describe('createSnapshotFromPortfolio', () => {
  const walletAddress = '0x1234567890abcdef1234567890abcdef12345678';

  it('AggregatedPortfolio를 PortfolioSnapshot으로 올바르게 변환한다', () => {
    const btcHolding = createMockHolding({
      exchange: 'upbit',
      symbol: 'BTC',
      balance: 0.1,
      avgBuyPrice: 50_000_000,
      currentPrice: 55_000_000,
      evaluationAmount: 5_500_000,
    });
    const ethHolding = createMockHolding({
      exchange: 'bithumb',
      symbol: 'ETH',
      balance: 2.0,
      avgBuyPrice: 2_000_000,
      currentPrice: 2_250_000,
      evaluationAmount: 4_500_000,
    });

    const upbitPortfolio = createMockExchangePortfolio('upbit', [btcHolding]);
    const bithumbPortfolio = createMockExchangePortfolio('bithumb', [ethHolding]);
    const aggregated = createMockAggregatedPortfolio([upbitPortfolio, bithumbPortfolio]);

    const snapshot = createSnapshotFromPortfolio(walletAddress, aggregated);

    expect(snapshot.walletAddress).toBe(walletAddress);
    expect(snapshot.totalEvaluation).toBe(aggregated.totalEvaluation);
    expect(snapshot.totalInvestment).toBe(aggregated.totalInvestment);
    expect(snapshot.totalProfitLoss).toBe(aggregated.totalProfitLoss);
    expect(snapshot.profitLossRate).toBe(aggregated.profitLossRate);
    expect(snapshot.holdings).toHaveLength(2);
    expect(snapshot.timestamp).toBeInstanceOf(Date);
  });

  it('오류 상태인 거래소의 holdings는 제외한다', () => {
    const btcHolding = createMockHolding({ exchange: 'upbit', symbol: 'BTC' });
    const upbitPortfolio = createMockExchangePortfolio('upbit', [btcHolding]);
    const errorPortfolio = createMockExchangePortfolio('bithumb', [], {
      status: 'error',
      errorMessage: 'API 오류',
    });

    const aggregated = createMockAggregatedPortfolio([upbitPortfolio, errorPortfolio]);

    const snapshot = createSnapshotFromPortfolio(walletAddress, aggregated);

    expect(snapshot.holdings).toHaveLength(1);
    expect(snapshot.holdings[0]!.exchange).toBe('upbit');
  });

  it('로딩 상태인 거래소의 holdings는 제외한다', () => {
    const btcHolding = createMockHolding({ exchange: 'upbit', symbol: 'BTC' });
    const upbitPortfolio = createMockExchangePortfolio('upbit', [btcHolding]);
    const loadingPortfolio = createMockExchangePortfolio('coinone', [], {
      status: 'loading',
    });

    const aggregated = createMockAggregatedPortfolio([upbitPortfolio, loadingPortfolio]);

    const snapshot = createSnapshotFromPortfolio(walletAddress, aggregated);

    expect(snapshot.holdings).toHaveLength(1);
    expect(snapshot.holdings[0]!.exchange).toBe('upbit');
  });

  it('빈 포트폴리오일 때도 올바르게 변환한다', () => {
    const aggregated = createMockAggregatedPortfolio([]);

    const snapshot = createSnapshotFromPortfolio(walletAddress, aggregated);

    expect(snapshot.walletAddress).toBe(walletAddress);
    expect(snapshot.totalEvaluation).toBe(0);
    expect(snapshot.holdings).toHaveLength(0);
  });

  it('여러 거래소의 동일 코인을 개별 holdings로 포함한다', () => {
    const upbitBtc = createMockHolding({ exchange: 'upbit', symbol: 'BTC', balance: 0.1 });
    const bithumbBtc = createMockHolding({ exchange: 'bithumb', symbol: 'BTC', balance: 0.2 });
    const upbitPortfolio = createMockExchangePortfolio('upbit', [upbitBtc]);
    const bithumbPortfolio = createMockExchangePortfolio('bithumb', [bithumbBtc]);

    const aggregated = createMockAggregatedPortfolio([upbitPortfolio, bithumbPortfolio]);

    const snapshot = createSnapshotFromPortfolio(walletAddress, aggregated);

    expect(snapshot.holdings).toHaveLength(2);
    const exchanges = snapshot.holdings.map((h) => h.exchange);
    expect(exchanges).toContain('upbit');
    expect(exchanges).toContain('bithumb');
  });
});

// ===== isSnapshotEqual 테스트 =====

describe('isSnapshotEqual', () => {
  it('두 null 스냅샷은 동일하다', () => {
    expect(isSnapshotEqual(null, null)).toBe(true);
  });

  it('하나만 null인 경우 동일하지 않다', () => {
    const snapshot = createMockSnapshot();
    expect(isSnapshotEqual(snapshot, null)).toBe(false);
    expect(isSnapshotEqual(null, snapshot)).toBe(false);
  });

  it('동일한 데이터의 스냅샷은 동일하다', () => {
    const snapshot1 = createMockSnapshot();
    const snapshot2 = createMockSnapshot();

    expect(isSnapshotEqual(snapshot1, snapshot2)).toBe(true);
  });

  it('총 평가금액이 다르면 동일하지 않다', () => {
    const snapshot1 = createMockSnapshot({ totalEvaluation: 10_000_000 });
    const snapshot2 = createMockSnapshot({ totalEvaluation: 11_000_000 });

    expect(isSnapshotEqual(snapshot1, snapshot2)).toBe(false);
  });

  it('총 투자금액이 다르면 동일하지 않다', () => {
    const snapshot1 = createMockSnapshot({ totalInvestment: 8_000_000 });
    const snapshot2 = createMockSnapshot({ totalInvestment: 9_000_000 });

    expect(isSnapshotEqual(snapshot1, snapshot2)).toBe(false);
  });

  it('보유 코인 수가 다르면 동일하지 않다', () => {
    const snapshot1 = createMockSnapshot({
      holdings: [
        { symbol: 'BTC', exchange: 'upbit', balance: 0.1, avgBuyPrice: 50_000_000, currentPrice: 55_000_000, evaluation: 5_500_000 },
      ],
    });
    const snapshot2 = createMockSnapshot({
      holdings: [
        { symbol: 'BTC', exchange: 'upbit', balance: 0.1, avgBuyPrice: 50_000_000, currentPrice: 55_000_000, evaluation: 5_500_000 },
        { symbol: 'ETH', exchange: 'bithumb', balance: 2.0, avgBuyPrice: 2_000_000, currentPrice: 2_250_000, evaluation: 4_500_000 },
      ],
    });

    expect(isSnapshotEqual(snapshot1, snapshot2)).toBe(false);
  });

  it('총 평가금액의 미세한 차이(1 KRW 이내)는 동일로 간주한다', () => {
    const snapshot1 = createMockSnapshot({ totalEvaluation: 10_000_000 });
    const snapshot2 = createMockSnapshot({ totalEvaluation: 10_000_000.5 });

    expect(isSnapshotEqual(snapshot1, snapshot2)).toBe(true);
  });
});
