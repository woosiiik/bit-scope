/**
 * 코인원 API 응답 정규화 모듈
 *
 * 코인원 거래소의 API 응답을 통일된 내부 데이터 모델로 변환한다.
 * 각 API 엔드포인트(잔고, 시세, 호가, 주문 내역)별로 정규화 함수를 제공한다.
 *
 * 코인원 API 응답 특성:
 * - 공통 래퍼: { result: "success", ... } (result "success" = 성공)
 * - 잔고 조회 (v2.1): { result: "success", balances: [{ currency, available, limit, ... }] }
 * - 시세 조회 (v2): { result: "success", tickers: [{ target_currency, quote_volume, ... }] }
 * - 호가 조회 (v2): { result: "success", asks: [...], bids: [...] }
 * - 주문 내역 (v2.1): { result: "success", orders: [{ order_id, type, price, qty, ... }] }
 *
 * @see 요구사항 12.4 (응답 데이터 통일된 내부 데이터 모델 정규화)
 * @see https://docs.coinone.co.kr/reference
 */

import type { Holding, Ticker, Orderbook, OrderbookEntry } from '@bitscope/shared';
import type {
  NormalizedBalance,
  NormalizedTicker,
  NormalizedOrderbook,
  NormalizedOrderHistory,
  OrderHistoryItem,
} from './types';

// ===== 코인원 API 원본 응답 타입 =====

/** 코인원 API 공통 응답 필드 */
export interface CoinoneBaseResponse {
  result: 'success' | 'error';
  error_code?: string;
  error_msg?: string;
}

/** 코인원 잔고 조회 응답 (v2.1) */
export interface CoinoneBalanceResponse extends CoinoneBaseResponse {
  balances: CoinoneBalanceItem[];
}

/** 코인원 잔고 항목 */
export interface CoinoneBalanceItem {
  /** 코인 심볼 (예: "BTC", "KRW") */
  currency: string;
  /** 사용 가능 수량 */
  available: string;
  /** 주문 중 잠김 수량 */
  limit: string;
  /** 매수 평균가 (KRW 마켓 기준) */
  average_price?: string;
}

/** 코인원 시세(Ticker) 조회 응답 (v2) */
export interface CoinoneTickerResponse extends CoinoneBaseResponse {
  tickers: CoinoneTickerItem[];
}

/** 코인원 시세 항목 */
export interface CoinoneTickerItem {
  /** 코인 심볼 (예: "BTC") */
  target_currency: string;
  /** 마켓 통화 (예: "KRW") */
  quote_currency: string;
  /** 현재가 (마지막 체결가) */
  last: string;
  /** 시가 (24시간 전 기준) */
  first: string;
  /** 고가 (24시간) */
  high: string;
  /** 저가 (24시간) */
  low: string;
  /** 24시간 거래량 (코인 기준) */
  target_volume: string;
  /** 24시간 거래금액 (KRW 기준) */
  quote_volume: string;
  /** 전일 종가 */
  yesterday_last: string;
  /** 24시간 변동률 (소수, 예: "0.05" = 5%) */
  yesterday_volume?: string;
  /** 타임스탬프 (밀리초) */
  timestamp: number;
}

/** 코인원 호가(Orderbook) 조회 응답 (v2) */
export interface CoinoneOrderbookResponse extends CoinoneBaseResponse {
  /** 매도 호가 목록 */
  asks: CoinoneOrderbookEntry[];
  /** 매수 호가 목록 */
  bids: CoinoneOrderbookEntry[];
  /** 코인 심볼 */
  target_currency: string;
  /** 마켓 통화 */
  quote_currency: string;
  /** 타임스탬프 */
  timestamp: number;
}

/** 코인원 호가 항목 */
export interface CoinoneOrderbookEntry {
  price: string;
  qty: string;
}

/** 코인원 주문 내역 조회 응답 (v2.1) */
export interface CoinoneOrderHistoryResponse extends CoinoneBaseResponse {
  orders: CoinoneOrderItem[];
}

/** 코인원 주문 내역 항목 */
export interface CoinoneOrderItem {
  order_id: string;
  /** 코인 심볼 */
  target_currency: string;
  /** 마켓 통화 */
  quote_currency: string;
  /** 주문 유형: "buy" | "sell" */
  type: 'buy' | 'sell';
  /** 주문 가격 */
  price: string;
  /** 주문 수량 */
  qty: string;
  /** 체결 수량 */
  executed_qty?: string;
  /** 주문 상태 */
  status: string;
  /** 주문 시각 (밀리초 타임스탬프) */
  timestamp: string;
}

