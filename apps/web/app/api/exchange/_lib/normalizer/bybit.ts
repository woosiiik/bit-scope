/**
 * 바이빗 API 응답 정규화 모듈
 *
 * 바이빗 거래소의 API v5 응답을 통일된 내부 데이터 모델로 변환한다.
 * 각 API 엔드포인트(잔고, 시세, 호가, 주문 내역)별로 정규화 함수를 제공한다.
 *
 * 바이빗 API v5 응답 특성:
 * - 공통 구조: { retCode: 0, retMsg: "OK", result: { ... } }
 * - 잔고 조회: result.list[0].coin 배열
 * - 시세 조회: result.list 배열 [{ symbol, lastPrice, ... }]
 * - 호가 조회: result.b (bids), result.a (asks)
 * - 주문 내역: result.list 배열
 *
 * 바이빗 잔고는 USDT 기준이므로 currency를 'USDT'로 설정한다.
 * KRW 환산은 대시보드에서 환율을 적용하여 처리한다.
 *
 * @see https://bybit-exchange.github.io/docs/v5/intro
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

// ===== 바이빗 API 원본 응답 타입 =====

/** 바이빗 API v5 공통 응답 래퍼 */
export interface BybitApiResponse<T> {
  retCode: number;
  retMsg: string;
  result: T;
}

/** 바이빗 잔고 조회 응답 내 개별 코인 항목 */
export interface BybitCoinItem {
  coin: string;
  walletBalance: string;
  locked: string;
  equity: string;
  usdValue: string;
}

/** 바이빗 잔고 조회 응답 내 계좌 항목 */
export interface BybitAccountItem {
  accountType: string;
  totalEquity: string;
  totalWalletBalance: string;
  coin: BybitCoinItem[];
}

/** 바이빗 잔고 조회 result */
export interface BybitWalletBalanceResult {
  list: BybitAccountItem[];
}

/** 바이빗 시세 조회 응답 항목 */
export interface BybitTickerItem {
  symbol: string;
  lastPrice: string;
  highPrice24h: string;
  lowPrice24h: string;
  prevPrice24h: string;
  price24hPcnt: string;
  volume24h: string;
  turnover24h: string;
}

/** 바이빗 시세 조회 result */
export interface BybitTickerResult {
  list: BybitTickerItem[];
}

/** 바이빗 호가 조회 result */
export interface BybitOrderbookResult {
  /** bids: [[price, quantity], ...] */
  b: [string, string][];
  /** asks: [[price, quantity], ...] */
  a: [string, string][];
}

/** 바이빗 주문 내역 항목 */
export interface BybitOrderItem {
  orderId: string;
  symbol: string;
  side: string;
  price: string;
  qty: string;
  cumExecQty: string;
  orderStatus: string;
  createdTime: string;
}

/** 바이빗 주문 내역 result */
export interface BybitOrderHistoryResult {
  list: BybitOrderItem[];
}

// ===== 정규화 함수 =====

/**
 * 바이빗 잔고 조회 응답을 정규화한다.
 *
 * result.list[0].coin 배열에서 walletBalance > 0 인 코인만 포함한다.
 * 바이빗은 USDT 마켓이 기본이므로 currency를 'USDT'로 설정한다.
 * USDT 자체의 잔고는 KRW 잔고와 유사한 역할로 별도 처리한다.
 *
 * @param rawResponse 바이빗 /v5/account/wallet-balance API 원본 응답
 * @returns 정규화된 잔고 데이터
 */
