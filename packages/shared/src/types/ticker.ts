/**
 * 시세 및 김치 프리미엄 관련 공유 타입 정의
 *
 * 거래소별 시세(Ticker), 호가(Orderbook),
 * 거래소 간 시세 차이(김치 프리미엄) 타입을 포함한다.
 */

import type { ExchangeType } from './exchange';

/** 거래소별 코인 시세 정보 */
export interface Ticker {
  /** 거래소 */
  exchange: ExchangeType;
  /** 코인 심볼 */
  symbol: string;
  /** 현재가 */
  currentPrice: number;
  /** 시가 (당일 시초가) */
  openPrice: number;
  /** 고가 (24시간 최고가) */
  highPrice: number;
  /** 저가 (24시간 최저가) */
  lowPrice: number;
  /** 전일 종가 */
  prevClosePrice: number;
  /** 24시간 변동률 (%) */
  changeRate: number;
  /** 24시간 변동 금액 */
  changePrice: number;
  /** 24시간 거래량 */
  volume24h: number;
  /** 24시간 거래금액 (KRW) */
  volumeAmount24h: number;
  /** 타임스탬프 (밀리초) */
  timestamp: number;
}

/** 호가 단일 항목 */
export interface OrderbookEntry {
  /** 가격 */
  price: number;
  /** 수량 */
  quantity: number;
}

/** 호가 정보 */
export interface Orderbook {
  /** 거래소 */
  exchange: ExchangeType;
  /** 코인 심볼 */
  symbol: string;
  /** 매도 호가 목록 (낮은 가격순) */
  asks: OrderbookEntry[];
  /** 매수 호가 목록 (높은 가격순) */
  bids: OrderbookEntry[];
  /** 타임스탬프 (밀리초) */
  timestamp: number;
}

/** 김치 프리미엄 데이터 (국내 거래소 vs 바이낸스 시세 차이) */
export interface KimchiPremiumData {
  /** 코인 심볼 */
  symbol: string;
  /** 비교 기준 국내 거래소 */
  domesticExchange: ExchangeType;
  /** 국내 거래소 KRW 가격 */
  domesticPrice: number;
  /** 바이낸스 USDT 가격 */
  binanceUsdtPrice: number;
  /** USDT/KRW 환율 (업비트 KRW-USDT 시세 기준) */
  usdtKrwRate: number;
  /** 바이낸스 가격의 KRW 환산가 (binanceUsdtPrice * usdtKrwRate) */
  binanceKrwPrice: number;
  /** 가격 차이 (국내가격 - 바이낸스KRW환산가) */
  premiumAmount: number;
  /** 프리미엄 비율 (%) = (국내가격 - 바이낸스KRW환산가) / 바이낸스KRW환산가 * 100 */
  premiumRate: number;
  /** 타임스탬프 (밀리초) */
  timestamp: number;
}

/** 김치 프리미엄 이력 항목 (DB 조회용) */
export interface KimchiPremiumHistory {
  /** 코인 심볼 */
  symbol: string;
  /** 비교 기준 국내 거래소 */
  domesticExchange: ExchangeType;
  /** 국내 거래소 KRW 가격 */
  domesticPrice: number;
  /** 바이낸스 USDT 가격 */
  binanceUsdtPrice: number;
  /** USDT/KRW 환율 */
  usdtKrwRate: number;
  /** 프리미엄 비율 (%) */
  premiumRate: number;
  /** 기록 시각 */
  recordedAt: Date;
}

/** 실시간 가격 업데이트 이벤트 */
export interface PriceUpdate {
  /** 거래소 */
  exchange: ExchangeType;
  /** 코인 심볼 */
  symbol: string;
  /** 현재가 */
  price: number;
  /** 24시간 변동률 (%) */
  changeRate: number;
  /** 24시간 거래량 */
  volume24h: number;
  /** 타임스탬프 (밀리초) */
  timestamp: number;
}
