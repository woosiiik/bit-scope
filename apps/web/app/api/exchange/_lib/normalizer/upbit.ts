/**
 * 업비트 API 응답 정규화 모듈
 *
 * 업비트 거래소의 API 응답을 통일된 내부 데이터 모델로 변환한다.
 * 각 API 엔드포인트(잔고, 시세, 호가, 주문 내역)별로 정규화 함수를 제공한다.
 *
 * 업비트 API 응답 특성:
 * - 잔고 조회: 배열 형태, 코인별 { currency, balance, locked, avg_buy_price, ... }
 * - 시세 조회: 배열 형태, { market: "KRW-BTC", trade_price, change_rate, ... }
 * - 호가 조회: 배열 형태, { market, orderbook_units: [{ ask_price, bid_price, ... }] }
 * - 주문 내역: 배열 형태, { uuid, side, ord_type, price, volume, ... }
 *
 * @see 요구사항 12.4 (응답 데이터 통일된 내부 데이터 모델 정규화)
 * @see https://docs.upbit.com/reference
 */

import type { Holding, Ticker, OrderbookEntry } from '@bitscope/shared';
import type {
  NormalizedBalance,
  NormalizedTicker,
  NormalizedOrderbook,
  NormalizedOrderHistory,
  OrderHistoryItem,
} from './types';

// ===== 업비트 API 원본 응답 타입 =====

/** 업비트 잔고 조회 응답 항목 */
export interface UpbitAccountItem {
  currency: string;
  balance: string;
  locked: string;
  avg_buy_price: string;
  avg_buy_price_modified: boolean;
  unit_currency: string;
}

/** 업비트 시세(Ticker) 조회 응답 항목 */
export interface UpbitTickerItem {
  market: string;
  trade_date: string;
  trade_time: string;
  trade_date_kst: string;
  trade_time_kst: string;
  trade_timestamp: number;
  opening_price: number;
  high_price: number;
  low_price: number;
  trade_price: number;
  prev_closing_price: number;
  change: 'RISE' | 'EVEN' | 'FALL';
  change_price: number;
  change_rate: number;
  signed_change_price: number;
  signed_change_rate: number;
  trade_volume: number;
  acc_trade_price: number;
  acc_trade_price_24h: number;
  acc_trade_volume: number;
  acc_trade_volume_24h: number;
  highest_52_week_price: number;
  highest_52_week_date: string;
  lowest_52_week_price: number;
  lowest_52_week_date: string;
  timestamp: number;
}

/** 업비트 호가(Orderbook) 조회 응답 항목 */
export interface UpbitOrderbookItem {
  market: string;
  timestamp: number;
  total_ask_size: number;
  total_bid_size: number;
  orderbook_units: {
    ask_price: number;
    bid_price: number;
    ask_size: number;
    bid_size: number;
  }[];
}

/** 업비트 주문 내역 조회 응답 항목 */
export interface UpbitOrderItem {
  uuid: string;
  side: 'bid' | 'ask';
  ord_type: 'limit' | 'price' | 'market' | 'best';
  price: string | null;
  state: 'wait' | 'watch' | 'done' | 'cancel';
  market: string;
  created_at: string;
  volume: string | null;
  remaining_volume: string | null;
  reserved_fee: string;
  remaining_fee: string;
  paid_fee: string;
  locked: string;
  executed_volume: string;
  trades_count: number;
}

// ===== 정규화 함수 =====

/**
 * 업비트 마켓 코드에서 코인 심볼을 추출한다.
 *
 * 업비트 마켓 코드 형식: "{마켓통화}-{코인심볼}" (예: "KRW-BTC")
 *
 * @param market 업비트 마켓 코드 (예: "KRW-BTC")
 * @returns 코인 심볼 (예: "BTC")
 */
export function extractSymbolFromMarket(market: string): string {
  const parts = market.split('-');
  return parts.length >= 2 ? (parts[1] ?? market) : market;
}

/**
 * 업비트 마켓 코드에서 마켓 통화를 추출한다.
 *
 * @param market 업비트 마켓 코드 (예: "KRW-BTC")
 * @returns 마켓 통화 (예: "KRW")
 */