export function normalizeBybitBalance(rawResponse: unknown): NormalizedBalance {
  const response = rawResponse as BybitApiResponse<BybitWalletBalanceResult>;

  // retCode !== 0 이면 에러 응답이므로 빈 결과 반환
  if (response?.retCode !== undefined && response.retCode !== 0) {
    return {
      exchange: 'bybit',
      holdings: [],
      krwBalance: 0,
      timestamp: Date.now(),
    };
  }

  if (
    !response?.result?.list ||
    !Array.isArray(response.result.list) ||
    response.result.list.length === 0
  ) {
    return {
      exchange: 'bybit',
      holdings: [],
      krwBalance: 0,
      timestamp: Date.now(),
    };
  }

  const account = response.result.list[0];
  if (!account?.coin || !Array.isArray(account.coin)) {
    return {
      exchange: 'bybit',
      holdings: [],
      krwBalance: 0,
      timestamp: Date.now(),
    };
  }

  let usdtBalance = 0;
  const holdings: Holding[] = [];

  for (const item of account.coin) {
    const walletBalance = parseFloat(item.walletBalance) || 0;
    const locked = parseFloat(item.locked) || 0;

    // 잔고가 0인 자산은 제외
    if (walletBalance <= 0) {
      continue;
    }

    const isStablecoin = ['USDT', 'USDC', 'DAI'].includes(item.coin);

    if (isStablecoin) {
      usdtBalance += walletBalance;
    }

    holdings.push({
      exchange: 'bybit',
      symbol: item.coin,
      currency: 'USDT',
      balance: walletBalance - locked,
      lockedBalance: locked,
      avgBuyPrice: isStablecoin ? 1 : 0,
      currentPrice: isStablecoin ? 1 : 0,
      evaluationAmount: isStablecoin ? walletBalance : 0,
      profitLoss: 0,
      profitLossRate: 0,
    });
  }

  // 바이빗 Unified 계정의 totalEquity를 walletSummary로 추출
  // totalEquity는 모든 지갑(Spot + Futures + Margin + Earn 등)의 USDT 합계
  const totalEquity = parseFloat(account.totalEquity) || 0;

  // Spot 잔고는 개별 코인의 USD 환산 합계로 계산
  const spotBalanceUsdt = account.coin.reduce((sum, item) => {
    return sum + (parseFloat(item.usdValue) || 0);
  }, 0);

  const walletSummary: WalletSummary = {
    totalEquityUsdt: totalEquity,
    wallets: [
      { name: 'Unified', balanceUsdt: totalEquity },
    ],
  };

  // Spot 합계와 totalEquity가 다르면 Spot 외 자산이 있다는 뜻
  if (totalEquity > 0 && spotBalanceUsdt > 0 && Math.abs(totalEquity - spotBalanceUsdt) > 0.01) {
    walletSummary.wallets = [
      { name: 'Spot', balanceUsdt: spotBalanceUsdt },
      { name: 'Derivatives/Earn', balanceUsdt: totalEquity - spotBalanceUsdt },
    ];
  }

  return {
    exchange: 'bybit',
    holdings,
    krwBalance: usdtBalance, // USDT 잔고를 krwBalance 필드에 저장 (환산은 프론트에서 처리)
    timestamp: Date.now(),
    walletSummary,
  };
}

/**
 * 바이빗 시세(Ticker) 조회 응답을 정규화한다.
 *
 * GET /v5/market/tickers?category=spot 응답을 NormalizedTicker로 변환한다.
 * USDT 마켓 심볼(예: "BTCUSDT")에서 코인 심볼(예: "BTC")을 추출한다.
 *
 * @param rawResponse 바이빗 /v5/market/tickers API 원본 응답
 * @returns 정규화된 시세 데이터
 */
export function normalizeBybitTicker(rawResponse: unknown): NormalizedTicker {
  const response = rawResponse as BybitApiResponse<BybitTickerResult>;

  // retCode !== 0 이면 에러 응답
  if (response?.retCode !== undefined && response.retCode !== 0) {
    return {
      exchange: 'bybit',
      tickers: [],
      timestamp: Date.now(),
    };
  }

  if (!response?.result?.list || !Array.isArray(response.result.list)) {
    return {
      exchange: 'bybit',
      tickers: [],
      timestamp: Date.now(),
    };
  }

  const tickers: Ticker[] = [];

  for (const item of response.result.list) {
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

    const lastPrice = parseFloat(item.lastPrice) || 0;
    const highPrice = parseFloat(item.highPrice24h) || 0;
    const lowPrice = parseFloat(item.lowPrice24h) || 0;
    const prevPrice = parseFloat(item.prevPrice24h) || 0;
    const changeRateDecimal = parseFloat(item.price24hPcnt) || 0;
    const volume = parseFloat(item.volume24h) || 0;
    const turnover = parseFloat(item.turnover24h) || 0;

    const priceChange = lastPrice - prevPrice;

    tickers.push({
      exchange: 'bybit',
      symbol: coinSymbol,
      currentPrice: lastPrice,
      openPrice: prevPrice, // 바이빗은 openPrice를 직접 제공하지 않으므로 prevPrice 사용
      highPrice,
      lowPrice,
      prevClosePrice: prevPrice,
      changeRate: changeRateDecimal * 100, // 바이빗은 소수(0.025 = 2.5%)로 제공하므로 %로 변환
      changePrice: priceChange,
      volume24h: volume,
      volumeAmount24h: turnover, // USDT 기준 거래금액
      timestamp: Date.now(),
    });
  }

  return {
    exchange: 'bybit',
    tickers,
    timestamp: Date.now(),
  };
}

