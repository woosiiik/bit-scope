/**
 * Bitget API 응답 정규화 모듈
 *
 * Bitget 거래소의 API v2 응답을 통일된 내부 데이터 모델로 변환한다.
 * 각 API 엔드포인트(잔고, 시세, 호가, 주문 내역)별로 정규화 함수를 제공한다.
 *
 * Bitget API v2 응답 특성:
 * - 공통 구조: { code: "00000", msg: "success", data: [...] }
 * - code !== "00000"이면 에러
 * - 잔고 조회: data 배열 [{ coin, available, frozen, usdtValue }]
 * - 시세 조회: data 배열 [{ symbol, lastPr, change24h, ... }]
 * - 호가 조회: data.asks, data.bids
 * - 주문 내역: data 배열
 *
 * Bitget 잔고는 USDT 기준이므로 currency를 'USDT'로 설정한다.
 * KRW 환산은 대시보드에서 환율을 적용하여 처리한다.
 *
 * @see https://www.bitget.com/api-doc/spot/intro
 */

import type { Holding, Ticker, OrderbookEntry } from '@bitscope/shared';
import type {
  NormalizedBalance,
  NormalizedTicker,
  NormalizedOrderbook,
  NormalizedOrderHistory,
  OrderHistoryItem,
  WalletSummary,
} from './types';

// ===== Bitget API 원본 응답 타입 =====

/** Bitget API v2 공통 응답 래퍼 */
export interface BitgetApiResponse<T> {
  code: string;
  msg: string;
  data: T;
}

/** Bitget 잔고 조회 응답 항목 */
export interface BitgetBalanceItem {
  coin: string;
  available: string;
  frozen: string;
  usdtValue: string;
}

/** Bitget 시세 조회 응답 항목 */
export interface BitgetTickerItem {
  symbol: string;
  lastPr: string;
  high24h: string;
  low24h: string;
  open: string;
  change24h: string;
  baseVolume: string;
  quoteVolume: string;
}

/** Bitget 호가 조회 응답 */
export interface BitgetOrderbookData {
  asks: [string, string][];
  bids: [string, string][];
}

/** Bitget 주문 내역 항목 */
export interface BitgetOrderItem {
  orderId: string;
  symbol: string;
  side: string;
  price: string;
  size: string;
  filledQty: string;
  status: string;
  cTime: string;
}

/** Bitget Futures 계좌 항목 (GET /api/v2/mix/account/accounts) */
export interface BitgetFuturesAccountItem {
  marginCoin: string;
  accountEquity: string;
  available: string;
  crossedUnrealizedPL: string;
}

// ===== 정규화 함수 =====

/**
 * Bitget 잔고 조회 응답을 정규화한다.
 *
 * data 배열에서 available > 0 인 코인만 포함한다.
 * Bitget은 USDT 마켓이 기본이므로 currency를 'USDT'로 설정한다.
 * USDT 자체의 잔고는 KRW 잔고와 유사한 역할로 별도 처리한다.
 *
 * @param rawResponse Bitget /api/v2/spot/account/assets API 원본 응답
 * @returns 정규화된 잔고 데이터
 */
export function normalizeBitgetBalance(rawResponse: unknown): NormalizedBalance {
  const response = rawResponse as BitgetApiResponse<BitgetBalanceItem[]>;

  // code !== "00000" 이면 에러 응답
  if (response?.code !== undefined && response.code !== '00000') {
    return {
      exchange: 'bitget',
      holdings: [],
      krwBalance: 0,
      timestamp: Date.now(),
    };
  }

  if (!response?.data || !Array.isArray(response.data)) {
    return {
      exchange: 'bitget',
      holdings: [],
      krwBalance: 0,
      timestamp: Date.now(),
    };
  }

  let usdtBalance = 0;
  const holdings: Holding[] = [];

  for (const item of response.data) {
    const available = parseFloat(item.available) || 0;
    const frozen = parseFloat(item.frozen) || 0;
    const totalBal = available + frozen;

    // 잔고가 0인 자산은 제외
    if (totalBal <= 0) {
      continue;
    }

    const isStablecoin = ['USDT', 'USDC', 'DAI'].includes(item.coin);

    if (isStablecoin) {
      usdtBalance += totalBal;
    }

    holdings.push({
      exchange: 'bitget',
      symbol: item.coin,
      currency: 'USDT',
      balance: available,
      lockedBalance: frozen,
      avgBuyPrice: isStablecoin ? 1 : 0,
      currentPrice: isStablecoin ? 1 : 0,
      evaluationAmount: isStablecoin ? totalBal : 0,
      profitLoss: 0,
      profitLossRate: 0,
    });
  }

  // Bitget Spot 합계를 walletSummary로 제공
  // Futures/Margin은 별도 API가 필요하므로 1차에서는 Spot만 표시
  const spotTotalUsdt = holdings.reduce((sum, h) => sum + h.evaluationAmount, 0);

  const walletSummary: WalletSummary = {
    totalEquityUsdt: spotTotalUsdt,
    wallets: [
      { name: 'Spot', balanceUsdt: spotTotalUsdt },
    ],
  };

  return {
    exchange: 'bitget',
    holdings,
    krwBalance: usdtBalance, // USDT 잔고를 krwBalance 필드에 저장 (환산은 프론트에서 처리)
    timestamp: Date.now(),
    walletSummary,
  };
}

