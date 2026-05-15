/**
 * 선물 오더북 정규화 모듈
 *
 * 해외 거래소(Binance, Bybit, OKX, Gate, Bitget)의 선물 오더북 API 응답을
 * 통일된 FuturesOrderbook 타입으로 변환한다.
 *
 * 거래소별 선물 오더북 응답 구조:
 * - Binance: { bids: [["price","qty"], ...], asks: [["price","qty"], ...] }
 * - Bybit: { result: { b: [["price","qty"], ...], a: [["price","qty"], ...] } }
 * - OKX: { data: [{ bids: [["price","qty", ...], ...], asks: [...] }] }
 * - Gate: { bids: [{ p, s }, ...], asks: [{ p, s }, ...] }
 * - Bitget: { data: { bids: [["price","qty"], ...], asks: [["price","qty"], ...] } }
 *
 * @see 설계 문서 - normalizeFuturesOrderbook 매핑 테이블
 */

import type {
  FuturesExchangeType,
  FuturesOrderbook,
  FuturesOrderbookEntry,
} from '@bitscope/shared';

// ===== 거래소별 선물 오더북 원본 응답 타입 =====

/** Binance 선물 오더북 응답 (GET /fapi/v1/depth) */
interface BinanceFuturesDepthResponse {
  bids: [string, string][]; // [price, quantity]
  asks: [string, string][]; // [price, quantity]
}

/** Bybit 선물 오더북 응답 (GET /v5/market/orderbook?category=linear) */
interface BybitFuturesOrderbookResponse {
  retCode?: number;
  result?: {
    b: [string, string][]; // bids: [price, quantity]
    a: [string, string][]; // asks: [price, quantity]
  };
}

/** OKX 선물 오더북 응답 (GET /api/v5/market/books) */
interface OkxFuturesOrderbookResponse {
  code?: string;
  data?: Array<{
    bids: string[][]; // [price, qty, ...]
    asks: string[][]; // [price, qty, ...]
  }>;
}

/** Gate 선물 오더북 개별 항목 (GET /api/v4/futures/usdt/order_book) */
interface GateFuturesOrderbookItem {
  p: string; // price
  s: number; // size (수량)
}

/** Gate 선물 오더북 응답 */
interface GateFuturesOrderbookResponse {
  bids: GateFuturesOrderbookItem[];
  asks: GateFuturesOrderbookItem[];
}

/** Bitget 선물 오더북 응답 (GET /api/v2/mix/market/depth) */
interface BitgetFuturesOrderbookResponse {
  code?: string;
  data?: {
    bids: [string, string][]; // [price, quantity]
    asks: [string, string][]; // [price, quantity]
  };
}

// ===== 거래소별 정규화 함수 =====

/**
 * 문자열 배열 형태의 오더북 항목을 FuturesOrderbookEntry로 변환한다.
 *
 * Binance, Bybit, OKX, Bitget 등 [price, qty] 배열 형태에 공통 사용한다.
 *
 * @param entries [price, quantity] 형태의 배열
 * @returns 정규화된 오더북 엔트리 배열
 */
function parseStringArrayEntries(entries: string[][]): FuturesOrderbookEntry[] {
  const result: FuturesOrderbookEntry[] = [];

  for (const entry of entries) {
    if (!entry || entry.length < 2) continue;

    const priceStr = entry[0];
    const qtyStr = entry[1];
    if (priceStr === undefined || qtyStr === undefined) continue;

    const price = parseFloat(priceStr) || 0;
    const quantity = parseFloat(qtyStr) || 0;

    if (price > 0 && quantity > 0) {
      result.push({ price, quantity });
    }
  }

  return result;
}

/**
 * Binance 선물 오더북 응답을 정규화한다.
 * 응답 구조: { bids: [["price","qty"], ...], asks: [["price","qty"], ...] }
 */
function normalizeBinanceFuturesOrderbook(rawResponse: unknown): Pick<FuturesOrderbook, 'asks' | 'bids'> {
  const response = rawResponse as BinanceFuturesDepthResponse;

  const asks = response?.asks && Array.isArray(response.asks)
    ? parseStringArrayEntries(response.asks)
    : [];

  const bids = response?.bids && Array.isArray(response.bids)
    ? parseStringArrayEntries(response.bids)
    : [];

  return { asks, bids };
}

/**
 * Bybit 선물 오더북 응답을 정규화한다.
 * 응답 구조: { retCode: 0, result: { b: [["price","qty"], ...], a: [["price","qty"], ...] } }
 */
function normalizeBybitFuturesOrderbook(rawResponse: unknown): Pick<FuturesOrderbook, 'asks' | 'bids'> {
  const response = rawResponse as BybitFuturesOrderbookResponse;

  // retCode !== 0 이면 에러 응답
  if (response?.retCode !== undefined && response.retCode !== 0) {
    return { asks: [], bids: [] };
  }

  const asks = response?.result?.a && Array.isArray(response.result.a)
    ? parseStringArrayEntries(response.result.a)
    : [];

  const bids = response?.result?.b && Array.isArray(response.result.b)
    ? parseStringArrayEntries(response.result.b)
    : [];

  return { asks, bids };
}

