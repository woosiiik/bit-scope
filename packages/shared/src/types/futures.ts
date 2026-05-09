/**
 * 선물 마켓 데이터 타입 정의
 *
 * 바이낸스 Futures 공개 API에서 수집하는 5가지 지표 타입을 정의한다.
 */

/** 선물 지표 종류 */
export type FuturesIndicatorType =
  | 'longShortRatio'
  | 'liquidations'
  | 'openInterest'
  | 'fundingRate'
  | 'topTraderRatio';

/** 롱숏 비율 항목 */
export interface LongShortRatioEntry {
  symbol: string;
  longAccount: number;
  shortAccount: number;
  longShortRatio: number;
  timestamp: number;
}

/** 강제 청산 항목 */
export interface LiquidationEntry {
  symbol: string;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  quoteQuantity: number;
  time: number;
}

/** 미결제 약정 항목 */
export interface OpenInterestEntry {
  symbol: string;
  sumOpenInterest: number;
  sumOpenInterestValue: number;
  timestamp: number;
}

/** 펀딩 비율 항목 */
export interface FundingRateEntry {
  symbol: string;
  fundingRate: number;
  fundingTime: number;
}

/** 탑 트레이더 롱숏 비율 항목 */
export interface TopTraderRatioEntry {
  symbol: string;
  longAccount: number;
  shortAccount: number;
  longShortRatio: number;
  timestamp: number;
}

/** 심볼별 선물 데이터 캐시 */
export interface CachedFuturesData {
  symbol: string;
  longShortRatio: LongShortRatioEntry[];
  liquidations: LiquidationEntry[];
  openInterest: OpenInterestEntry[];
  fundingRate: FundingRateEntry[];
  topTraderRatio: TopTraderRatioEntry[];
  lastUpdated: number;
}

/** 선물 지표 응답 (프론트 API용) */
export interface FuturesIndicatorsResponse {
  symbol: string;
  indicators: CachedFuturesData;
}
