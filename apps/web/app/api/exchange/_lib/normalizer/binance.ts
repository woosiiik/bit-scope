/**
 * 바이낸스 API 응답 정규화 모듈
 *
 * 바이낸스 거래소의 API 응답을 통일된 내부 데이터 모델로 변환한다.
 * 각 API 엔드포인트(잔고, 시세, 호가, 주문 내역)별로 정규화 함수를 제공한다.
 *
 * 바이낸스 API 응답 특성:
 * - 잔고 조회: { balances: [{ asset, free, locked }, ...] }
 * - 시세 조회 (24hr): 배열 또는 단일 { symbol, lastPrice, priceChangePercent, volume, ... }
 * - 호가 조회: { bids: [[price, qty], ...], asks: [[price, qty], ...] }
 * - 주문 내역: 배열 [{ orderId, symbol, side, price, origQty, executedQty, status, time, ... }]
 *
 * 바이낸스 잔고는 USDT 기준이므로 currency를 'USDT'로 설정한다.
 * KRW 환산은 대시보드에서 환율을 적용하여 처리한다.
 *
 * @see https://binance-docs.github.io/apidocs/spot/en/
 */

import type { Holding, Ticker, Orderbook, OrderbookEntry } from '@bitscope/shared';
import type {
  NormalizedBalance,
  NormalizedTicker,
  NormalizedOrderbook,
  NormalizedOrderHistory,
  OrderHistoryItem,
} from './types';

// ===== 바이낸스 API 원본 응답 타입 =====

/** 바이낸스 잔고 조회 응답 내 개별 자산 항목 */
export interface BinanceBalanceItem {
  asset: string;
  free: string;
  locked: string;
}

/** 바이낸스 잔고 조회 응답 (GET /api/v3/account) */
export interface BinanceAccountResponse {
  balances: BinanceBalanceItem[];
}

/** 바이낸스 24시간 시세 조회 응답 항목 (GET /api/v3/ticker/24hr) */
export interface BinanceTicker24hrItem {
  symbol: string;
  lastPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  prevClosePrice: string;
  priceChange: string;
  priceChangePercent: string;
  volume: string;
  quoteVolume: string;
  closeTime: number;
}

/** 바이낸스 호가 조회 응답 (GET /api/v3/depth) */
export interface BinanceDepthResponse {
  bids: [string, string][]; // [price, quantity]
  asks: [string, string][]; // [price, quantity]
}

/** 바이낸스 주문 내역 항목 (GET /api/v3/allOrders) */
export interface BinanceOrderItem {
  orderId: number;
  symbol: string;
  side: string;
  price: string;
  origQty: string;
  executedQty: string;
  status: string;
  time: number;
}

// ===== 정규화 함수 =====

/**
 * 바이낸스 잔고 조회 응답을 정규화한다.
 *
 * balances 배열에서 free + locked > 0 인 코인만 포함한다.
 * 바이낸스는 USDT 마켓이 기본이므로 currency를 'USDT'로 설정한다.
 * USDT 자체의 잔고는 KRW 잔고와 유사한 역할로 별도 처리한다.
 *
 * @param rawResponse 바이낸스 /api/v3/account API 원본 응답
 * @returns 정규화된 잔고 데이터
 */
export function normalizeBinanceBalance(rawResponse: unknown): NormalizedBalance {
  const response = rawResponse as BinanceAccountResponse;

  if (!response?.balances || !Array.isArray(response.balances)) {
    return {
      exchange: 'binance',
      holdings: [],
      krwBalance: 0,
      timestamp: Date.now(),
    };
  }

  let usdtBalance = 0;
  const holdings: Holding[] = [];

  for (const item of response.balances) {
    const free = parseFloat(item.free) || 0;
    const locked = parseFloat(item.locked) || 0;
    const totalBalance = free + locked;

    // 잔고가 0인 자산은 제외
    if (totalBalance <= 0) {
      continue;
    }

    // USDT는 기축통화이므로 별도 처리 (krwBalance와 유사한 역할)
    if (item.asset === 'USDT') {
      usdtBalance = totalBalance;
      continue;
    }

    // USDT 마켓의 코인으로 등록
    holdings.push({
      exchange: 'binance',
      symbol: item.asset,
      currency: 'USDT',
      balance: free,
      lockedBalance: locked,
      avgBuyPrice: 0, // 바이낸스 API는 매수 평균가를 제공하지 않음
      currentPrice: 0, // ticker API에서 별도 조회 필요
      evaluationAmount: 0, // 현재가 조회 후 계산
      profitLoss: 0,
      profitLossRate: 0,
    });
  }

  return {
    exchange: 'binance',
    holdings,
    krwBalance: usdtBalance, // USDT 잔고를 krwBalance 필드에 저장 (환산은 프론트에서 처리)
    timestamp: Date.now(),
  };
}