/**
 * OKX 선물 오더북 응답을 정규화한다.
 * 응답 구조: { code: "0", data: [{ bids: [["price","qty", ...], ...], asks: [...] }] }
 */
function normalizeOkxFuturesOrderbook(rawResponse: unknown): Pick<FuturesOrderbook, 'asks' | 'bids'> {
  const response = rawResponse as OkxFuturesOrderbookResponse;

  // code !== "0" 이면 에러 응답
  if (response?.code !== undefined && response.code !== '0') {
    return { asks: [], bids: [] };
  }

  if (!response?.data || !Array.isArray(response.data) || response.data.length === 0) {
    return { asks: [], bids: [] };
  }

  const book = response.data[0];

  const asks = book?.asks && Array.isArray(book.asks)
    ? parseStringArrayEntries(book.asks)
    : [];

  const bids = book?.bids && Array.isArray(book.bids)
    ? parseStringArrayEntries(book.bids)
    : [];

  return { asks, bids };
}

/**
 * Gate 선물 오더북 응답을 정규화한다.
 * 응답 구조: { bids: [{ p: "price", s: size }, ...], asks: [{ p: "price", s: size }, ...] }
 *
 * Gate 선물 API는 Spot과 달리 {p, s} 객체 형태를 사용한다.
 */
function normalizeGateFuturesOrderbook(rawResponse: unknown): Pick<FuturesOrderbook, 'asks' | 'bids'> {
  const response = rawResponse as GateFuturesOrderbookResponse;

  const asks: FuturesOrderbookEntry[] = [];
  const bids: FuturesOrderbookEntry[] = [];

  if (response?.asks && Array.isArray(response.asks)) {
    for (const item of response.asks) {
      const price = parseFloat(item.p) || 0;
      const quantity = typeof item.s === 'number' ? item.s : (parseFloat(String(item.s)) || 0);

      if (price > 0 && quantity > 0) {
        asks.push({ price, quantity });
      }
    }
  }

  if (response?.bids && Array.isArray(response.bids)) {
    for (const item of response.bids) {
      const price = parseFloat(item.p) || 0;
      const quantity = typeof item.s === 'number' ? item.s : (parseFloat(String(item.s)) || 0);

      if (price > 0 && quantity > 0) {
        bids.push({ price, quantity });
      }
    }
  }

  return { asks, bids };
}

/**
 * Bitget 선물 오더북 응답을 정규화한다.
 * 응답 구조: { code: "00000", data: { bids: [["price","qty"], ...], asks: [["price","qty"], ...] } }
 */
function normalizeBitgetFuturesOrderbook(rawResponse: unknown): Pick<FuturesOrderbook, 'asks' | 'bids'> {
  const response = rawResponse as BitgetFuturesOrderbookResponse;

  // code !== "00000" 이면 에러 응답
  if (response?.code !== undefined && response.code !== '00000') {
    return { asks: [], bids: [] };
  }

  const asks = response?.data?.asks && Array.isArray(response.data.asks)
    ? parseStringArrayEntries(response.data.asks)
    : [];

  const bids = response?.data?.bids && Array.isArray(response.data.bids)
    ? parseStringArrayEntries(response.data.bids)
    : [];

  return { asks, bids };
}

// ===== 공개 API =====

/**
 * 거래소별 선물 오더북 응답을 정규화한다.
 *
 * FuturesExchangeType에 따라 적절한 거래소별 정규화 함수를 호출하여
 * 통일된 FuturesOrderbook 형태로 변환한다.
 *
 * @param exchange 거래소 식별자
 * @param rawResponse 거래소 선물 오더북 API 원본 응답
 * @returns 정규화된 선물 오더북 데이터
 * @throws {Error} 지원하지 않는 거래소인 경우
 */
export function normalizeFuturesOrderbook(
  exchange: FuturesExchangeType,
  rawResponse: unknown,
): FuturesOrderbook {
  let orderbook: Pick<FuturesOrderbook, 'asks' | 'bids'>;

  switch (exchange) {
    case 'binance':
      orderbook = normalizeBinanceFuturesOrderbook(rawResponse);
      break;
    case 'bybit':
      orderbook = normalizeBybitFuturesOrderbook(rawResponse);
      break;
    case 'okx':
      orderbook = normalizeOkxFuturesOrderbook(rawResponse);
      break;
    case 'gate':
      orderbook = normalizeGateFuturesOrderbook(rawResponse);
      break;
    case 'bitget':
      orderbook = normalizeBitgetFuturesOrderbook(rawResponse);
      break;
    default:
      throw new Error(`선물 오더북을 지원하지 않는 거래소입니다: ${exchange}`);
  }

  // 매도 호가(asks)는 가격 오름차순 정렬
  orderbook.asks.sort((a, b) => a.price - b.price);

  // 매수 호가(bids)는 가격 내림차순 정렬
  orderbook.bids.sort((a, b) => b.price - a.price);

  return {
    exchange,
    symbol: '',
    asks: orderbook.asks,
    bids: orderbook.bids,
    timestamp: Date.now(),
  };
}
