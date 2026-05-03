/**
 * 온보딩 상태 관리 유틸리티
 *
 * 최초 로그인 시 표시되는 단계별 온보딩 가이드의
 * 완료 상태를 지갑 주소별로 localStorage에 저장/조회한다.
 * API 키 미등록 사용자를 위한 데모 모드용 모의 데이터도 포함한다.
 *
 * @see 요구사항 11.1 (단계별 온보딩 가이드)
 * @see 요구사항 11.2 (거래소 건너뛰기 허용)
 * @see 요구사항 11.3 (데모 데이터 미리보기 모드)
 * @see 요구사항 11.4 (온보딩 완료 후 대시보드 이동)
 */

import type { ExchangeType, MergedHolding, AggregatedPortfolio, ExchangePortfolio, Holding } from '@bitscope/shared';

// ===== localStorage 키 =====

/**
 * 온보딩 완료 상태 localStorage 키를 생성한다.
 *
 * @param walletAddress 지갑 주소 (소문자)
 * @returns localStorage 키 문자열
 */
function getOnboardingKey(walletAddress: string): string {
  return `bitscope:${walletAddress.toLowerCase()}:onboarding`;
}

// ===== 온보딩 상태 관리 =====

/** 온보딩 완료 데이터 구조 */
interface OnboardingData {
  /** 온보딩 완료 여부 */
  completed: boolean;
  /** 완료 일시 (ISO 8601) */
  completedAt?: string;
  /** 선택한 거래소 목록 (건너뛴 거래소 추적용) */
  selectedExchanges?: ExchangeType[];
}

/**
 * 온보딩 완료 상태를 조회한다.
 *
 * @param walletAddress 지갑 주소
 * @returns 온보딩이 완료되었으면 true
 */
export function isOnboardingCompleted(walletAddress: string): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const key = getOnboardingKey(walletAddress);
    const raw = localStorage.getItem(key);
    if (!raw) return false;

    const data: OnboardingData = JSON.parse(raw);
    return data.completed === true;
  } catch {
    return false;
  }
}

/**
 * 온보딩 완료 상태를 저장한다.
 *
 * @param walletAddress 지갑 주소
 * @param selectedExchanges 사용자가 선택한 거래소 목록
 */
export function markOnboardingCompleted(
  walletAddress: string,
  selectedExchanges?: ExchangeType[],
): void {
  if (typeof window === 'undefined') return;

  try {
    const key = getOnboardingKey(walletAddress);
    const data: OnboardingData = {
      completed: true,
      completedAt: new Date().toISOString(),
      selectedExchanges,
    };
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // localStorage 용량 초과 등의 오류는 무시
  }
}

/**
 * 온보딩 완료 상태를 초기화한다.
 * (테스트 또는 재온보딩 시 사용)
 *
 * @param walletAddress 지갑 주소
 */
export function resetOnboarding(walletAddress: string): void {
  if (typeof window === 'undefined') return;

  try {
    const key = getOnboardingKey(walletAddress);
    localStorage.removeItem(key);
  } catch {
    // localStorage 접근 실패 시 무시
  }
}

// ===== 데모 모드 모의 데이터 =====

/**
 * 데모 모드용 모의 보유 자산 데이터
 *
 * API 키를 등록하지 않은 사용자에게 서비스 기능을 체험할 수 있도록
 * 고정된 모의 데이터를 제공한다.
 *
 * @see 요구사항 11.3 (데모 데이터 미리보기 모드)
 */

/** 데모 모드 업비트 보유 자산 */
const DEMO_UPBIT_HOLDINGS: Holding[] = [
  {
    exchange: 'upbit',
    symbol: 'BTC',
    currency: 'KRW',
    balance: 0.5,
    lockedBalance: 0,
    avgBuyPrice: 85000000,
    currentPrice: 92500000,
    evaluationAmount: 46250000,
    profitLoss: 3750000,
    profitLossRate: 8.82,
  },
  {
    exchange: 'upbit',
    symbol: 'ETH',
    currency: 'KRW',
    balance: 5.0,
    lockedBalance: 0,
    avgBuyPrice: 3200000,
    currentPrice: 3450000,
    evaluationAmount: 17250000,
    profitLoss: 1250000,
    profitLossRate: 7.81,
  },
  {
    exchange: 'upbit',
    symbol: 'XRP',
    currency: 'KRW',
    balance: 10000,
    lockedBalance: 0,
    avgBuyPrice: 800,
    currentPrice: 750,
    evaluationAmount: 7500000,
    profitLoss: -500000,
    profitLossRate: -6.25,
  },
];

/** 데모 모드 빗썸 보유 자산 */
const DEMO_BITHUMB_HOLDINGS: Holding[] = [
  {
    exchange: 'bithumb',
    symbol: 'BTC',
    currency: 'KRW',
    balance: 0.3,
    lockedBalance: 0,
    avgBuyPrice: 88000000,
    currentPrice: 92500000,
    evaluationAmount: 27750000,
    profitLoss: 1350000,
    profitLossRate: 5.11,
  },
  {
    exchange: 'bithumb',
    symbol: 'SOL',
    currency: 'KRW',
    balance: 50,
    lockedBalance: 0,
    avgBuyPrice: 180000,
    currentPrice: 210000,
    evaluationAmount: 10500000,
    profitLoss: 1500000,
    profitLossRate: 16.67,
  },
];

