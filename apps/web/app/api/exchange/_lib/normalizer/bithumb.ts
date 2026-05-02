/**
 * 빗썸 API 응답 정규화 모듈
 *
 * 빗썸 거래소의 API 응답을 통일된 내부 데이터 모델로 변환한다.
 * 각 API 엔드포인트(잔고, 시세, 호가, 주문 내역)별로 정규화 함수를 제공한다.
 *
 * 빗썸 API 응답 특성:
 * - 공통 래퍼: { status: "0000", data: { ... } } (status "0000" = 성공)
 * - 잔고 조회: data에 코인별 { total_{코인}, available_{코인} } 키-값 구조
 * - 시세 조회: data에 { opening_price, closing_price, ... } 구조
 * - 호가 조회: data에 { bids: [...], asks: [...] } 배열 구조
 * - 주문 내역: data에 주문 배열 구조
 *
 * @see 요구사항 12.4 (응답 데이터 통일된 내부 데이터 모델 정규화)
 * @see https://apidocs.bithumb.com/reference
 */

import type { Holding, Ticker, Orderbook, OrderbookEntry } from '@bitscope/shared';
import type {
  NormalizedBalance,
  NormalizedTicker,
  NormalizedOrderbook,
  NormalizedOrderHistory,
  OrderHistoryItem,
} from './types';

// ===== 빗썸 API 원본 응답 타입 =====

/** 빗썸 API 공통 응답 래퍼 */
export interface BithumbApiResponse<T = unknown> {
  status: string;
  data: T;
  message?: string;
}

/** 빗썸 잔고 조회 응답 데이터 */
export interface BithumbBalanceData {
  /**
   * 코인별 총 보유량: total_{코인심볼(소문자)} = "수량"
   * 코인별 가용 보유량: available_{코인심볼(소문자)} = "수량"
   * 예: total_btc: "0.5", available_btc: "0.3"
   * KRW도 동일: total_krw: "1000000", available_krw: "900000"
   */
  [key: string]: string;
}

/** 빗썸 시세(Ticker) 조회 응답 데이터 */
export interface BithumbTickerData {
  opening_price: string;
  closing_price: string;
  min_price: string;
  max_price: string;
  units_traded: string;
  acc_trade_value: string;
  prev_closing_price: string;
  units_traded_24H: string;
  acc_trade_value_24H: string;
  fluctate_24H: string;
  fluctate_rate_24H: string;
  date: string;
}

/** 빗썸 전체 시세 조회 응답 데이터 (ALL_KRW) */
export interface BithumbAllTickerData {
  [symbol: string]: BithumbTickerData | string;
  // date 필드가 최상위에 존재
}

/** 빗썸 호가(Orderbook) 조회 응답 데이터 */
export interface BithumbOrderbookData {
  timestamp: string;
  order_currency: string;
  payment_currency: string;
  bids: {
    quantity: string;
    price: string;
  }[];
  asks: {
    quantity: string;
    price: string;
  }[];
}

/** 빗썸 주문 내역 조회 응답 항목 */
export interface BithumbOrderItem {
  order_id: string;
  order_currency: string;
  payment_currency: string;
  type: 'bid' | 'ask';
  status: string;
  price: string;
  quantity: string;
  order_qty: string;
  date: string;
  // 체결 수량은 order_qty - quantity로 계산
}

// ===== 정규화 함수 =====

/**
 * 빗썸 잔고 조회 응답을 정규화한다.
 *
 * 빗썸 잔고 응답의 key-value 구조에서 코인 심볼을 추출하고,
 * total/available 쌍을 Holding 형태로 변환한다.
 *
 * - total_{symbol}: 총 보유량
 * - available_{symbol}: 사용 가능 수량
 * - locked = total - available
 *
 * 주의: 빗썸 잔고 응답에는 매수 평균가(avgBuyPrice)와 현재가가 포함되지 않으므로,
 * avgBuyPrice=0, currentPrice=0으로 설정한다. 이후 시세 데이터와 결합하여 갱신해야 한다.
 *
 * @param rawResponse 빗썸 잔고 조회 원본 응답
 * @returns 정규화된 잔고 데이터
 */
