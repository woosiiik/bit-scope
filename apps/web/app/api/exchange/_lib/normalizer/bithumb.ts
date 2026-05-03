/**
 * 빗썸 API v2 응답 정규화 모듈
 *
 * 빗썸 거래소의 API v2 응답을 통일된 내부 데이터 모델로 변환한다.
 * 각 API 엔드포인트(잔고, 시세, 호가, 주문 내역)별로 정규화 함수를 제공한다.
 *
 * 빗썸 API v2 응답 특성 (업비트와 유사한 구조):
 * - 잔고 조회 (GET /v1/accounts): 코인별 잔고 배열 형태
 * - 시세 조회 (GET /public/ticker): Public API 시세 조회
 * - 호가 조회 (GET /public/orderbook): Public API 호가 조회
 * - 주문 내역 (GET /v1/orders): 주문 배열
 * - 마켓 목록 (GET /v1/market/all): "KRW-BTC" 형태의 마켓 코드 목록
 *
 * v1에서 v2로의 주요 변경:
 * - 잔고: key-value 구조 -> 배열 구조로 변경 (업비트와 동일)
 * - 인증: HMAC-SHA512 -> JWT (HS256)
 * - HTTP 메서드: POST -> GET으로 변경 (잔고 조회 등)
 * - 마켓 코드: "KRW-BTC" 형태 (업비트와 동일)
 *
 * @see 요구사항 12.4 (응답 데이터 통일된 내부 데이터 모델 정규화)
 * @see https://apidocs.bithumb.com/v2
 */

import type { Holding, Ticker, OrderbookEntry } from '@bitscope/shared';
import type {
  NormalizedBalance,
  NormalizedTicker,
  NormalizedOrderbook,
  NormalizedOrderHistory,
  OrderHistoryItem,
} from './types';

// ===== 빗썸 API v2 원본 응답 타입 =====

/** 빗썸 v2 잔고 조회 응답 항목 (업비트와 유사한 구조) */
export interface BithumbV2BalanceItem {
  /** 코인 심볼 (예: "BTC", "ETH", "KRW") */
  currency: string;
  /** 총 보유량 */
  balance: string;
  /** 주문 중 잠긴 수량 */
  locked: string;
  /** 매수 평균가 (KRW 마켓 기준) */
  avg_buy_price?: string;
  /** 매수 평균가 수정 여부 */
  avg_buy_price_modified?: boolean;
  /** 화폐 단위 (예: "KRW") */
  unit_currency?: string;
}

/** 빗썸 v2 시세(Ticker) 조회 응답 항목 */
export interface BithumbV2TickerItem {
  /** 마켓 코드 (예: "KRW-BTC") */
  market: string;
  /** 현재가 (종가) */
  trade_price: number;
  /** 시가 */
  opening_price: number;
  /** 고가 */
  high_price: number;
  /** 저가 */
  low_price: number;
  /** 전일 종가 */
  prev_closing_price: number;
  /** 24시간 변동률 (signed_change_rate) */
  signed_change_rate: number;
  /** 24시간 변동 금액 (signed_change_price) */
  signed_change_price: number;
  /** 24시간 거래량 */
  acc_trade_volume_24h: number;
  /** 24시간 거래금액 */
  acc_trade_price_24h: number;
  /** 타임스탬프 */
  timestamp: number;
}