export function extractCurrencyFromMarket(market: string): 'KRW' | 'BTC' | 'USDT' {
  const parts = market.split('-');
  const currency = parts[0];
  if (currency === 'KRW' || currency === 'BTC' || currency === 'USDT') {
    return currency;
  }
  return 'KRW';
}

/**
 * 업비트 잔고 조회 응답을 정규화한다.
 *
 * 업비트 잔고 응답 배열을 NormalizedBalance 형태로 변환한다.
 * - KRW 잔고는 krwBalance로 분리하여 별도 관리한다.
 * - 수량이 0인 코인은 제외한다.
 * - 매수 평균가 기반 수익률을 계산한다.
 *
 * 주의: 업비트 잔고 응답에는 현재가가 포함되지 않으므로,
 * currentPrice, evaluationAmount, profitLoss, profitLossRate는
 * 별도의 시세 데이터와 결합하여 계산해야 한다.
 * 이 함수에서는 avgBuyPrice를 currentPrice 기본값으로 사용한다.
 *
 * @param rawResponse 업비트 잔고 조회 원본 응답
 * @returns 정규화된 잔고 데이터
 */
export function normalizeUpbitBalance(rawResponse: unknown): NormalizedBalance {
  const items = rawResponse as UpbitAccountItem[];

  if (!Array.isArray(items)) {
    return {
      exchange: 'upbit',
      holdings: [],
      krwBalance: 0,
      timestamp: Date.now(),
    };
  }

  let krwBalance = 0;
  const holdings: Holding[] = [];

  for (const item of items) {
    const balance = parseFloat(item.balance) || 0;
    const locked = parseFloat(item.locked) || 0;
    const avgBuyPrice = parseFloat(item.avg_buy_price) || 0;
    const totalBalance = balance + locked;

    // KRW 잔고는 별도 관리
    if (item.currency === 'KRW') {
      krwBalance = totalBalance;
      continue;
    }

    // 보유 수량이 0인 코인은 제외
    if (totalBalance <= 0) {
      continue;
    }

    // 현재가는 잔고 응답에 포함되지 않으므로 매수 평균가를 기본값으로 사용
    // 이후 시세 데이터와 결합하여 갱신해야 한다
    const currentPrice = avgBuyPrice;
    const evaluationAmount = totalBalance * currentPrice;
    const investmentAmount = totalBalance * avgBuyPrice;
    const profitLoss = evaluationAmount - investmentAmount;
    const profitLossRate = investmentAmount > 0 ? (profitLoss / investmentAmount) * 100 : 0;

    holdings.push({
      exchange: 'upbit',
      symbol: item.currency,
      currency: (item.unit_currency || 'KRW') as 'KRW' | 'BTC' | 'USDT',
      balance,
      lockedBalance: locked,
      avgBuyPrice,
      currentPrice,
      evaluationAmount,
      profitLoss,
      profitLossRate,
    });
  }

  return {
    exchange: 'upbit',
    holdings,
    krwBalance,
    timestamp: Date.now(),
  };
}

/**
 * 업비트 시세(Ticker) 조회 응답을 정규화한다.
 *
 * 업비트 시세 응답 배열을 NormalizedTicker 형태로 변환한다.
 * - signed_change_rate를 백분율(%)로 변환한다.
 * - 마켓 코드에서 코인 심볼을 추출한다.
 *
 * @param rawResponse 업비트 시세 조회 원본 응답
 * @returns 정규화된 시세 데이터
 */
export function normalizeUpbitTicker(rawResponse: unknown): NormalizedTicker {
  const items = rawResponse as UpbitTickerItem[];

  if (!Array.isArray(items)) {
    return {
      exchange: 'upbit',
      tickers: [],
      timestamp: Date.now(),
    };
  }

  const tickers: Ticker[] = items.map((item) => ({
    exchange: 'upbit' as const,
    symbol: extractSymbolFromMarket(item.market),
    currentPrice: item.trade_price,
    openPrice: item.opening_price,
    highPrice: item.high_price,
    lowPrice: item.low_price,
    prevClosePrice: item.prev_closing_price,
    // signed_change_rate는 소수(예: 0.05 = 5%)로 제공되므로 100을 곱하여 %로 변환
    changeRate: item.signed_change_rate * 100,
    changePrice: item.signed_change_price,
    volume24h: item.acc_trade_volume_24h,
    volumeAmount24h: item.acc_trade_price_24h,
    timestamp: item.timestamp,
  }));

  return {
    exchange: 'upbit',
    tickers,
    timestamp: Date.now(),
  };
}