/**
 * 바이낸스 시세(Ticker) 조회 응답을 정규화한다.
 *
 * GET /api/v3/ticker/24hr 응답을 NormalizedTicker로 변환한다.
 * USDT 마켓 심볼(예: "BTCUSDT")에서 코인 심볼(예: "BTC")을 추출한다.
 *
 * @param rawResponse 바이낸스 ticker/24hr API 원본 응답
 * @returns 정규화된 시세 데이터
 */
export function normalizeBinanceTicker(rawResponse: unknown): NormalizedTicker {
  const items = Array.isArray(rawResponse) ? rawResponse : [rawResponse];

  const tickers: Ticker[] = [];

  for (const item of items as BinanceTicker24hrItem[]) {
    if (!item?.symbol) {
      continue;
    }

    // USDT 마켓 심볼만 처리 (예: "BTCUSDT" -> "BTC")
    if (!item.symbol.endsWith('USDT')) {
      continue;
    }

    const coinSymbol = item.symbol.replace('USDT', '');
    if (!coinSymbol) {
      continue;
    }

    const lastPrice = parseFloat(item.lastPrice) || 0;
    const openPrice = parseFloat(item.openPrice) || 0;
    const highPrice = parseFloat(item.highPrice) || 0;
    const lowPrice = parseFloat(item.lowPrice) || 0;
    const prevClosePrice = parseFloat(item.prevClosePrice) || 0;
    const priceChange = parseFloat(item.priceChange) || 0;
    const priceChangePercent = parseFloat(item.priceChangePercent) || 0;
    const volume = parseFloat(item.volume) || 0;
    const quoteVolume = parseFloat(item.quoteVolume) || 0;

    tickers.push({
      exchange: 'binance',
      symbol: coinSymbol,
      currentPrice: lastPrice,
      openPrice,
      highPrice,
      lowPrice,
      prevClosePrice,
      changeRate: priceChangePercent / 100, // 비율로 변환
      changePrice: priceChange,
      volume24h: volume,
      volumeAmount24h: quoteVolume, // USDT 기준 거래금액
      timestamp: item.closeTime || Date.now(),
    });
  }

  return {
    exchange: 'binance',
    tickers,
    timestamp: Date.now(),
  };
}

/**
 * 바이낸스 호가(Orderbook) 조회 응답을 정규화한다.
 *
 * @param rawResponse 바이낸스 /api/v3/depth API 원본 응답
 * @returns 정규화된 호가 데이터
 */
export function normalizeBinanceOrderbook(rawResponse: unknown): NormalizedOrderbook {
  const response = rawResponse as BinanceDepthResponse;

  const asks: OrderbookEntry[] = [];
  const bids: OrderbookEntry[] = [];

  if (response?.asks && Array.isArray(response.asks)) {
    for (const [price, quantity] of response.asks) {
      asks.push({
        price: parseFloat(price) || 0,
        quantity: parseFloat(quantity) || 0,
      });
    }
  }

  if (response?.bids && Array.isArray(response.bids)) {
    for (const [price, quantity] of response.bids) {
      bids.push({
        price: parseFloat(price) || 0,
        quantity: parseFloat(quantity) || 0,
      });
    }
  }

  return {
    exchange: 'binance',
    orderbook: {
      exchange: 'binance',
      symbol: '',
      asks,
      bids,
      timestamp: Date.now(),
    },
    timestamp: Date.now(),
  };
}

/**
 * 바이낸스 주문 내역 응답을 정규화한다.
 *
 * @param rawResponse 바이낸스 /api/v3/allOrders API 원본 응답
 * @returns 정규화된 주문 내역 데이터
 */
export function normalizeBinanceOrderHistory(rawResponse: unknown): NormalizedOrderHistory {
  const items = Array.isArray(rawResponse) ? rawResponse : [];

  const orders: OrderHistoryItem[] = [];

  for (const item of items as BinanceOrderItem[]) {
    if (!item?.orderId) {
      continue;
    }

    // 심볼에서 USDT 접미사 제거 (예: "BTCUSDT" -> "BTC")
    const symbol = item.symbol?.endsWith('USDT')
      ? item.symbol.replace('USDT', '')
      : item.symbol;

    // 바이낸스 주문 상태 매핑
    let status: OrderHistoryItem['status'];
    switch (item.status) {
      case 'NEW':
      case 'PARTIALLY_FILLED':
        status = item.status === 'NEW' ? 'open' : 'partially_filled';
        break;
      case 'FILLED':
        status = 'filled';
        break;
      case 'CANCELED':
      case 'REJECTED':
      case 'EXPIRED':
        status = 'cancelled';
        break;
      default:
        status = 'open';
    }

    orders.push({
      orderId: String(item.orderId),
      symbol,
      currency: 'USDT',
      side: item.side?.toLowerCase() === 'buy' ? 'buy' : 'sell',
      price: parseFloat(item.price) || 0,
      quantity: parseFloat(item.origQty) || 0,
      executedQuantity: parseFloat(item.executedQty) || 0,
      status,
      orderedAt: new Date(item.time),
    });
  }

  return {
    exchange: 'binance',
    orders,
    timestamp: Date.now(),
  };
}
