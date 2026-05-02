/**
 * 리포트 및 스냅샷 관련 공유 타입 정의
 *
 * 포트폴리오 스냅샷(DB 저장용), 리포트 생성/조회,
 * 데이터 내보내기 관련 타입을 포함한다.
 */

import type { ExchangeType } from './exchange';

/** 포트폴리오 스냅샷 (DB 저장용) */
export interface PortfolioSnapshot {
  /** 사용자 지갑 주소 */
  walletAddress: string;
  /** 스냅샷 시각 */
  timestamp: Date;
  /** 총 평가금액 */
  totalEvaluation: number;
  /** 총 투자금액 */
  totalInvestment: number;
  /** 총 손익 */
  totalProfitLoss: number;
  /** 수익률 (%) */
  profitLossRate: number;
  /** 보유 코인 상세 목록 */
  holdings: SnapshotHolding[];
}

/** 스냅샷 내 개별 코인 보유 내역 */
export interface SnapshotHolding {
  /** 코인 심볼 */
  symbol: string;
  /** 거래소 */
  exchange: ExchangeType;
  /** 보유 수량 */
  balance: number;
  /** 매수 평균가 */
  avgBuyPrice: number;
  /** 현재가 */
  currentPrice: number;
  /** 평가금액 */
  evaluation: number;
}

/** 리포트 유형 */
export type ReportType = 'daily' | 'weekly' | 'monthly' | 'custom';

/** 데이터 내보내기 포맷 */
export type ExportFormat = 'csv' | 'json' | 'pdf';

/** 리포트 요약 정보 */
export interface ReportSummary {
  /** 총 평가금액 */
  totalEvaluation: number;
  /** 평가금액 변동(이전 리포트 대비) */
  evaluationChange: number;
  /** 평가금액 변동률 (%) */
  evaluationChangeRate: number;
  /** 수익 상위 코인 */
  topGainers: { symbol: string; rate: number }[];
  /** 손실 상위 코인 */
  topLosers: { symbol: string; rate: number }[];
  /** 신규 편입 코인 */
  newCoins: string[];
  /** 편출된 코인 */
  removedCoins: string[];
}

/** 리포트 엔티티 */
export interface Report {
  /** 리포트 고유 ID (UUID) */
  id: string;
  /** 사용자 지갑 주소 */
  walletAddress: string;
  /** 리포트 유형 */
  type: ReportType;
  /** 생성 일시 */
  generatedAt: Date;
  /** 리포트 시작 기간 */
  periodStart: Date;
  /** 리포트 종료 기간 */
  periodEnd: Date;
  /** 리포트 요약 */
  summary: ReportSummary;
  /** 리포트 시점의 스냅샷 데이터 */
  data: PortfolioSnapshot;
}

/** 정기 리포트 스케줄 */
export interface ReportSchedule {
  /** 스케줄 고유 ID (UUID) */
  id: string;
  /** 사용자 지갑 주소 */
  walletAddress: string;
  /** 리포트 유형 */
  type: ReportType;
  /** 활성 상태 여부 */
  isActive: boolean;
  /** 다음 실행 예정 시각 */
  nextRunAt: Date;
}

/** 데이터 내보내기 옵션 */
export interface ExportOptions {
  /** 시작 기간 */
  periodStart?: Date;
  /** 종료 기간 */
  periodEnd?: Date;
  /** 포함할 거래소 */
  exchanges?: ExchangeType[];
  /** 포함할 코인 심볼 */
  symbols?: string[];
}

/** 집계된 스냅샷 (시계열 분석용) */
export interface AggregatedSnapshot {
  /** 기간 시작 시각 */
  periodStart: Date;
  /** 기간 종료 시각 */
  periodEnd: Date;
  /** 평균 총 평가금액 */
  avgTotalEvaluation: number;
  /** 최대 총 평가금액 */
  maxTotalEvaluation: number;
  /** 최소 총 평가금액 */
  minTotalEvaluation: number;
  /** 스냅샷 개수 */
  snapshotCount: number;
}

/** 집계 간격 (시계열 분석용) */
export type AggregationInterval = 'hourly' | 'daily' | 'weekly' | 'monthly';

/** 시간 기간 조회 파라미터 */
export interface TimePeriod {
  /** 시작 시각 */
  start: Date;
  /** 종료 시각 */
  end: Date;
}