/** 빗썸 v1 시세(Ticker) 조회 응답 데이터 (Public API 하위 호환) */
export interface BithumbV1TickerData {
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

/** 빗썸 전체 시세 조회 응답 데이터 (v1 Public API /public/ticker/ALL_KRW) */
export interface BithumbAllTickerData {
  [symbol: string]: BithumbV1TickerData | string;
}

/** 빗썸 v1 Public API 응답 래퍼 (시세/호가 Public API에서 사용) */
export interface BithumbPublicApiResponse<T = unknown> {
  status?: string;
  data?: T;
  message?: string;
}

/** 빗썸 v2 호가(Orderbook) 조회 응답 항목 */
export interface BithumbV2OrderbookItem {
  /** 마켓 코드 (예: "KRW-BTC") */
  market: string;
  /** 타임스탬프 */
  timestamp: number;
  /** 호가 유닛 목록 */
  orderbook_units: {
    /** 매도 호가 */
    ask_price: number;
    /** 매수 호가 */
    bid_price: number;
    /** 매도 잔량 */
    ask_size: number;
    /** 매수 잔량 */
    bid_size: number;
  }[];
}

/** 빗썸 v1 호가 응답 (Public API /public/orderbook 하위 호환) */
export interface BithumbV1OrderbookData {
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

/** 빗썸 v2 주문 내역 조회 응답 항목 */
export interface BithumbV2OrderItem {
  /** 주문 고유 ID */
  uuid: string;
  /** 주문 유형: bid(매수), ask(매도) */
  side: 'bid' | 'ask';
  /** 주문 유형: limit, price, market */
  ord_type: string;
  /** 주문 가격 */
  price: string;
  /** 주문 상태: wait, watch, done, cancel */
  state: string;
  /** 마켓 코드 (예: "KRW-BTC") */
  market: string;
  /** 주문 수량 */
  volume: string;
  /** 체결 남은 수량 */
  remaining_volume: string;
  /** 체결 수량 */
  executed_volume: string;
  /** 주문 시각 (ISO 8601) */
  created_at: string;
}

// ===== 정규화 함수 =====

/**
 * 빗썸 잔고 조회 응답을 정규화한다.
 *
 * 빗썸 v2 API 잔고 응답은 업비트와 동일한 배열 형식이다:
 * [{ currency: "BTC", balance: "0.5", locked: "0.1", avg_buy_price: "50000000" }, ...]
 *
 * @param rawResponse 빗썸 잔고 조회 원본 응답
 * @returns 정규화된 잔고 데이터
 */
export function normalizeBithumbBalance(rawResponse: unknown): NormalizedBalance {
  if (!rawResponse) {
    return {
      exchange: 'bithumb',
      holdings: [],
      krwBalance: 0,
      timestamp: Date.now(),
    };
  }

  // v2 형식: 배열이 직접 반환됨 (업비트와 동일)
  if (Array.isArray(rawResponse)) {
    return normalizeV2Balance(rawResponse as BithumbV2BalanceItem[]);
  }

  return {
    exchange: 'bithumb',
    holdings: [],
    krwBalance: 0,
    timestamp: Date.now(),
  };
}

/**
 * 빗썸 v2 형식의 잔고 데이터를 정규화한다.
 *
 * @param items 빗썸 v2 잔고 항목 배열
 * @returns 정규화된 잔고 데이터
 */
function normalizeV2Balance(items: BithumbV2BalanceItem[]): NormalizedBalance {
  let krwBalance = 0;
  const holdings: Holding[] = [];

  for (const item of items) {
    const symbol = (item.currency || '').toUpperCase();
    const balance = parseFloat(item.balance) || 0;
    const locked = parseFloat(item.locked) || 0;
    const total = balance + locked;
    const avgBuyPrice = parseFloat(item.avg_buy_price || '0') || 0;

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
      balance,
      lockedBalance: locked > 0 ? locked : 0,
      avgBuyPrice,
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
 * v2 형식(배열)과 v1 Public API 형식(객체)을 모두 지원한다.
 * Public API(/public/ticker)는 기존 v1 형식을 유지할 수 있으므로
 * 양쪽 형식 모두 처리한다.
 *
 * v2 형식: [{ market: "KRW-BTC", trade_price: 50500000, ... }, ...]
 * v1 형식: { status: "0000", data: { opening_price: "49000000", ... } }
 *
 * @param rawResponse 빗썸 시세 조회 원본 응답
 * @param symbol 조회 대상 코인 심볼 (단일 코인 조회 시). 전체 조회 시 생략.
 * @returns 정규화된 시세 데이터
 */
export function normalizeBithumbTicker(
  rawResponse: unknown,
  symbol?: string,
): NormalizedTicker {
  if (!rawResponse) {
    return {
      exchange: 'bithumb',
      tickers: [],
      timestamp: Date.now(),
    };
  }

  // v2 형식: 배열이 직접 반환
  if (Array.isArray(rawResponse)) {
    return normalizeV2Ticker(rawResponse as BithumbV2TickerItem[]);
  }

  const response = rawResponse as BithumbPublicApiResponse<unknown>;

  // data가 배열이면 v2 형식
  if (response.data && Array.isArray(response.data)) {
    return normalizeV2Ticker(response.data as BithumbV2TickerItem[]);
  }

  // v1 Public API 형식 처리
  if (response.status !== '0000' || !response.data) {
    return {
      exchange: 'bithumb',
      tickers: [],
      timestamp: Date.now(),
    };
  }

  return normalizeV1Ticker(response.data, symbol);
}

/**
 * 빗썸 v2 형식의 시세 데이터를 정규화한다.
 *
 * @param items 빗썸 v2 시세 항목 배열
 * @returns 정규화된 시세 데이터
 */
function normalizeV2Ticker(items: BithumbV2TickerItem[]): NormalizedTicker {
  const tickers: Ticker[] = [];

  for (const item of items) {
    if (!item.market || !item.trade_price) {
      continue;
    }

    // 마켓 코드에서 심볼 추출 (예: "KRW-BTC" -> "BTC")
    const parts = item.market.split('-');
    const symbol = parts.length >= 2 ? (parts[1] ?? '').toUpperCase() : item.market.toUpperCase();

    tickers.push({
      exchange: 'bithumb',
      symbol,
      currentPrice: item.trade_price,
      openPrice: item.opening_price || 0,
      highPrice: item.high_price || 0,
      lowPrice: item.low_price || 0,
      prevClosePrice: item.prev_closing_price || 0,
      changeRate: (item.signed_change_rate || 0) * 100, // 비율 -> 백분율
      changePrice: item.signed_change_price || 0,
      volume24h: item.acc_trade_volume_24h || 0,
      volumeAmount24h: item.acc_trade_price_24h || 0,
      timestamp: item.timestamp || Date.now(),
    });
  }

  return {
    exchange: 'bithumb',
    tickers,
    timestamp: Date.now(),
  };
}

/**
 * 빗썸 v1 Public API 형식의 시세 데이터를 정규화한다.
 *
 * Public API(/public/ticker)는 기존 v1 형식을 유지할 수 있으므로
 * 이 함수로 처리한다.
 *
 * @param data v1 시세 응답 데이터
 * @param symbol 조회 대상 심볼 (선택)
 * @returns 정규화된 시세 데이터
 */
function normalizeV1Ticker(data: unknown, symbol?: string): NormalizedTicker {
  const tickers: Ticker[] = [];

  // 단일 코인 시세 조회인 경우 (symbol이 지정됨)
  if (symbol) {
    const tickerData = data as BithumbV1TickerData;
    const ticker = parseV1TickerData(symbol, tickerData);
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
      const tickerData = value as BithumbV1TickerData;
      const ticker = parseV1TickerData(key, tickerData);
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
 * 빗썸 v1 시세 데이터 항목을 Ticker 형태로 변환한다.
 *
 * @param symbol 코인 심볼
 * @param data 빗썸 v1 시세 데이터
 * @returns Ticker 객체 또는 null (파싱 실패 시)
 */
function parseV1TickerData(symbol: string, data: BithumbV1TickerData): Ticker | null {
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
 * v2 형식(배열)과 v1 Public API 형식(객체)을 모두 지원한다.
 * Public API(/public/orderbook)는 기존 v1 형식을 유지할 수 있으므로
 * 양쪽 형식 모두 처리한다.
 *
 * v2 형식: [{ market: "KRW-BTC", orderbook_units: [...], ... }]
 * v1 형식: { status: "0000", data: { bids: [...], asks: [...] } }
 *
 * @param rawResponse 빗썸 호가 조회 원본 응답
 * @returns 정규화된 호가 데이터
 */
export function normalizeBithumbOrderbook(rawResponse: unknown): NormalizedOrderbook {
  const emptyResult: NormalizedOrderbook = {
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

  if (!rawResponse) {
    return emptyResult;
  }

  // v2 형식: 배열이 직접 반환
  if (Array.isArray(rawResponse)) {
    const items = rawResponse as BithumbV2OrderbookItem[];
    const firstItem = items[0];
    if (!firstItem) {
      return emptyResult;
    }
    return normalizeV2Orderbook(firstItem);
  }

  const response = rawResponse as BithumbPublicApiResponse<unknown>;

  // data가 배열이면 v2 형식
  if (response.data && Array.isArray(response.data)) {
    const items = response.data as BithumbV2OrderbookItem[];
    const firstItem = items[0];
    if (!firstItem) {
      return emptyResult;
    }
    return normalizeV2Orderbook(firstItem);
  }

  // v1 Public API 형식 처리
  if (response.status !== '0000' || !response.data) {
    return emptyResult;
  }

  return normalizeV1Orderbook(response.data as BithumbV1OrderbookData);
}

/**
 * 빗썸 v2 형식의 호가 데이터를 정규화한다.
 *
 * @param item 빗썸 v2 호가 항목
 * @returns 정규화된 호가 데이터
 */
function normalizeV2Orderbook(item: BithumbV2OrderbookItem): NormalizedOrderbook {
  // 마켓 코드에서 심볼 추출 (예: "KRW-BTC" -> "BTC")
  const parts = (item.market || '').split('-');
  const symbol = parts.length >= 2 ? (parts[1] ?? '').toUpperCase() : '';

  const asks: OrderbookEntry[] = [];
  const bids: OrderbookEntry[] = [];

  for (const unit of (item.orderbook_units || [])) {
    if (unit.ask_price > 0) {
      asks.push({
        price: unit.ask_price,
        quantity: unit.ask_size,
      });
    }
    if (unit.bid_price > 0) {
      bids.push({
        price: unit.bid_price,
        quantity: unit.bid_size,
      });
    }
  }

  // 매도 호가: 낮은 가격순, 매수 호가: 높은 가격순
  asks.sort((a, b) => a.price - b.price);
  bids.sort((a, b) => b.price - a.price);

  return {
    exchange: 'bithumb',
    orderbook: {
      exchange: 'bithumb',
      symbol,
      asks,
      bids,
      timestamp: item.timestamp || Date.now(),
    },
    timestamp: Date.now(),
  };
}

/**
 * 빗썸 v1 Public API 형식의 호가 데이터를 정규화한다.
 *
 * Public API(/public/orderbook)는 기존 v1 형식을 유지할 수 있으므로
 * 이 함수로 처리한다.
 *
 * @param data 빗썸 v1 호가 데이터
 * @returns 정규화된 호가 데이터
 */
function normalizeV1Orderbook(data: BithumbV1OrderbookData): NormalizedOrderbook {
  const asks: OrderbookEntry[] = (data.asks || [])
    .map((entry) => ({
      price: parseFloat(entry.price) || 0,
      quantity: parseFloat(entry.quantity) || 0,
    }))
    .sort((a, b) => a.price - b.price);

  const bids: OrderbookEntry[] = (data.bids || [])
    .map((entry) => ({
      price: parseFloat(entry.price) || 0,
      quantity: parseFloat(entry.quantity) || 0,
    }))
    .sort((a, b) => b.price - a.price);

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
 * v2 형식: [{ uuid: "...", side: "bid", market: "KRW-BTC", ... }, ...]
 *
 * @param rawResponse 빗썸 주문 내역 조회 원본 응답
 * @returns 정규화된 주문 내역 데이터
 */
export function normalizeBithumbOrderHistory(rawResponse: unknown): NormalizedOrderHistory {
  if (!rawResponse) {
    return {
      exchange: 'bithumb',
      orders: [],
      timestamp: Date.now(),
    };
  }

  // v2 형식: 배열이 직접 반환
  if (Array.isArray(rawResponse)) {
    return normalizeV2OrderHistory(rawResponse as BithumbV2OrderItem[]);
  }

  return {
    exchange: 'bithumb',
    orders: [],
    timestamp: Date.now(),
  };
}

/**
 * 빗썸 v2 형식의 주문 내역을 정규화한다.
 *
 * @param items 빗썸 v2 주문 항목 배열
 * @returns 정규화된 주문 내역 데이터
 */
function normalizeV2OrderHistory(items: BithumbV2OrderItem[]): NormalizedOrderHistory {
  const orders: OrderHistoryItem[] = items.map((item) => {
    // 마켓 코드에서 심볼 추출 (예: "KRW-BTC" -> "BTC")
    const parts = (item.market || '').split('-');
    const symbol = parts.length >= 2 ? (parts[1] ?? '').toUpperCase() : '';
    const currency = parts.length >= 2 ? (parts[0] ?? 'KRW').toUpperCase() : 'KRW';

    const volume = parseFloat(item.volume) || 0;
    const executedVolume = parseFloat(item.executed_volume) || 0;

    return {
      orderId: item.uuid,
      symbol,
      currency: currency as 'KRW' | 'BTC' | 'USDT',
      side: item.side === 'bid' ? ('buy' as const) : ('sell' as const),
      price: parseFloat(item.price) || 0,
      quantity: volume,
      executedQuantity: executedVolume,
      status: mapV2OrderStatus(item.state, volume, executedVolume),
      orderedAt: new Date(item.created_at || Date.now()),
    };
  });

  return {
    exchange: 'bithumb',
    orders,
    timestamp: Date.now(),
  };
}

/**
 * 빗썸 v2 주문 상태를 통일된 상태값으로 매핑한다.
 *
 * @param state 빗썸 v2 주문 상태 (wait, watch, done, cancel)
 * @param volume 주문 수량
 * @param executedVolume 체결 수량
 * @returns 통일된 주문 상태
 */
function mapV2OrderStatus(
  state: string,
  volume: number,
  executedVolume: number,
): OrderHistoryItem['status'] {
  const normalizedState = (state || '').toLowerCase();

  if (normalizedState === 'done') {
    return 'filled';
  }
  if (normalizedState === 'cancel') {
    return 'cancelled';
  }
  // wait/watch 상태에서 일부 체결된 경우
  if (executedVolume > 0 && executedVolume < volume) {
    return 'partially_filled';
  }
  return 'open';
}