/**
 * 업비트 호가(Orderbook) 조회 응답을 정규화한다.
 *
 * 업비트 호가 응답을 NormalizedOrderbook 형태로 변환한다.
 * - asks(매도 호가)는 낮은 가격순으로 정렬한다.
 * - bids(매수 호가)는 높은 가격순으로 정렬한다.
 *
 * @param rawResponse 업비트 호가 조회 원본 응답
 * @returns 정규화된 호가 데이터
 */
export function normalizeUpbitOrderbook(rawResponse: unknown): NormalizedOrderbook {
  const items = rawResponse as UpbitOrderbookItem[];
  const item = Array.isArray(items) ? items[0] : undefined;

  if (!item || !item.orderbook_units) {
    return {
      exchange: 'upbit',
      orderbook: {
        exchange: 'upbit',
        symbol: '',
        asks: [],
        bids: [],
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    };
  }

  const asks: OrderbookEntry[] = item.orderbook_units
    .map((unit) => ({
      price: unit.ask_price,
      quantity: unit.ask_size,
    }))
    .sort((a, b) => a.price - b.price); // 낮은 가격순

  const bids: OrderbookEntry[] = item.orderbook_units
    .map((unit) => ({
      price: unit.bid_price,
      quantity: unit.bid_size,
    }))
    .sort((a, b) => b.price - a.price); // 높은 가격순

  return {
    exchange: 'upbit',
    orderbook: {
      exchange: 'upbit',
      symbol: extractSymbolFromMarket(item.market),
      asks,
      bids,
      timestamp: item.timestamp,
    },
    timestamp: Date.now(),
  };
}

/**
 * 업비트 주문 내역 조회 응답을 정규화한다.
 *
 * 업비트 주문 응답 배열을 NormalizedOrderHistory 형태로 변환한다.
 * - bid -> buy, ask -> sell로 매핑한다.
 * - 주문 상태를 통일된 상태값으로 변환한다.
 *
 * @param rawResponse 업비트 주문 내역 조회 원본 응답
 * @returns 정규화된 주문 내역 데이터
 */
export function normalizeUpbitOrderHistory(rawResponse: unknown): NormalizedOrderHistory {
  const items = rawResponse as UpbitOrderItem[];

  if (!Array.isArray(items)) {
    return {
      exchange: 'upbit',
      orders: [],
      timestamp: Date.now(),
    };
  }

  const orders: OrderHistoryItem[] = items.map((item) => {
    const volume = parseFloat(item.volume || '0') || 0;
    const executedVolume = parseFloat(item.executed_volume || '0') || 0;

    return {
      orderId: item.uuid,
      symbol: extractSymbolFromMarket(item.market),
      currency: extractCurrencyFromMarket(item.market),
      side: item.side === 'bid' ? ('buy' as const) : ('sell' as const),
      price: parseFloat(item.price || '0') || 0,
      quantity: volume,
      executedQuantity: executedVolume,
      status: mapUpbitOrderState(item.state, volume, executedVolume),
      orderedAt: new Date(item.created_at),
    };
  });

  return {
    exchange: 'upbit',
    orders,
    timestamp: Date.now(),
  };
}

/**
 * 업비트 주문 상태를 통일된 상태값으로 매핑한다.
 *
 * @param state 업비트 주문 상태
 * @param volume 주문 수량
 * @param executedVolume 체결 수량
 * @returns 통일된 주문 상태
 */
function mapUpbitOrderState(
  state: string,
  volume: number,
  executedVolume: number,
): OrderHistoryItem['status'] {
  switch (state) {
    case 'wait':
    case 'watch':
      if (executedVolume > 0 && executedVolume < volume) {
        return 'partially_filled';
      }
      return 'open';
    case 'done':
      return 'filled';
    case 'cancel':
      return 'cancelled';
    default:
      return 'open';
  }
}