/**
 * Bitget 시세(Ticker) 조회 응답을 정규화한다.
 *
 * GET /api/v2/spot/market/tickers 응답을 NormalizedTicker로 변환한다.
 * USDT 마켓 심볼(예: "BTCUSDT")에서 코인 심볼(예: "BTC")을 추출한다.
 *
 * @param rawResponse Bitget /api/v2/spot/market/tickers API 원본 응답
 * @returns 정규화된 시세 데이터
 */
export function normalizeBitgetTicker(rawResponse: unknown): NormalizedTicker {
  const response = rawResponse as BitgetApiResponse<BitgetTickerItem[]>;

  // code !== "00000" 이면 에러 응답
  if (response?.code !== undefined && response.code !== '00000') {
    return {
      exchange: 'bitget',
      tickers: [],
      timestamp: Date.now(),
    };
  }

  if (!response?.data || !Array.isArray(response.data)) {
    return {
      exchange: 'bitget',
      tickers: [],
      timestamp: Date.now(),
    };
  }

  const tickers: Ticker[] = [];

  for (const item of response.data) {
    if (!item?.symbol) {
      continue;
    }

    // USDT 마켓 심볼만 처리 (예: "BTCUSDT" -> "BTC")
    if (!item.symbol.endsWith('USDT')) {
      continue;
    }

    // 접미사 'USDT'(4글자)를 안전하게 제거
    const coinSymbol = item.symbol.slice(0, -4);
    if (!coinSymbol) {
      continue;
    }

    const lastPrice = parseFloat(item.lastPr) || 0;
    const highPrice = parseFloat(item.high24h) || 0;
    const lowPrice = parseFloat(item.low24h) || 0;
    const openPrice = parseFloat(item.open) || 0;
    const change24h = parseFloat(item.change24h) || 0;
    const baseVolume = parseFloat(item.baseVolume) || 0;
    const quoteVolume = parseFloat(item.quoteVolume) || 0;

    const priceChange = lastPrice - openPrice;

    tickers.push({
      exchange: 'bitget',
      symbol: coinSymbol,
      currentPrice: lastPrice,
      openPrice,
      highPrice,
      lowPrice,
      prevClosePrice: openPrice, // Bitget는 prevClose를 직접 제공하지 않으므로 open 사용
      changeRate: change24h * 100, // Bitget는 소수(0.025 = 2.5%)로 제공하므로 %로 변환
      changePrice: priceChange,
      volume24h: baseVolume,
      volumeAmount24h: quoteVolume, // USDT 기준 거래금액
      timestamp: Date.now(),
    });
  }

  return {
    exchange: 'bitget',
    tickers,
    timestamp: Date.now(),
  };
}

/**
 * Bitget 호가(Orderbook) 조회 응답을 정규화한다.
 *
 * @param rawResponse Bitget /api/v2/spot/market/orderbook API 원본 응답
 * @returns 정규화된 호가 데이터
 */