/**
 * 바이빗 호가(Orderbook) 조회 응답을 정규화한다.
 *
 * @param rawResponse 바이빗 /v5/market/orderbook API 원본 응답
 * @returns 정규화된 호가 데이터
 */
export function normalizeBybitOrderbook(rawResponse: unknown): NormalizedOrderbook {
  const response = rawResponse as BybitApiResponse<BybitOrderbookResult>;

  // retCode !== 0 이면 에러 응답
  if (response?.retCode !== undefined && response.retCode !== 0) {
    return {
      exchange: 'bybit',
      orderbook: {
        exchange: 'bybit',
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

  if (response?.result?.a && Array.isArray(response.result.a)) {
    for (const [price, quantity] of response.result.a) {
      asks.push({
        price: parseFloat(price) || 0,
        quantity: parseFloat(quantity) || 0,
      });
    }
  }

  if (response?.result?.b && Array.isArray(response.result.b)) {
    for (const [price, quantity] of response.result.b) {
      bids.push({
        price: parseFloat(price) || 0,
        quantity: parseFloat(quantity) || 0,
      });
    }
  }

  return {
    exchange: 'bybit',
    orderbook: {
      exchange: 'bybit',
      symbol: '',
      asks,
      bids,
      timestamp: Date.now(),
    },
    timestamp: Date.now(),
  };
}

/**
 * 바이빗 주문 내역 응답을 정규화한다.
 *
 * @param rawResponse 바이빗 /v5/order/history API 원본 응답
 * @returns 정규화된 주문 내역 데이터
 */
export function normalizeBybitOrderHistory(rawResponse: unknown): NormalizedOrderHistory {
  const response = rawResponse as BybitApiResponse<BybitOrderHistoryResult>;

  // retCode !== 0 이면 에러 응답
  if (response?.retCode !== undefined && response.retCode !== 0) {
    return {
      exchange: 'bybit',
      orders: [],
      timestamp: Date.now(),
    };
  }

  if (!response?.result?.list || !Array.isArray(response.result.list)) {
    return {
      exchange: 'bybit',
      orders: [],
      timestamp: Date.now(),
    };
  }

  const orders: OrderHistoryItem[] = [];

  for (const item of response.result.list) {
    if (!item?.orderId) {
      continue;
    }

    // 심볼에서 USDT 접미사 제거 (예: "BTCUSDT" -> "BTC")
    const symbol = item.symbol?.endsWith('USDT')
      ? item.symbol.slice(0, -4)
      : item.symbol;

    // 바이빗 주문 상태 매핑
    let status: OrderHistoryItem['status'];
    switch (item.orderStatus) {
      case 'New':
      case 'PartiallyFilled':
        status = item.orderStatus === 'New' ? 'open' : 'partially_filled';
        break;
      case 'Filled':
        status = 'filled';
        break;
      case 'Cancelled':
      case 'Rejected':
      case 'Deactivated':
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
      quantity: parseFloat(item.qty) || 0,
      executedQuantity: parseFloat(item.cumExecQty) || 0,
      status,
      orderedAt: new Date(parseInt(item.createdTime, 10) || Date.now()),
    });
  }

  return {
    exchange: 'bybit',
    orders,
    timestamp: Date.now(),
  };
}
