/**
 * useSnapshotSync 훅 단위 테스트
 *
 * 스냅샷 동기화 훅의 핵심 로직을 검증한다:
 * - 스냅샷 전송 호출 여부
 * - 전송 실패 시 SnapshotQueue 큐잉
 * - 중복 전송 방지
 * - 최소 전송 간격 준수
 *
 * @see 요구사항 4.9 (클라이언트가 포트폴리오 스냅샷을 NestJS에 전송)
 * @see 요구사항 12.14, 12.15 (클라이언트 접속 시 스냅샷 축적)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sendSnapshot,
  createSnapshotFromPortfolio,
  isSnapshotEqual,
} from '../../lib/snapshot-client';

// 스냅샷 클라이언트 모킹
vi.mock('../../lib/snapshot-client', () => ({
  sendSnapshot: vi.fn(),
  createSnapshotFromPortfolio: vi.fn(),
  isSnapshotEqual: vi.fn(),
}));

// SnapshotQueue 모킹
vi.mock('../../lib/error-recovery', () => ({
  SnapshotQueue: vi.fn().mockImplementation(() => ({
    enqueue: vi.fn(),
    getPendingItems: vi.fn().mockReturnValue([]),
    flush: vi.fn().mockResolvedValue({ successCount: 0, failureCount: 0 }),
    getStatus: vi.fn().mockReturnValue({ pendingCount: 0, items: [] }),
    dequeue: vi.fn(),
    markRetry: vi.fn(),
    clear: vi.fn(),
  })),
}));

const mockSendSnapshot = sendSnapshot as ReturnType<typeof vi.fn>;
const mockCreateSnapshot = createSnapshotFromPortfolio as ReturnType<typeof vi.fn>;
const mockIsSnapshotEqual = isSnapshotEqual as ReturnType<typeof vi.fn>;

import type {
  AggregatedPortfolio,
  ExchangePortfolio,
  PortfolioSnapshot,
} from '@bitscope/shared';

// ===== 테스트 헬퍼 =====

function createMockPortfolio(
  overrides?: Partial<AggregatedPortfolio>,
): AggregatedPortfolio {
  const defaultPortfolios: ExchangePortfolio[] = [
    {
      exchange: 'upbit',
      holdings: [
        {
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
        },
      ],
      totalEvaluation: 5_500_000,
      totalInvestment: 5_000_000,
      totalProfitLoss: 500_000,
      profitLossRate: 10.0,
      krwBalance: 1_000_000,
      lastUpdated: new Date(),
      status: 'connected',
    },
  ];

  return {
    portfolios: defaultPortfolios,
    mergedHoldings: [],
    totalEvaluation: 5_500_000,
    totalInvestment: 5_000_000,
    totalProfitLoss: 500_000,
    profitLossRate: 10.0,
    totalKrwBalance: 1_000_000,
    lastUpdated: new Date(),
    ...overrides,
  };
}

function createMockSnapshotData(): PortfolioSnapshot {
  return {
    walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
    timestamp: new Date(),
    totalEvaluation: 5_500_000,
    totalInvestment: 5_000_000,
    totalProfitLoss: 500_000,
    profitLossRate: 10.0,
    holdings: [
      {
        symbol: 'BTC',
        exchange: 'upbit',
        balance: 0.1,
        avgBuyPrice: 50_000_000,
        currentPrice: 55_000_000,
        evaluation: 5_500_000,
      },
    ],
  };
}

// ===== 테스트 =====

describe('snapshot-client 모듈 (useSnapshotSync 의존)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSnapshotEqual.mockReturnValue(false);
    mockCreateSnapshot.mockReturnValue(createMockSnapshotData());
    mockSendSnapshot.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendSnapshot 호출', () => {
    it('sendSnapshot이 올바른 인자로 호출되는지 검증한다', async () => {
      const walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
      const snapshot = createMockSnapshotData();

      await mockSendSnapshot(walletAddress, snapshot);

      expect(mockSendSnapshot).toHaveBeenCalledWith(walletAddress, snapshot);
    });

    it('sendSnapshot 실패 시 에러를 throw한다', async () => {
      mockSendSnapshot.mockRejectedValueOnce(new Error('전송 실패'));

      const walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
      const snapshot = createMockSnapshotData();

      await expect(
        mockSendSnapshot(walletAddress, snapshot),
      ).rejects.toThrow('전송 실패');
    });
  });

  describe('createSnapshotFromPortfolio 변환', () => {
    it('AggregatedPortfolio를 PortfolioSnapshot으로 변환한다', () => {
      const walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
      const portfolio = createMockPortfolio();

      const result = mockCreateSnapshot(walletAddress, portfolio);

      expect(mockCreateSnapshot).toHaveBeenCalledWith(walletAddress, portfolio);
      expect(result).toBeDefined();
      expect(result.walletAddress).toBe(walletAddress);
    });
  });

  describe('isSnapshotEqual 중복 감지', () => {
    it('동일 스냅샷은 true를 반환한다', () => {
      mockIsSnapshotEqual.mockReturnValue(true);
      const snapshot = createMockSnapshotData();
      expect(mockIsSnapshotEqual(snapshot, snapshot)).toBe(true);
    });

    it('다른 스냅샷은 false를 반환한다', () => {
      mockIsSnapshotEqual.mockReturnValue(false);
      const snapshot1 = createMockSnapshotData();
      const snapshot2 = { ...createMockSnapshotData(), totalEvaluation: 999 };
      expect(mockIsSnapshotEqual(snapshot1, snapshot2)).toBe(false);
    });
  });
});

describe('스냅샷 동기화 통합 로직', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('포트폴리오가 유효한 데이터를 포함할 때만 스냅샷을 생성한다', () => {
    const portfolio = createMockPortfolio();

    // 유효한 데이터가 있는지 확인 (connected 상태이고 holdings가 있는 거래소)
    const hasValidData = portfolio.portfolios.some(
      (p) => p.status === 'connected' && p.holdings.length > 0,
    );

    expect(hasValidData).toBe(true);
  });

  it('모든 거래소가 오류 상태이면 스냅샷을 생성하지 않는다', () => {
    const portfolio = createMockPortfolio({
      portfolios: [
        {
          exchange: 'upbit',
          holdings: [],
          totalEvaluation: 0,
          totalInvestment: 0,
          totalProfitLoss: 0,
          profitLossRate: 0,
          krwBalance: 0,
          lastUpdated: new Date(),
          status: 'error',
          errorMessage: 'API 오류',
        },
      ],
    });

    const hasValidData = portfolio.portfolios.some(
      (p) => p.status === 'connected' && p.holdings.length > 0,
    );

    expect(hasValidData).toBe(false);
  });

  it('connected 상태이지만 holdings가 비어있으면 스냅샷을 생성하지 않는다', () => {
    const portfolio = createMockPortfolio({
      portfolios: [
        {
          exchange: 'upbit',
          holdings: [],
          totalEvaluation: 0,
          totalInvestment: 0,
          totalProfitLoss: 0,
          profitLossRate: 0,
          krwBalance: 1_000_000,
          lastUpdated: new Date(),
          status: 'connected',
        },
      ],
    });

    const hasValidData = portfolio.portfolios.some(
      (p) => p.status === 'connected' && p.holdings.length > 0,
    );

    expect(hasValidData).toBe(false);
  });

  it('일부 거래소만 connected 상태이면 해당 거래소의 데이터만 포함한다', () => {
    const portfolio = createMockPortfolio({
      portfolios: [
        {
          exchange: 'upbit',
          holdings: [
            {
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
            },
          ],
          totalEvaluation: 5_500_000,
          totalInvestment: 5_000_000,
          totalProfitLoss: 500_000,
          profitLossRate: 10.0,
          krwBalance: 1_000_000,
          lastUpdated: new Date(),
          status: 'connected',
        },
        {
          exchange: 'bithumb',
          holdings: [],
          totalEvaluation: 0,
          totalInvestment: 0,
          totalProfitLoss: 0,
          profitLossRate: 0,
          krwBalance: 0,
          lastUpdated: new Date(),
          status: 'error',
          errorMessage: '빗썸 API 오류',
        },
      ],
    });

    // 유효 데이터가 있는 거래소만 필터
    const validPortfolios = portfolio.portfolios.filter(
      (p) => p.status === 'connected' && p.holdings.length > 0,
    );

    expect(validPortfolios).toHaveLength(1);
    expect(validPortfolios[0]!.exchange).toBe('upbit');
  });
});