export function normalizeBithumbBalance(rawResponse: unknown): NormalizedBalance {
  const response = rawResponse as BithumbApiResponse<BithumbBalanceData>;

  if (!response || response.status !== '0000' || !response.data) {
    return {
      exchange: 'bithumb',
      holdings: [],
      krwBalance: 0,
      timestamp: Date.now(),
    };
  }

  const data = response.data;
  let krwBalance = 0;
  const holdings: Holding[] = [];

  // total_ 접두사로 시작하는 키에서 코인 심볼을 추출
  const symbols = new Set<string>();
  for (const key of Object.keys(data)) {
    if (key.startsWith('total_')) {
      const symbol = key.replace('total_', '').toUpperCase();
      symbols.add(symbol);
    }
  }

  for (const symbol of symbols) {
    const lowerSymbol = symbol.toLowerCase();
    const total = parseFloat(data[`total_${lowerSymbol}`]) || 0;
    const available = parseFloat(data[`available_${lowerSymbol}`]) || 0;
    const locked = total - available;

    // KRW 잔고는 별도 관리
    if (symbol === 'KRW') {
      krwBalance = total;
      continue;
    }

    // 보유 수량이 0인 코인은 제외
    if (total <= 0) {
      continue;
    }

    holdings.push({
      exchange: 'bithumb',
      symbol,
      currency: 'KRW',
      balance: available,
      lockedBalance: locked > 0 ? locked : 0,
      // 빗썸 잔고 응답에는 매수 평균가가 포함되지 않음
      avgBuyPrice: 0,
      currentPrice: 0,
      evaluationAmount: 0,
      profitLoss: 0,
      profitLossRate: 0,
    });
  }

  return {
    exchange: 'bithumb',
    holdings,
    krwBalance,
    timestamp: Date.now(),
  };
}

/**
 * 빗썸 시세(Ticker) 조회 응답을 정규화한다.
 *
 * 빗썸 시세 응답을 NormalizedTicker 형태로 변환한다.
 * - 단일 코인 시세: data가 BithumbTickerData 객체
 * - 전체 코인 시세(ALL_KRW): data가 코인 심볼을 키로 하는 객체
 *
 * @param rawResponse 빗썸 시세 조회 원본 응답
 * @param symbol 조회 대상 코인 심볼 (단일 코인 조회 시). 전체 조회 시 생략.
 * @returns 정규화된 시세 데이터
 */
export function normalizeBithumbTicker(
  rawResponse: unknown,
  symbol?: string,
): NormalizedTicker {
  const response = rawResponse as BithumbApiResponse<BithumbAllTickerData | BithumbTickerData>;

  if (!response || response.status !== '0000' || !response.data) {
    return {
      exchange: 'bithumb',
      tickers: [],
      timestamp: Date.now(),
    };
  }

  const data = response.data;
  const tickers: Ticker[] = [];

  // 단일 코인 시세 조회인 경우 (symbol이 지정됨)
  if (symbol) {
    const tickerData = data as BithumbTickerData;
    const ticker = parseBithumbTickerData(symbol, tickerData);
    if (ticker) {
      tickers.push(ticker);
    }
  } else {
    // 전체 코인 시세 조회 (ALL_KRW)
    const allData = data as BithumbAllTickerData;
    for (const [key, value] of Object.entries(allData)) {
      // date 필드 등 비-코인 키는 건너뛴다
      if (key === 'date' || typeof value === 'string') {
        continue;
      }
      const tickerData = value as BithumbTickerData;
      const ticker = parseBithumbTickerData(key, tickerData);
      if (ticker) {
        tickers.push(ticker);
      }
    }
  }

  return {
    exchange: 'bithumb',
    tickers,
    timestamp: Date.now(),
  };
}

/**
 * 빗썸 시세 데이터 항목을 Ticker 형태로 변환한다.
 *
 * @param symbol 코인 심볼
 * @param data 빗썸 시세 데이터
 * @returns Ticker 객체 또는 null (파싱 실패 시)
 */
function parseBithumbTickerData(symbol: string, data: BithumbTickerData): Ticker | null {
  if (!data || !data.closing_price) {
    return null;
  }

  const closingPrice = parseFloat(data.closing_price) || 0;
  const openingPrice = parseFloat(data.opening_price) || 0;
  const prevClosingPrice = parseFloat(data.prev_closing_price) || 0;
  const fluctate24H = parseFloat(data.fluctate_24H) || 0;
  const fluctateRate24H = parseFloat(data.fluctate_rate_24H) || 0;

  return {
    exchange: 'bithumb',
    symbol: symbol.toUpperCase(),
    currentPrice: closingPrice,
    openPrice: openingPrice,
    highPrice: parseFloat(data.max_price) || 0,
    lowPrice: parseFloat(data.min_price) || 0,
    prevClosePrice: prevClosingPrice,
    changeRate: fluctateRate24H,
    changePrice: fluctate24H,
    volume24h: parseFloat(data.units_traded_24H) || 0,
    volumeAmount24h: parseFloat(data.acc_trade_value_24H) || 0,
    timestamp: parseInt(data.date, 10) || Date.now(),
  };
}

