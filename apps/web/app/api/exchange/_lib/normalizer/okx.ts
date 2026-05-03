/**
 * OKX API 응답 정규화 모듈
 *
 * OKX 거래소의 API v5 응답을 통일된 내부 데이터 모델로 변환한다.
 * 각 API 엔드포인트(잔고, 시세, 호가, 주문 내역)별로 정규화 함수를 제공한다.
 *
 * OKX API v5 응답 특성:
 * - 공통 구조: { code: "0", msg: "", data: [...] }
 * - code !== "0"이면 에러
 * - 잔고 조회: data[0].details 배열
 * - 시세 조회: data 배열 [{ instId, last, ... }]
 * - 호가 조회: data[0].asks, data[0].bids
 * - 주문 내역: data 배열
 *
 * OKX 잔고는 USDT 기준이므로 currency를 'USDT'로 설정한다.
 * KRW 환산은 대시보드에서 환율을 적용하여 처리한다.
 *
 * @see https://www.okx.com/docs-v5/en/
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

// ===== OKX API 원본 응답 타입 =====

/** OKX API v5 공통 응답 래퍼 */
export interface OkxApiResponse<T> {
  code: string;
  msg: string;
  data: T;
}

/** OKX 잔고 조회 응답 내 개별 코인 항목 */
export interface OkxBalanceDetail {
  ccy: string;
  availBal: string;
  frozenBal: string;
  eqUsd: string;
}

/** OKX 잔고 조회 응답 데이터 항목 */
export interface OkxBalanceData {
  totalEq: string;
  details: OkxBalanceDetail[];
}

/** OKX 시세 조회 응답 항목 */
export interface OkxTickerItem {
  instId: string;
  last: string;
  open24h: string;
  high24h: string;
  low24h: string;
  vol24h: string;
  volCcy24h: string;
  sodUtc0: string;
}

/** OKX 호가 조회 응답 항목 */
export interface OkxOrderbookData {
  asks: [string, string, string, string][];
  bids: [string, string, string, string][];
}

/** OKX 주문 내역 항목 */
export interface OkxOrderItem {
  ordId: string;
  instId: string;
  side: string;
  px: string;
  sz: string;
  fillSz: string;
  state: string;
  cTime: string;
}

// ===== 정규화 함수 =====

/**
 * OKX 잔고 조회 응답을 정규화한다.
 *
 * data[0].details 배열에서 availBal > 0 인 코인만 포함한다.
 * OKX는 USDT 마켓이 기본이므로 currency를 'USDT'로 설정한다.
 * USDT 자체의 잔고는 KRW 잔고와 유사한 역할로 별도 처리한다.
 *
 * @param rawResponse OKX /api/v5/account/balance API 원본 응답
 * @returns 정규화된 잔고 데이터
 */
