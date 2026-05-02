/**
 * 포트폴리오 관련 공유 타입 정의
 *
 * 개별 거래소 보유 내역, 거래소별 포트폴리오, 통합 포트폴리오,
 * 코인별 합산 보유 내역 타입을 포함한다.
 */

import type { ExchangeType, Currency } from './exchange';

/** 거래소별 개별 코인 보유 내역 */
export interface Holding {
  /** 보유 거래소 */
  exchange: ExchangeType;
  /** 코인 심볼 (예: "BTC", "ETH") */
  symbol: string;
  /** 마켓 통화 */
  currency: Currency;
  /** 보유 수량 */
  balance: number;
  /** 잠김 수량 (주문 중) */
  lockedBalance: number;
  /** 매수 평균가 */
  avgBuyPrice: number;
  /** 현재가 */
  currentPrice: number;
  /** 평가 금액 (KRW) */
  evaluationAmount: number;
  /** 손익 금액 */
  profitLoss: number;
  /** 수익률 (%) */
  profitLossRate: number;
}

/** 거래소별 포트폴리오 */
export interface ExchangePortfolio {
  /** 거래소 식별자 */
  exchange: ExchangeType;
  /** 보유 코인 목록 */
  holdings: Holding[];
  /** 총 평가금액 (KRW) */
  totalEvaluation: number;
  /** 총 투자금액 (KRW) */
  totalInvestment: number;
  /** 총 손익 */
  totalProfitLoss: number;
  /** 총 수익률 (%) */
  profitLossRate: number;
  /** 원화 잔고 */
  krwBalance: number;
  /** 마지막 업데이트 시각 */
  lastUpdated: Date;
  /** 연결 상태 */
  status: 'connected' | 'error' | 'loading';
  /** 오류 발생 시 메시지 */
  errorMessage?: string;
}

/** 코인별 통합(합산) 보유 내역 */
export interface MergedHolding {
  /** 코인 심볼 */
  symbol: string;
  /** 전체 보유 수량 (거래소 합산) */
  totalBalance: number;
  /** 가중 평균 매수가 */
  weightedAvgBuyPrice: number;
  /** 현재가 */
  currentPrice: number;
  /** 총 평가금액 */
  totalEvaluation: number;
  /** 총 손익 */
  totalProfitLoss: number;
  /** 수익률 (%) */
  profitLossRate: number;
  /** 거래소별 상세 보유 내역 */
  exchanges: {
    exchange: ExchangeType;
    balance: number;
    avgBuyPrice: number;
    evaluation: number;
    profitLoss: number;
    profitLossRate: number;
  }[];
}

/** 여러 거래소를 통합한 전체 포트폴리오 */
export interface AggregatedPortfolio {
  /** 거래소별 개별 포트폴리오 */
  portfolios: ExchangePortfolio[];
  /** 코인별 통합 보유 내역 */
  mergedHoldings: MergedHolding[];
  /** 통합 총 평가금액 */
  totalEvaluation: number;
  /** 통합 총 투자금액 */
  totalInvestment: number;
  /** 통합 총 손익 */
  totalProfitLoss: number;
  /** 통합 수익률 (%) */
  profitLossRate: number;
  /** 통합 원화 잔고 */
  totalKrwBalance: number;
  /** 마지막 업데이트 시각 */
  lastUpdated: Date;
}

/** 자산 분포 정보 (차트 렌더링용) */
export interface AssetDistribution {
  /** 코인별 비중 */
  byCoin: { symbol: string; amount: number; ratio: number }[];
  /** 거래소별 비중 */
  byExchange: { exchange: ExchangeType; amount: number; ratio: number }[];
}

/** 개별 코인 상세 요약 */
export interface CoinSummary {
  /** 코인 심볼 */
  symbol: string;
  /** 전체 보유 수량 */
  totalBalance: number;
  /** 가중 평균 매수가 */
  weightedAvgBuyPrice: number;
  /** 현재가 */
  currentPrice: number;
  /** 총 평가금액 */
  totalEvaluation: number;
  /** 총 손익 */
  totalProfitLoss: number;
  /** 수익률 (%) */
  profitLossRate: number;
  /** 거래소별 상세 보유 내역 */
  exchanges: {
    exchange: ExchangeType;
    balance: number;
    avgBuyPrice: number;
    currentPrice: number;
    evaluation: number;
    profitLoss: number;
    profitLossRate: number;
  }[];
}

/** 정렬 기준 */
export type SortCriteria =
  | 'evaluationAmount'
  | 'profitLossRate'
  | 'symbol'
  | 'balance'
  | 'currentPrice';

/** 정렬 방향 */
export type SortDirection = 'asc' | 'desc';

/** 보유 내역 필터 */
export interface HoldingFilter {
  /** 특정 거래소만 필터 */
  exchanges?: ExchangeType[];
  /** 수익/손실 구분 필터 */
  profitLossType?: 'profit' | 'loss' | 'all';
}

/** 가격 맵 (심볼 → 현재가) */
export type PriceMap = Record<string, number>;

/** 손익 계산 결과 */
export interface ProfitLossResult {
  /** 총 평가금액 */
  totalEvaluation: number;
  /** 총 투자금액 */
  totalInvestment: number;
  /** 총 손익 금액 */
  totalProfitLoss: number;
  /** 수익률 (%) */
  profitLossRate: number;
}