/**
 * 빗썸 호가(Orderbook) 조회 응답을 정규화한다.
 *
 * 빗썸 호가 응답을 NormalizedOrderbook 형태로 변환한다.
 * - asks(매도 호가)는 낮은 가격순으로 정렬한다.
 * - bids(매수 호가)는 높은 가격순으로 정렬한다.
 *
 * @param rawResponse 빗썸 호가 조회 원본 응답
 * @returns 정규화된 호가 데이터
 */
export function normalizeBithumbOrderbook(rawResponse: unknown): NormalizedOrderbook {
  const response = rawResponse as BithumbApiResponse<BithumbOrderbookData>;

  if (!response || response.status !== '0000' || !response.data) {
    return {
      exchange: 'bithumb',
      orderbook: {
        exchange: 'bithumb',
        symbol: '',
        asks: [],
        bids: [],
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    };
  }

  const data = response.data;

  const asks: OrderbookEntry[] = (data.asks || [])
    .map((entry) => ({
      price: parseFloat(entry.price) || 0,
      quantity: parseFloat(entry.quantity) || 0,
    }))
    .sort((a, b) => a.price - b.price); // 낮은 가격순

  const bids: OrderbookEntry[] = (data.bids || [])
    .map((entry) => ({
      price: parseFloat(entry.price) || 0,
      quantity: parseFloat(entry.quantity) || 0,
    }))
    .sort((a, b) => b.price - a.price); // 높은 가격순

  return {
    exchange: 'bithumb',
    orderbook: {
      exchange: 'bithumb',
      symbol: (data.order_currency || '').toUpperCase(),
      asks,
      bids,
      timestamp: parseInt(data.timestamp, 10) || Date.now(),
    },
    timestamp: Date.now(),
  };
}

/**
 * 빗썸 주문 내역 조회 응답을 정규화한다.
 *
 * 빗썸 주문 응답을 NormalizedOrderHistory 형태로 변환한다.
 * - bid -> buy, ask -> sell로 매핑한다.
 * - 주문 상태를 통일된 상태값으로 변환한다.
 *
 * @param rawResponse 빗썸 주문 내역 조회 원본 응답
 * @returns 정규화된 주문 내역 데이터
 */
export function normalizeBithumbOrderHistory(rawResponse: unknown): NormalizedOrderHistory {
  const response = rawResponse as BithumbApiResponse<BithumbOrderItem[]>;

  if (!response || response.status !== '0000' || !response.data || !Array.isArray(response.data)) {
    return {
      exchange: 'bithumb',
      orders: [],
      timestamp: Date.now(),
    };
  }

  const orders: OrderHistoryItem[] = response.data.map((item) => {
    const orderQty = parseFloat(item.order_qty) || 0;
    const remainingQty = parseFloat(item.quantity) || 0;
    const executedQty = orderQty - remainingQty;

    return {
      orderId: item.order_id,
      symbol: (item.order_currency || '').toUpperCase(),
      currency: ((item.payment_currency || 'KRW').toUpperCase()) as 'KRW' | 'BTC' | 'USDT',
      side: item.type === 'bid' ? ('buy' as const) : ('sell' as const),
      price: parseFloat(item.price) || 0,
      quantity: orderQty,
      executedQuantity: executedQty > 0 ? executedQty : 0,
      status: mapBithumbOrderStatus(item.status, orderQty, executedQty),
      orderedAt: new Date(parseInt(item.date, 10) || Date.now()),
    };
  });

  return {
    exchange: 'bithumb',
    orders,
    timestamp: Date.now(),
  };
}

/**
 * 빗썸 주문 상태를 통일된 상태값으로 매핑한다.
 *
 * @param status 빗썸 주문 상태 문자열
 * @param orderQty 주문 수량
 * @param executedQty 체결 수량
 * @returns 통일된 주문 상태
 */
function mapBithumbOrderStatus(
  status: string,
  orderQty: number,
  executedQty: number,
): OrderHistoryItem['status'] {
  // 빗썸 상태: pending, completed, cancel 등
  const normalizedStatus = status.toLowerCase();

  if (normalizedStatus === 'completed' || normalizedStatus === 'done') {
    return 'filled';
  }
  if (normalizedStatus === 'cancel' || normalizedStatus === 'cancelled') {
    return 'cancelled';
  }
  // pending 상태에서 일부 체결된 경우
  if (executedQty > 0 && executedQty < orderQty) {
    return 'partially_filled';
  }
  return 'open';
}
