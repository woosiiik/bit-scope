/**
 * LBank API 응답 정규화 모듈
 *
 * LBank 거래소의 API v2 응답을 통일된 내부 데이터 모델로 변환한다.
 * 각 API 엔드포인트(잔고, 시세, 호가, 주문 내역)별로 정규화 함수를 제공한다.
 *
 * LBank API v2 응답 특성:
 * - 공통 래퍼: { result: 'true'|'false', data: T, error_code: number, ts: number }
 * - 잔고 조회: data가 배열 [{ coin, assetAmt, usableAmt, freezeAmt, networkList }]
 * - 시세 조회: data가 배열 [{ symbol, ticker: { change, high, latest, low, turnover, vol }, timestamp }]
 * - 호가 조회: { asks: [[price, volume], ...], bids: [[price, volume], ...] }
 * - 주문 내역: data가 { orders: [{ order_id, symbol, type, price, amount, deal_amount, status, create_time }] }
 * - 거래쌍 형식: 소문자 + 언더스코어 (예: "eth_usdt")
 *
 * LBank 잔고는 USDT 기준이므로 currency를 'USDT'로 설정한다.
 * KRW 환산은 대시보드에서 환율을 적용하여 처리한다.
 *
 * @see https://github.com/LBank-exchange/lbank-official-api-docs
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

// ===== LBank API 원본 응답 타입 =====

/** LBank v2 API 공통 응답 래퍼 */
export interface LbankApiResponse<T> {
  result: 'true' | 'false';
  data: T;
  error_code: number;
  ts: number;
}

/** LBank 잔고 조회 응답 항목 */
export interface LbankBalanceItem {
  coin: string;
  assetAmt: string;
  usableAmt: string;
  freezeAmt: string;
  networkList?: Array<{
    coin: string;
    network: string;
    name: string;
    isDefault: boolean;
    withdrawFee: string;
    withdrawMin: number;
  }>;
}

/** LBank 시세 조회 응답 항목 */
export interface LbankTickerItem {
  symbol: string;
  ticker: {
    change: number;
    high: number;
    latest: number;
    low: number;
    turnover: number;
    vol: number;
  };
  timestamp: number;
}

/** LBank 호가 조회 응답 */
export interface LbankDepthResponse {
  asks: [number, number][];
  bids: [number, number][];
}

/** LBank 주문 내역 조회 응답 항목 */
export interface LbankOrderItem {
  order_id: string;
  symbol: string;
  type: string;
  price: number;
  amount: number;
  deal_amount: number;
  avg_price: number;
  status: number;
  create_time: number;
}

// ===== 유틸리티 함수 =====

/**
 * LBank 거래쌍 형식에서 코인 심볼을 추출한다.
 *
 * @param pair LBank 거래쌍 (예: "eth_usdt")
 * @returns 대문자 코인 심볼 (예: "ETH")
 */
function extractSymbol(pair: string): string {
  const parts = pair.split('_');
  return (parts[0] || pair).toUpperCase();
}

// ===== 정규화 함수 =====

/**
 * LBank 잔고 조회 응답을 정규화한다.
 *
 * POST /v2/supplement/user_info.do 응답을 NormalizedBalance로 변환한다.
 * usableAmt > 0 또는 freezeAmt > 0인 코인만 포함한다.
 *
 * @param rawResponse LBank API 원본 응답
 * @returns 정규화된 잔고 데이터
 */