// ===== 정규화 함수 =====

/**
 * 코인원 잔고 조회 응답을 정규화한다.
 *
 * 코인원 잔고 응답의 balances 배열을 NormalizedBalance 형태로 변환한다.
 * - KRW 잔고는 krwBalance로 분리하여 별도 관리한다.
 * - 수량이 0인 코인은 제외한다.
 * - available: 사용 가능 수량, limit: 잠김 수량
 *
 * @param rawResponse 코인원 잔고 조회 원본 응답
 * @returns 정규화된 잔고 데이터
 */
export function normalizeCoinoneBalance(rawResponse: unknown): NormalizedBalance {
  const response = rawResponse as CoinoneBalanceResponse;

  if (!response || response.result !== 'success' || !Array.isArray(response.balances)) {
    return {
      exchange: 'coinone',
      holdings: [],
      krwBalance: 0,
      timestamp: Date.now(),
    };
  }

  let krwBalance = 0;
  const holdings: Holding[] = [];

  for (const item of response.balances) {
    const available = parseFloat(item.available) || 0;
    const locked = parseFloat(item.limit) || 0;
    const totalBalance = available + locked;
    const symbol = (item.currency || '').toUpperCase();

    // KRW 잔고는 별도 관리
    if (symbol === 'KRW') {
      krwBalance = totalBalance;
      continue;
    }

    // 보유 수량이 0인 코인은 제외
    if (totalBalance <= 0) {
      continue;
    }

    const avgBuyPrice = parseFloat(item.average_price || '0') || 0;
    // 현재가는 잔고 응답만으로는 알 수 없으므로 매수 평균가를 기본값으로 사용
    const currentPrice = avgBuyPrice;
    const evaluationAmount = totalBalance * currentPrice;
    const investmentAmount = totalBalance * avgBuyPrice;
    const profitLoss = evaluationAmount - investmentAmount;
    const profitLossRate = investmentAmount > 0 ? (profitLoss / investmentAmount) * 100 : 0;

    holdings.push({
      exchange: 'coinone',
      symbol,
      currency: 'KRW',
      balance: available,
      lockedBalance: locked,
      avgBuyPrice,
      currentPrice,
      evaluationAmount,
      profitLoss,
      profitLossRate,
    });
  }

  return {
    exchange: 'coinone',
    holdings,
    krwBalance,
    timestamp: Date.now(),
  };
}

/**
 * 코인원 시세(Ticker) 조회 응답을 정규화한다.
 *
 * 코인원 시세 응답의 tickers 배열을 NormalizedTicker 형태로 변환한다.
 * - 변동률은 (현재가 - 전일 종가) / 전일 종가 * 100으로 계산한다.
 *
 * @param rawResponse 코인원 시세 조회 원본 응답
 * @returns 정규화된 시세 데이터
 */
export function normalizeCoinoneTicker(rawResponse: unknown): NormalizedTicker {
  const response = rawResponse as CoinoneTickerResponse;

  if (!response || response.result !== 'success' || !Array.isArray(response.tickers)) {
    return {
      exchange: 'coinone',
      tickers: [],
      timestamp: Date.now(),
    };
  }

  const tickers: Ticker[] = response.tickers.map((item) => {
    const currentPrice = parseFloat(item.last) || 0;
    const yesterdayLast = parseFloat(item.yesterday_last) || 0;
    const openPrice = parseFloat(item.first) || 0;

    // 변동률 계산: (현재가 - 전일 종가) / 전일 종가 * 100
    const changePrice = currentPrice - yesterdayLast;
    const changeRate = yesterdayLast > 0 ? (changePrice / yesterdayLast) * 100 : 0;

    return {
      exchange: 'coinone' as const,
      symbol: (item.target_currency || '').toUpperCase(),
      currentPrice,
      openPrice,
      highPrice: parseFloat(item.high) || 0,
      lowPrice: parseFloat(item.low) || 0,
      prevClosePrice: yesterdayLast,
      changeRate,
      changePrice,
      volume24h: parseFloat(item.target_volume) || 0,
      volumeAmount24h: parseFloat(item.quote_volume) || 0,
      timestamp: item.timestamp || Date.now(),
    };
  });

  return {
    exchange: 'coinone',
    tickers,
    timestamp: Date.now(),
  };
}

