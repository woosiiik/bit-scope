/**
 * Gate.io API 응답 정규화 모듈
 *
 * Gate.io 거래소의 API v4 응답을 통일된 내부 데이터 모델로 변환한다.
 * 각 API 엔드포인트(잔고, 시세, 호가, 주문 내역)별로 정규화 함수를 제공한다.
 *
 * Gate.io API v4 응답 특성:
 * - 잔고 조회: 배열 직접 반환 (래핑 없음) [{ currency, available, locked }, ...]
 * - 시세 조회: 배열 직접 반환 [{ currency_pair, last, change_percentage, ... }]
 * - 호가 조회: { asks: [[price, amount], ...], bids: [[price, amount], ...] }
 * - 주문 내역: 배열 직접 반환
 *
 * Gate.io 잔고는 USDT 기준이므로 currency를 'USDT'로 설정한다.
 * KRW 환산은 대시보드에서 환율을 적용하여 처리한다.
 *
 * @see https://www.gate.io/docs/developers/apiv4/en/
 */

import type { Holding, Ticker, OrderbookEntry } from '@bitscope/shared';
import type {
  NormalizedBalance,
  NormalizedTicker,
  NormalizedOrderbook,
  NormalizedOrderHistory,
  OrderHistoryItem,
} from './types';

// ===== Gate.io API 원본 응답 타입 =====

/** Gate.io 잔고 조회 응답 항목 */
export interface GateBalanceItem {
  currency: string;
  available: string;
  locked: string;
}

/** Gate.io 시세 조회 응답 항목 */
export interface GateTickerItem {
  currency_pair: string;
  last: string;
  lowest_ask: string;
  highest_bid: string;
  change_percentage: string;
  base_volume: string;
  quote_volume: string;
  high_24h: string;
  low_24h: string;
}

/** Gate.io 호가 조회 응답 */
export interface GateOrderbookData {
  asks: [string, string][];
  bids: [string, string][];
}

/** Gate.io 주문 내역 항목 */
export interface GateOrderItem {
  id: string;
  currency_pair: string;
  side: string;
  price: string;
  amount: string;
  /** 체결된 quote currency 총액 (주의: 체결 수량이 아닌 체결 금액) */
  filled_total: string;
  /** 미체결 잔여 수량 */
  left: string;
  status: string;
  create_time: string;
}

// ===== 정규화 함수 =====

/**
 * Gate.io 잔고 조회 응답을 정규화한다.
 *
 * Gate.io는 배열을 직접 반환한다.
 * available > 0 인 코인만 포함한다.
 * USDT 자체의 잔고는 KRW 잔고와 유사한 역할로 별도 처리한다.
 *
 * @param rawResponse Gate.io /api/v4/spot/accounts API 원본 응답
 * @returns 정규화된 잔고 데이터
 */
export function normalizeGateBalance(rawResponse: unknown): NormalizedBalance {
  const items = rawResponse as GateBalanceItem[];

  if (!Array.isArray(items)) {
    return {
      exchange: 'gate',
      holdings: [],
      krwBalance: 0,
      timestamp: Date.now(),
    };
  }

  let usdtBalance = 0;
  const holdings: Holding[] = [];

  for (const item of items) {
    const available = parseFloat(item.available) || 0;
    const locked = parseFloat(item.locked) || 0;
    const totalBal = available + locked;

    // 잔고가 0인 자산은 제외
    if (totalBal <= 0) {
      continue;
    }

    const isStablecoin = ['USDT', 'USDC', 'DAI'].includes(item.currency);

    if (isStablecoin) {
      usdtBalance += totalBal;
    }

    holdings.push({
      exchange: 'gate',
      symbol: item.currency,
      currency: 'USDT',
      balance: available,
      lockedBalance: locked,
      avgBuyPrice: isStablecoin ? 1 : 0,
      currentPrice: isStablecoin ? 1 : 0,
      evaluationAmount: isStablecoin ? totalBal : 0,
      profitLoss: 0,
      profitLossRate: 0,
    });
  }

  return {
    exchange: 'gate',
    holdings,
    krwBalance: usdtBalance, // USDT 잔고를 krwBalance 필드에 저장 (환산은 프론트에서 처리)
    timestamp: Date.now(),
  };
}

/**
 * Gate.io 시세(Ticker) 조회 응답을 정규화한다.
 *
 * GET /api/v4/spot/tickers 응답을 NormalizedTicker로 변환한다.
 * Gate.io는 배열을 직접 반환한다.
 * USDT 마켓 심볼(예: "BTC_USDT")에서 코인 심볼(예: "BTC")을 추출한다.
 *
 * @param rawResponse Gate.io /api/v4/spot/tickers API 원본 응답
 * @returns 정규화된 시세 데이터
 */