export function normalizeLbankBalance(rawResponse: unknown): NormalizedBalance {
  const response = rawResponse as LbankApiResponse<LbankBalanceItem[]>;

  const items = response?.data;
  if (!Array.isArray(items)) {
    return {
      exchange: 'lbank',
      holdings: [],
      krwBalance: 0,
      timestamp: Date.now(),
    };
  }

  let usdtBalance = 0;
  const holdings: Holding[] = [];

  for (const item of items) {
    const available = parseFloat(item.usableAmt) || 0;
    const locked = parseFloat(item.freezeAmt) || 0;
    const totalBal = available + locked;

    if (totalBal <= 0) {
      continue;
    }

    const symbol = item.coin.toUpperCase();
    const isStablecoin = ['USDT', 'USDC', 'DAI'].includes(symbol);

    if (isStablecoin) {
      usdtBalance += totalBal;
    }

    holdings.push({
      exchange: 'lbank',
      symbol,
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

  const spotTotalUsdt = holdings.reduce((sum, h) => sum + h.evaluationAmount, 0);

  const walletSummary: WalletSummary = {
    totalEquityUsdt: spotTotalUsdt,
    wallets: [
      { name: 'Spot', balanceUsdt: spotTotalUsdt },
    ],
  };

  return {
    exchange: 'lbank',
    holdings,
    krwBalance: usdtBalance,
    timestamp: Date.now(),
    walletSummary,
  };
}

/**
 * LBank 시세(Ticker) 조회 응답을 정규화한다.
 *
 * GET /v2/ticker/24hr.do 응답을 NormalizedTicker로 변환한다.
 * USDT 마켓 심볼(예: "eth_usdt")에서 코인 심볼(예: "ETH")을 추출한다.
 *
 * @param rawResponse LBank API 원본 응답
 * @returns 정규화된 시세 데이터
 */
export function normalizeLbankTicker(rawResponse: unknown): NormalizedTicker {
  const response = rawResponse as LbankApiResponse<LbankTickerItem[]>;

  const items = response?.data;
  if (!Array.isArray(items)) {
    return {
      exchange: 'lbank',
      tickers: [],
      timestamp: Date.now(),
    };
  }

  const tickers: Ticker[] = [];

  for (const item of items) {
    if (!item?.symbol) {
      continue;
    }

    // USDT 마켓만 처리
    if (!item.symbol.endsWith('_usdt')) {
      continue;
    }

    const coinSymbol = extractSymbol(item.symbol);
    if (!coinSymbol) {
      continue;
    }

    const ticker = item.ticker;
    const lastPrice = ticker.latest || 0;
    const highPrice = ticker.high || 0;
    const lowPrice = ticker.low || 0;
    const changePercentage = ticker.change || 0;
    const baseVolume = ticker.vol || 0;
    const quoteVolume = ticker.turnover || 0;

    // change는 이미 % 단위
    const changeRate = changePercentage;
    const changeRateDecimal = changePercentage / 100;
    const openPrice = changeRateDecimal !== -1 ? lastPrice / (1 + changeRateDecimal) : lastPrice;
    const priceChange = lastPrice - openPrice;

    tickers.push({
      exchange: 'lbank',
      symbol: coinSymbol,
      currentPrice: lastPrice,
      openPrice,
      highPrice,
      lowPrice,
      prevClosePrice: openPrice,
      changeRate,
      changePrice: priceChange,
      volume24h: baseVolume,
      volumeAmount24h: quoteVolume,
      timestamp: item.timestamp || Date.now(),
    });
  }

  return {
    exchange: 'lbank',
    tickers,
    timestamp: Date.now(),
  };
}

/**
 * LBank 호가(Orderbook) 조회 응답을 정규화한다.
 *
 * GET /v2/depth.do 응답을 NormalizedOrderbook으로 변환한다.
 *
 * @param rawResponse LBank API 원본 응답
 * @returns 정규화된 호가 데이터
 */
export function normalizeLbankOrderbook(rawResponse: unknown): NormalizedOrderbook {
  const response = rawResponse as LbankDepthResponse;

  const asks: OrderbookEntry[] = [];
  const bids: OrderbookEntry[] = [];

  if (response?.asks && Array.isArray(response.asks)) {
    for (const entry of response.asks) {
      asks.push({
        price: entry[0] || 0,
        quantity: entry[1] || 0,
      });
    }
  }

  if (response?.bids && Array.isArray(response.bids)) {
    for (const entry of response.bids) {
      bids.push({
        price: entry[0] || 0,
        quantity: entry[1] || 0,
      });
    }
  }

  return {
    exchange: 'lbank',
    orderbook: {
      exchange: 'lbank',
      symbol: '',
      asks,
      bids,
      timestamp: Date.now(),
    },
    timestamp: Date.now(),
  };
}

/**
 * LBank 주문 내역 응답을 정규화한다.
 *
 * POST /v2/supplement/orders_info_history.do 응답을 NormalizedOrderHistory로 변환한다.
 *
 * LBank 주문 상태 코드:
 * - -1: 취소됨 (cancelled)
 * - 0: 미체결 (open)
 * - 1: 부분체결 (partially_filled)
 * - 2: 완전체결 (filled)
 * - 3: 부분체결 후 취소 (cancelled)
 * - 4: 취소중 (cancelled)
 *
 * @param rawResponse LBank API 원본 응답
 * @returns 정규화된 주문 내역 데이터
 */
export function normalizeLbankOrderHistory(rawResponse: unknown): NormalizedOrderHistory {
  const response = rawResponse as LbankApiResponse<{ orders: LbankOrderItem[] }>;

  const items = response?.data?.orders;
  if (!Array.isArray(items)) {
    return {
      exchange: 'lbank',
      orders: [],
      timestamp: Date.now(),
    };
  }

  const orders: OrderHistoryItem[] = [];

  for (const item of items) {
    if (!item?.order_id) {
      continue;
    }

    const symbol = extractSymbol(item.symbol);

    // 상태 코드 매핑
    let status: OrderHistoryItem['status'];
    switch (item.status) {
      case 0:
        status = 'open';
        break;
      case 1:
        status = 'partially_filled';
        break;
      case 2:
        status = 'filled';
        break;
      case -1:
      case 3:
      case 4:
        status = 'cancelled';
        break;
      default:
        status = 'open';
    }

    orders.push({
      orderId: item.order_id,
      symbol,
      currency: 'USDT',
      side: item.type?.toLowerCase() === 'buy' ? 'buy' : 'sell',
      price: item.price || 0,
      quantity: item.amount || 0,
      executedQuantity: item.deal_amount || 0,
      status,
      orderedAt: new Date(item.create_time || Date.now()),
    });
  }

  return {
    exchange: 'lbank',
    orders,
    timestamp: Date.now(),
  };
}

/**
 * LBank Futures 잔고 응답에서 USDT 합계를 추출한다.
 *
 * LBank Futures Private API가 완전히 공개되지 않았으므로,
 * Public market data를 통한 USD 가치 표시만 지원한다.
 * 실제 Futures 잔고 조회가 가능해지면 이 함수를 업데이트한다.
 *
 * @param rawResponse LBank Futures API 원본 응답
 * @returns Futures 총 잔고 (USDT)
 */
export function normalizeLbankFuturesBalance(rawResponse: unknown): number {
  // LBank Futures Private API가 공개되지 않아 현재는 0 반환
  // 향후 API가 공개되면 구현 예정
  const response = rawResponse as Record<string, unknown>;
  if (!response) {
    return 0;
  }

  // total 필드가 있으면 사용 (향후 API 대응)
  if (typeof response.total === 'string') {
    return parseFloat(response.total) || 0;
  }
  if (typeof response.total === 'number') {
    return response.total;
  }

  return 0;
}
