/**
 * 정규화된 거래소 응답 타입 정의
 *
 * 각 거래소의 상이한 API 응답 형식을 통일된 내부 데이터 모델로
 * 변환하기 위한 정규화된 응답 타입을 정의한다.
 *
 * @see 요구사항 12.4 (응답 데이터 통일된 내부 데이터 모델 정규화)
 * @see 설계 문서 3.2.3 ResponseNormalizer
 */

import type { ExchangeType, Currency, Holding, Ticker, Orderbook } from '@bitscope/shared';

/** 정규화된 잔고 응답 */
export interface NormalizedBalance {
  /** 거래소 식별자 */
  exchange: ExchangeType;
  /** 보유 코인 목록 */
  holdings: Holding[];
  /** 원화(KRW) 잔고 */
  krwBalance: number;
  /** 응답 수신 시각 (밀리초 타임스탬프) */
  timestamp: number;
}

/** 정규화된 시세(티커) 응답 */
export interface NormalizedTicker {
  /** 거래소 식별자 */
  exchange: ExchangeType;
  /** 시세 목록 (복수 코인 시세 조회 시) */
  tickers: Ticker[];
  /** 응답 수신 시각 (밀리초 타임스탬프) */
  timestamp: number;
}

/** 정규화된 호가(오더북) 응답 */
export interface NormalizedOrderbook {
  /** 거래소 식별자 */
  exchange: ExchangeType;
  /** 호가 정보 */
  orderbook: Orderbook;
  /** 응답 수신 시각 (밀리초 타임스탬프) */
  timestamp: number;
}

/** 주문 내역 항목 */
export interface OrderHistoryItem {
  /** 주문 고유 ID */
  orderId: string;
  /** 코인 심볼 */
  symbol: string;
  /** 마켓 통화 */
  currency: Currency;
  /** 주문 유형 (매수/매도) */
  side: 'buy' | 'sell';
  /** 주문 가격 */
  price: number;
  /** 주문 수량 */
  quantity: number;
  /** 체결 수량 */
  executedQuantity: number;
  /** 주문 상태 */
  status: 'open' | 'filled' | 'partially_filled' | 'cancelled';
  /** 주문 시각 */
  orderedAt: Date;
}

/** 정규화된 주문 내역 응답 */
export interface NormalizedOrderHistory {
  /** 거래소 식별자 */
  exchange: ExchangeType;
  /** 주문 내역 목록 */
  orders: OrderHistoryItem[];
  /** 응답 수신 시각 (밀리초 타임스탬프) */
  timestamp: number;
}