export function normalizeOkxBalance(rawResponse: unknown): NormalizedBalance {
  const response = rawResponse as OkxApiResponse<OkxBalanceData[]>;

  // code !== "0" 이면 에러 응답
  if (response?.code !== undefined && response.code !== '0') {
    return {
      exchange: 'okx',
      holdings: [],
      krwBalance: 0,
      timestamp: Date.now(),
    };
  }

  if (
    !response?.data ||
    !Array.isArray(response.data) ||
    response.data.length === 0
  ) {
    return {
      exchange: 'okx',
      holdings: [],
      krwBalance: 0,
      timestamp: Date.now(),
    };
  }

  const account = response.data[0];
  if (!account?.details || !Array.isArray(account.details)) {
    return {
      exchange: 'okx',
      holdings: [],
      krwBalance: 0,
      timestamp: Date.now(),
    };
  }

  let usdtBalance = 0;
  const holdings: Holding[] = [];

  for (const item of account.details) {
    const availBal = parseFloat(item.availBal) || 0;
    const frozenBal = parseFloat(item.frozenBal) || 0;
    const totalBal = availBal + frozenBal;

    // 잔고가 0인 자산은 제외
    if (totalBal <= 0) {
      continue;
    }

    const isStablecoin = ['USDT', 'USDC', 'DAI'].includes(item.ccy);

    if (isStablecoin) {
      usdtBalance += totalBal;
    }

    holdings.push({
      exchange: 'okx',
      symbol: item.ccy,
      currency: 'USDT',
      balance: availBal,
      lockedBalance: frozenBal,
      avgBuyPrice: isStablecoin ? 1 : 0,
      currentPrice: isStablecoin ? 1 : 0,
      evaluationAmount: isStablecoin ? totalBal : 0,
      profitLoss: 0,
      profitLossRate: 0,
    });
  }

  // OKX Unified 계정의 totalEq를 walletSummary로 추출
  // totalEq는 모든 자산(Spot + Futures + Margin + Earn 등)의 USD 합계
  const totalEq = parseFloat(account.totalEq) || 0;

  // 개별 코인의 eqUsd 합계를 Spot 잔고로 사용
  const spotBalanceUsdt = account.details.reduce((sum, item) => {
    return sum + (parseFloat(item.eqUsd) || 0);
  }, 0);

  const walletSummary: WalletSummary = {
    totalEquityUsdt: totalEq,
    wallets: [
      { name: 'Unified', balanceUsdt: totalEq },
    ],
  };

  // Spot 합계와 totalEq가 다르면 Spot 외 자산이 있다는 뜻
  if (totalEq > 0 && spotBalanceUsdt > 0 && Math.abs(totalEq - spotBalanceUsdt) > 0.01) {
    walletSummary.wallets = [
      { name: 'Spot', balanceUsdt: spotBalanceUsdt },
      { name: 'Derivatives/Earn', balanceUsdt: totalEq - spotBalanceUsdt },
    ];
  }

  return {
    exchange: 'okx',
    holdings,
    krwBalance: usdtBalance, // USDT 잔고를 krwBalance 필드에 저장 (환산은 프론트에서 처리)
    timestamp: Date.now(),
    walletSummary,
  };
}

/**
 * OKX 시세(Ticker) 조회 응답을 정규화한다.
 *
 * GET /api/v5/market/tickers?instType=SPOT 응답을 NormalizedTicker로 변환한다.
 * USDT 마켓 심볼(예: "BTC-USDT")에서 코인 심볼(예: "BTC")을 추출한다.
 *
 * @param rawResponse OKX /api/v5/market/tickers API 원본 응답
 * @returns 정규화된 시세 데이터
 */
export function normalizeOkxTicker(rawResponse: unknown): NormalizedTicker {
  const response = rawResponse as OkxApiResponse<OkxTickerItem[]>;

  // code !== "0" 이면 에러 응답
  if (response?.code !== undefined && response.code !== '0') {
    return {
      exchange: 'okx',
      tickers: [],
      timestamp: Date.now(),
    };
  }

  if (!response?.data || !Array.isArray(response.data)) {
    return {
      exchange: 'okx',
      tickers: [],
      timestamp: Date.now(),
    };
  }

  const tickers: Ticker[] = [];

  for (const item of response.data) {
    if (!item?.instId) {
      continue;
    }

    // USDT 마켓 심볼만 처리 (예: "BTC-USDT" -> "BTC")
    if (!item.instId.endsWith('-USDT')) {
      continue;
    }

    const coinSymbol = item.instId.replace('-USDT', '');
    if (!coinSymbol) {
      continue;
    }

    const lastPrice = parseFloat(item.last) || 0;
    const openPrice = parseFloat(item.open24h) || 0;
    const highPrice = parseFloat(item.high24h) || 0;
    const lowPrice = parseFloat(item.low24h) || 0;
    const volume = parseFloat(item.vol24h) || 0;
    const turnover = parseFloat(item.volCcy24h) || 0;

    const priceChange = lastPrice - openPrice;
    // changeRate는 %(예: 2.5 = 2.5%)로 통일
    const changeRate = openPrice > 0 ? (priceChange / openPrice) * 100 : 0;

    tickers.push({
      exchange: 'okx',
      symbol: coinSymbol,
      currentPrice: lastPrice,
      openPrice,
      highPrice,
      lowPrice,
      prevClosePrice: openPrice, // OKX는 prevClose를 직접 제공하지 않으므로 open 사용
      changeRate,
      changePrice: priceChange,
      volume24h: volume,
      volumeAmount24h: turnover, // USDT 기준 거래금액
      timestamp: Date.now(),
    });
  }

  return {
    exchange: 'okx',
    tickers,
    timestamp: Date.now(),
  };
}