export function normalizeBitgetOrderbook(rawResponse: unknown): NormalizedOrderbook {
  const response = rawResponse as BitgetApiResponse<BitgetOrderbookData>;

  // code !== "00000" 이면 에러 응답
  if (response?.code !== undefined && response.code !== '00000') {
    return {
      exchange: 'bitget',
      orderbook: {
        exchange: 'bitget',
        symbol: '',
        asks: [],
        bids: [],
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    };
  }

  const asks: OrderbookEntry[] = [];
  const bids: OrderbookEntry[] = [];

  if (response?.data?.asks && Array.isArray(response.data.asks)) {
    for (const entry of response.data.asks) {
      asks.push({
        price: parseFloat(entry[0]) || 0,
        quantity: parseFloat(entry[1]) || 0,
      });
    }
  }

  if (response?.data?.bids && Array.isArray(response.data.bids)) {
    for (const entry of response.data.bids) {
      bids.push({
        price: parseFloat(entry[0]) || 0,
        quantity: parseFloat(entry[1]) || 0,
      });
    }
  }

  return {
    exchange: 'bitget',
    orderbook: {
      exchange: 'bitget',
      symbol: '',
      asks,
      bids,
      timestamp: Date.now(),
    },
    timestamp: Date.now(),
  };
}

/**
 * Bitget 주문 내역 응답을 정규화한다.
 *
 * @param rawResponse Bitget /api/v2/spot/trade/history-orders API 원본 응답
 * @returns 정규화된 주문 내역 데이터
 */
export function normalizeBitgetOrderHistory(rawResponse: unknown): NormalizedOrderHistory {
  const response = rawResponse as BitgetApiResponse<BitgetOrderItem[]>;

  // code !== "00000" 이면 에러 응답
  if (response?.code !== undefined && response.code !== '00000') {
    return {
      exchange: 'bitget',
      orders: [],
      timestamp: Date.now(),
    };
  }

  if (!response?.data || !Array.isArray(response.data)) {
    return {
      exchange: 'bitget',
      orders: [],
      timestamp: Date.now(),
    };
  }

  const orders: OrderHistoryItem[] = [];

  for (const item of response.data) {
    if (!item?.orderId) {
      continue;
    }

    // 심볼에서 "USDT" 접미사 제거 (예: "BTCUSDT" -> "BTC")
    const symbol = item.symbol?.endsWith('USDT')
      ? item.symbol.slice(0, -4)
      : item.symbol;

    // Bitget 주문 상태 매핑
    let status: OrderHistoryItem['status'];
    switch (item.status) {
      case 'new':
      case 'partial_fill':
        status = item.status === 'new' ? 'open' : 'partially_filled';
        break;
      case 'full_fill':
        status = 'filled';
        break;
      case 'cancelled':
        status = 'cancelled';
        break;
      default:
        status = 'open';
    }

    orders.push({
      orderId: item.orderId,
      symbol,
      currency: 'USDT',
      side: item.side?.toLowerCase() === 'buy' ? 'buy' : 'sell',
      price: parseFloat(item.price) || 0,
      quantity: parseFloat(item.size) || 0,
      executedQuantity: parseFloat(item.filledQty) || 0,
      status,
      orderedAt: new Date(parseInt(item.cTime, 10) || Date.now()),
    });
  }

  return {
    exchange: 'bitget',
    orders,
    timestamp: Date.now(),
  };
}

/**
 * Bitget Futures 계좌 응답에서 accountEquity 값을 추출한다.
 *
 * GET /api/v2/mix/account/accounts?productType=USDT-FUTURES 응답은
 * { code: "00000", data: [{ marginCoin: "USDT", accountEquity: "3000", ... }] } 형태이다.
 * data[0].accountEquity가 Futures 계좌의 전체 USDT 잔고이다.
 *
 * @param rawResponse Bitget /api/v2/mix/account/accounts API 원본 응답
 * @returns Futures 총 잔고 (USDT)
 */
export function normalizeBitgetFuturesBalance(rawResponse: unknown): number {
  const response = rawResponse as BitgetApiResponse<BitgetFuturesAccountItem[]>;

  // code !== "00000" 이면 에러 응답
  if (response?.code !== undefined && response.code !== '00000') {
    return 0;
  }

  if (!response?.data || !Array.isArray(response.data) || response.data.length === 0) {
    return 0;
  }

  // 첫 번째 항목의 accountEquity가 Futures 전체 자산 (USDT)
  const firstItem = response.data[0];
  if (!firstItem) {
    return 0;
  }

  return parseFloat(firstItem.accountEquity) || 0;
}
