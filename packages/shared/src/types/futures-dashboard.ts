/**
 * 멀티 거래소 선물 대시보드 타입 정의
 *
 * 12개 지표 x 6개 거래소의 선물 데이터를 통합 제공하는
 * 멀티 거래소 선물 대시보드의 타입을 정의한다.
 */

import type { FuturesExchangeType } from './futures';

/** 멀티 거래소 선물 대시보드 지표 종류 (12개) */
export type FuturesDashboardIndicator =
  | 'price'
  | 'volume24h'
  | 'volumeHistory'
  | 'oiSnapshot'
  | 'oiHistory'
  | 'fundingRate'
  | 'liquidations'
  | 'cvd'
  | 'basis3m'
  | 'avgReturnByHour'
  | 'avgReturnByDay'
  | 'cumReturnBySession';

/** 기간 선택 옵션 */
export type Period = '1d' | '1w' | '1m' | '3m' | '6m' | '1y';

/** 거래소별 데이터 포인트 (스냅샷) */
export interface ExchangeDataPoint {
  exchange: FuturesExchangeType;
  value: number;
  label?: string;
}

/** 거래소별 시계열 데이터 포인트 */
export interface ExchangeTimeSeriesPoint {
  timestamp: number;
  values: Partial<Record<FuturesExchangeType, number>>;
}

/** 펀딩 비율 스냅샷 데이터 */
export interface FundingRateSnapshot {
  exchange: FuturesExchangeType;
  rate8h: number;
  rateAnnual: number;
  nextFundingTime?: number;
}

/** 청산 데이터 포인트 */
export interface LiquidationPoint {
  timestamp: number;
  values: Partial<Record<FuturesExchangeType, {
    longUsd: number;
    shortUsd: number;
  }>>;
}

/** CVD 데이터 포인트 */
export interface CVDPoint {
  timestamp: number;
  values: Partial<Record<FuturesExchangeType, number>>;
}

/** 시간대별 평균 수익률 */
export interface HourlyReturnPoint {
  hour: number;
  avgReturn: number;
}

/** 요일별 평균 수익률 */
export interface DailyReturnPoint {
  day: number;
  dayLabel: string;
  avgReturn: number;
}

/** 세션별 누적 수익률 */
export interface SessionReturnPoint {
  timestamp: number;
  apac: number;
  eu: number;
  us: number;
}

/** 멀티 거래소 API 통합 응답 */
export interface MultiExchangeResponse<T = unknown> {
  indicator: FuturesDashboardIndicator;
  coin: string;
  data: T;
  errors: Partial<Record<FuturesExchangeType, string>>;
  timestamp: number;
}