/**
 * OKX 호가(Orderbook) 조회 응답을 정규화한다.
 *
 * @param rawResponse OKX /api/v5/market/books API 원본 응답
 * @returns 정규화된 호가 데이터
 */
export function normalizeOkxOrderbook(rawResponse: unknown): NormalizedOrderbook {
  const response = rawResponse as OkxApiResponse<OkxOrderbookData[]>;

  // code !== "0" 이면 에러 응답
  if (response?.code !== undefined && response.code !== '0') {
    return {
      exchange: 'okx',
      orderbook: {
        exchange: 'okx',
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

  if (
    response?.data &&
    Array.isArray(response.data) &&
    response.data.length > 0
  ) {
    const book = response.data[0];

    if (book?.asks && Array.isArray(book.asks)) {
      for (const entry of book.asks) {
        asks.push({
          price: parseFloat(entry[0]) || 0,
          quantity: parseFloat(entry[1]) || 0,
        });
      }
    }

    if (book?.bids && Array.isArray(book.bids)) {
      for (const entry of book.bids) {
        bids.push({
          price: parseFloat(entry[0]) || 0,
          quantity: parseFloat(entry[1]) || 0,
        });
      }
    }
  }

  return {
    exchange: 'okx',
    orderbook: {
      exchange: 'okx',
      symbol: '',
      asks,
      bids,
      timestamp: Date.now(),
    },
    timestamp: Date.now(),
  };
}

/**
 * OKX 주문 내역 응답을 정규화한다.
 *
 * @param rawResponse OKX /api/v5/trade/orders-history-archive API 원본 응답
 * @returns 정규화된 주문 내역 데이터
 */
export function normalizeOkxOrderHistory(rawResponse: unknown): NormalizedOrderHistory {
  const response = rawResponse as OkxApiResponse<OkxOrderItem[]>;

  // code !== "0" 이면 에러 응답
  if (response?.code !== undefined && response.code !== '0') {
    return {
      exchange: 'okx',
      orders: [],
      timestamp: Date.now(),
    };
  }

  if (!response?.data || !Array.isArray(response.data)) {
    return {
      exchange: 'okx',
      orders: [],
      timestamp: Date.now(),
    };
  }

  const orders: OrderHistoryItem[] = [];

  for (const item of response.data) {
    if (!item?.ordId) {
      continue;
    }

    // 심볼에서 "-USDT" 접미사 제거 (예: "BTC-USDT" -> "BTC")
    const symbol = item.instId?.endsWith('-USDT')
      ? item.instId.replace('-USDT', '')
      : item.instId;

    // OKX 주문 상태 매핑
    let status: OrderHistoryItem['status'];
    switch (item.state) {
      case 'live':
      case 'partially_filled':
        status = item.state === 'live' ? 'open' : 'partially_filled';
        break;
      case 'filled':
        status = 'filled';
        break;
      case 'canceled':
      case 'cancelled':
        status = 'cancelled';
        break;
      default:
        status = 'open';
    }

    orders.push({
      orderId: item.ordId,
      symbol,
      currency: 'USDT',
      side: item.side?.toLowerCase() === 'buy' ? 'buy' : 'sell',
      price: parseFloat(item.px) || 0,
      quantity: parseFloat(item.sz) || 0,
      executedQuantity: parseFloat(item.fillSz) || 0,
      status,
      orderedAt: new Date(parseInt(item.cTime, 10) || Date.now()),
    });
  }

  return {
    exchange: 'okx',
    orders,
    timestamp: Date.now(),
  };
}