/** 데모 모드 코인원 보유 자산 */
const DEMO_COINONE_HOLDINGS: Holding[] = [
  {
    exchange: 'coinone',
    symbol: 'ETH',
    currency: 'KRW',
    balance: 3.0,
    lockedBalance: 0,
    avgBuyPrice: 3100000,
    currentPrice: 3450000,
    evaluationAmount: 10350000,
    profitLoss: 1050000,
    profitLossRate: 11.29,
  },
  {
    exchange: 'coinone',
    symbol: 'DOGE',
    currency: 'KRW',
    balance: 50000,
    lockedBalance: 0,
    avgBuyPrice: 150,
    currentPrice: 165,
    evaluationAmount: 8250000,
    profitLoss: 750000,
    profitLossRate: 10.0,
  },
];

/**
 * 거래소별 데모 포트폴리오를 생성한다.
 *
 * @param exchange 거래소 식별자
 * @param holdings 보유 자산 목록
 * @returns 거래소 포트폴리오 객체
 */
function createDemoExchangePortfolio(
  exchange: ExchangeType,
  holdings: Holding[],
): ExchangePortfolio {
  const totalEvaluation = holdings.reduce((sum, h) => sum + h.evaluationAmount, 0);
  const totalInvestment = holdings.reduce((sum, h) => sum + h.avgBuyPrice * h.balance, 0);
  const totalProfitLoss = totalEvaluation - totalInvestment;
  const profitLossRate = totalInvestment > 0 ? (totalProfitLoss / totalInvestment) * 100 : 0;

  return {
    exchange,
    holdings,
    totalEvaluation,
    totalInvestment,
    totalProfitLoss,
    profitLossRate,
    krwBalance: 5000000,
    lastUpdated: new Date(),
    status: 'connected',
  };
}

/**
 * 데모 모드용 통합 포트폴리오를 생성한다.
 *
 * 3개 거래소의 모의 데이터를 통합하여 반환한다.
 * 실제 포트폴리오 통합기(PortfolioAggregator)와 동일한 데이터 구조를 사용한다.
 *
 * @returns 데모 모드용 통합 포트폴리오
 */
export function getDemoPortfolio(): AggregatedPortfolio {
  const portfolios: ExchangePortfolio[] = [
    createDemoExchangePortfolio('upbit', DEMO_UPBIT_HOLDINGS),
    createDemoExchangePortfolio('bithumb', DEMO_BITHUMB_HOLDINGS),
    createDemoExchangePortfolio('coinone', DEMO_COINONE_HOLDINGS),
  ];

  // 코인별 통합 (MergedHolding 생성)
  const coinMap = new Map<string, MergedHolding>();

  for (const portfolio of portfolios) {
    for (const holding of portfolio.holdings) {
      const existing = coinMap.get(holding.symbol);
      const exchangeEntry = {
        exchange: holding.exchange,
        balance: holding.balance,
        avgBuyPrice: holding.avgBuyPrice,
        currentPrice: holding.currentPrice,
        evaluation: holding.evaluationAmount,
        profitLoss: holding.profitLoss,
        profitLossRate: holding.profitLossRate,
      };

      if (existing) {
        const newTotalBalance = existing.totalBalance + holding.balance;
        const newTotalEvaluation = existing.totalEvaluation + holding.evaluationAmount;
        const totalInvestment =
          existing.weightedAvgBuyPrice * existing.totalBalance +
          holding.avgBuyPrice * holding.balance;
        const newWeightedAvg = newTotalBalance > 0 ? totalInvestment / newTotalBalance : 0;
        const newTotalProfitLoss = existing.totalProfitLoss + holding.profitLoss;
        const newProfitLossRate =
          totalInvestment > 0 ? (newTotalProfitLoss / totalInvestment) * 100 : 0;

        coinMap.set(holding.symbol, {
          ...existing,
          totalBalance: newTotalBalance,
          weightedAvgBuyPrice: newWeightedAvg,
          currentPrice: holding.currentPrice,
          totalEvaluation: newTotalEvaluation,
          totalProfitLoss: newTotalProfitLoss,
          profitLossRate: newProfitLossRate,
          exchanges: [...existing.exchanges, exchangeEntry],
        });
      } else {
        coinMap.set(holding.symbol, {
          symbol: holding.symbol,
          totalBalance: holding.balance,
          weightedAvgBuyPrice: holding.avgBuyPrice,
          currentPrice: holding.currentPrice,
          totalEvaluation: holding.evaluationAmount,
          totalProfitLoss: holding.profitLoss,
          profitLossRate: holding.profitLossRate,
          exchanges: [exchangeEntry],
        });
      }
    }
  }

  const mergedHoldings = Array.from(coinMap.values()).sort(
    (a, b) => b.totalEvaluation - a.totalEvaluation,
  );

  const totalEvaluation = portfolios.reduce((sum, p) => sum + p.totalEvaluation, 0);
  const totalInvestment = portfolios.reduce((sum, p) => sum + p.totalInvestment, 0);
  const totalProfitLoss = totalEvaluation - totalInvestment;
  const profitLossRate = totalInvestment > 0 ? (totalProfitLoss / totalInvestment) * 100 : 0;
  const totalKrwBalance = portfolios.reduce((sum, p) => sum + p.krwBalance, 0);

  return {
    portfolios,
    mergedHoldings,
    totalEvaluation,
    totalInvestment,
    totalProfitLoss,
    profitLossRate,
    totalKrwBalance,
    lastUpdated: new Date(),
  };
}