export function normalizeGateTicker(rawResponse: unknown): NormalizedTicker {
  const items = rawResponse as GateTickerItem[];

  if (!Array.isArray(items)) {
    return {
      exchange: 'gate',
      tickers: [],
      timestamp: Date.now(),
    };
  }

  const tickers: Ticker[] = [];

  for (const item of items) {
    if (!item?.currency_pair) {
      continue;
    }

    // USDT 마켓 심볼만 처리 (예: "BTC_USDT" -> "BTC")
    if (!item.currency_pair.endsWith('_USDT')) {
      continue;
    }

    const coinSymbol = item.currency_pair.replace('_USDT', '');
    if (!coinSymbol) {
      continue;
    }

    const lastPrice = parseFloat(item.last) || 0;
    const highPrice = parseFloat(item.high_24h) || 0;
    const lowPrice = parseFloat(item.low_24h) || 0;
    const changePercentage = parseFloat(item.change_percentage) || 0;
    const baseVolume = parseFloat(item.base_volume) || 0;
    const quoteVolume = parseFloat(item.quote_volume) || 0;

    // changeRate는 %(예: 2.5 = 2.5%)로 통일. Gate.io의 change_percentage는 이미 %
    const changeRate = changePercentage;
    const changeRateDecimal = changePercentage / 100;
    // 변동률에서 open price를 역산
    const openPrice = changeRateDecimal !== -1 ? lastPrice / (1 + changeRateDecimal) : lastPrice;
    const priceChange = lastPrice - openPrice;

    tickers.push({
      exchange: 'gate',
      symbol: coinSymbol,
      currentPrice: lastPrice,
      openPrice,
      highPrice,
      lowPrice,
      prevClosePrice: openPrice, // Gate.io는 prevClose를 직접 제공하지 않으므로 open 사용
      changeRate,
      changePrice: priceChange,
      volume24h: baseVolume,
      volumeAmount24h: quoteVolume, // USDT 기준 거래금액
      timestamp: Date.now(),
    });
  }

  return {
    exchange: 'gate',
    tickers,
    timestamp: Date.now(),
  };
}

/**
 * Gate.io 호가(Orderbook) 조회 응답을 정규화한다.
 *
 * @param rawResponse Gate.io /api/v4/spot/order_book API 원본 응답
 * @returns 정규화된 호가 데이터
 */
export function normalizeGateOrderbook(rawResponse: unknown): NormalizedOrderbook {
  const response = rawResponse as GateOrderbookData;

  const asks: OrderbookEntry[] = [];
  const bids: OrderbookEntry[] = [];

  if (response?.asks && Array.isArray(response.asks)) {
    for (const entry of response.asks) {
      asks.push({
        price: parseFloat(entry[0]) || 0,
        quantity: parseFloat(entry[1]) || 0,
      });
    }
  }

  if (response?.bids && Array.isArray(response.bids)) {
    for (const entry of response.bids) {
      bids.push({
        price: parseFloat(entry[0]) || 0,
        quantity: parseFloat(entry[1]) || 0,
      });
    }
  }

  return {
    exchange: 'gate',
    orderbook: {
      exchange: 'gate',
      symbol: '',
      asks,
      bids,
      timestamp: Date.now(),
    },
    timestamp: Date.now(),
  };
}

/**
 * Gate.io 주문 내역 응답을 정규화한다.
 *
 * @param rawResponse Gate.io /api/v4/spot/orders API 원본 응답
 * @returns 정규화된 주문 내역 데이터
 */
export function normalizeGateOrderHistory(rawResponse: unknown): NormalizedOrderHistory {
  const items = rawResponse as GateOrderItem[];

  if (!Array.isArray(items)) {
    return {
      exchange: 'gate',
      orders: [],
      timestamp: Date.now(),
    };
  }

  const orders: OrderHistoryItem[] = [];

  for (const item of items) {
    if (!item?.id) {
      continue;
    }

    // 심볼에서 "_USDT" 접미사 제거 (예: "BTC_USDT" -> "BTC")
    const symbol = item.currency_pair?.endsWith('_USDT')
      ? item.currency_pair.replace('_USDT', '')
      : item.currency_pair;

    // Gate.io 주문 상태 매핑
    let status: OrderHistoryItem['status'];
    switch (item.status) {
      case 'open':
        status = 'open';
        break;
      case 'closed':
        status = 'filled';
        break;
      case 'cancelled':
        status = 'cancelled';
        break;
      default:
        status = 'open';
    }

    // Gate.io의 filled_total은 체결 금액(quote currency)이므로 체결 수량이 아님
    // 체결 수량 = 주문 수량(amount) - 미체결 수량(left)
    const orderAmount = parseFloat(item.amount) || 0;
    const leftAmount = parseFloat(item.left) || 0;
    const executedQuantity = orderAmount - leftAmount;

    orders.push({
      orderId: item.id,
      symbol,
      currency: 'USDT',
      side: item.side?.toLowerCase() === 'buy' ? 'buy' : 'sell',
      price: parseFloat(item.price) || 0,
      quantity: orderAmount,
      executedQuantity: executedQuantity > 0 ? executedQuantity : 0,
      status,
      orderedAt: new Date(parseInt(item.create_time, 10) * 1000 || Date.now()),
    });
  }

  return {
    exchange: 'gate',
    orders,
    timestamp: Date.now(),
  };
}