/**
 * 코인원 호가(Orderbook) 조회 응답을 정규화한다.
 *
 * 코인원 호가 응답을 NormalizedOrderbook 형태로 변환한다.
 * - asks(매도 호가)는 낮은 가격순으로 정렬한다.
 * - bids(매수 호가)는 높은 가격순으로 정렬한다.
 *
 * @param rawResponse 코인원 호가 조회 원본 응답
 * @returns 정규화된 호가 데이터
 */
export function normalizeCoinoneOrderbook(rawResponse: unknown): NormalizedOrderbook {
  const response = rawResponse as CoinoneOrderbookResponse;

  if (!response || response.result !== 'success') {
    return {
      exchange: 'coinone',
      orderbook: {
        exchange: 'coinone',
        symbol: '',
        asks: [],
        bids: [],
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    };
  }

  const asks: OrderbookEntry[] = (response.asks || [])
    .map((entry) => ({
      price: parseFloat(entry.price) || 0,
      quantity: parseFloat(entry.qty) || 0,
    }))
    .sort((a, b) => a.price - b.price); // 낮은 가격순

  const bids: OrderbookEntry[] = (response.bids || [])
    .map((entry) => ({
      price: parseFloat(entry.price) || 0,
      quantity: parseFloat(entry.qty) || 0,
    }))
    .sort((a, b) => b.price - a.price); // 높은 가격순

  return {
    exchange: 'coinone',
    orderbook: {
      exchange: 'coinone',
      symbol: (response.target_currency || '').toUpperCase(),
      asks,
      bids,
      timestamp: response.timestamp || Date.now(),
    },
    timestamp: Date.now(),
  };
}

/**
 * 코인원 주문 내역 조회 응답을 정규화한다.
 *
 * 코인원 주문 응답의 orders 배열을 NormalizedOrderHistory 형태로 변환한다.
 *
 * @param rawResponse 코인원 주문 내역 조회 원본 응답
 * @returns 정규화된 주문 내역 데이터
 */
export function normalizeCoinoneOrderHistory(rawResponse: unknown): NormalizedOrderHistory {
  const response = rawResponse as CoinoneOrderHistoryResponse;

  if (!response || response.result !== 'success' || !Array.isArray(response.orders)) {
    return {
      exchange: 'coinone',
      orders: [],
      timestamp: Date.now(),
    };
  }

  const orders: OrderHistoryItem[] = response.orders.map((item) => {
    const qty = parseFloat(item.qty) || 0;
    const executedQty = parseFloat(item.executed_qty || '0') || 0;

    return {
      orderId: item.order_id,
      symbol: (item.target_currency || '').toUpperCase(),
      currency: ((item.quote_currency || 'KRW').toUpperCase()) as 'KRW' | 'BTC' | 'USDT',
      side: item.type as 'buy' | 'sell',
      price: parseFloat(item.price) || 0,
      quantity: qty,
      executedQuantity: executedQty,
      status: mapCoinoneOrderStatus(item.status, qty, executedQty),
      orderedAt: new Date(parseInt(item.timestamp, 10) || Date.now()),
    };
  });

  return {
    exchange: 'coinone',
    orders,
    timestamp: Date.now(),
  };
}

/**
 * 코인원 주문 상태를 통일된 상태값으로 매핑한다.
 *
 * @param status 코인원 주문 상태 문자열
 * @param qty 주문 수량
 * @param executedQty 체결 수량
 * @returns 통일된 주문 상태
 */
function mapCoinoneOrderStatus(
  status: string,
  qty: number,
  executedQty: number,
): OrderHistoryItem['status'] {
  const normalizedStatus = status.toLowerCase();

  if (normalizedStatus === 'filled' || normalizedStatus === 'completed') {
    return 'filled';
  }
  if (normalizedStatus === 'cancelled' || normalizedStatus === 'canceled') {
    return 'cancelled';
  }
  // live/open 상태에서 일부 체결된 경우
  if (executedQty > 0 && executedQty < qty) {
    return 'partially_filled';
  }
  return 'open';
}
