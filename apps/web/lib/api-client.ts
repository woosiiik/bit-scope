/**
 * 거래소 API 클라이언트 (ExchangeApiClient)
 *
 * TanStack Query 기반의 거래소 API 호출 클라이언트로,
 * 서명 생성 -> Next.js Route Handler 호출 -> 응답 처리 파이프라인을 통합한다.
 *
 * 핵심 흐름:
 * 1. 암호화된 API Key를 sessionStorage에서 복호화
 * 2. 거래소별 서명기(ExchangeSignerFactory)를 통해 요청 서명 생성
 * 3. Next.js Route Handler(/api/exchange/[exchange]/...)에 서명된 요청 전달
 * 4. Route Handler가 거래소 API에 릴레이 후 정규화된 응답 반환
 *
 * 보안 원칙:
 * - API Key(Secret Key)는 절대 서버로 전송되지 않는다.
 * - 클라이언트에서 서명된 요청만 Route Handler에 전달한다.
 *
 * @see 요구사항 2.4, 2.5, 2.11, NF1.3
 * @see 설계 문서 3.1.5 ExchangeApiClient
 */

import type {
  ApiKeyPair,
  ExchangeType,
  Holding,
  Orderbook,
  SignedRequest,
  Ticker,
  FuturesExchangeType,
  FuturesOrderbook,
  FuturesPosition,
  FuturesOpenOrder,
} from '@bitscope/shared';
import { EXCHANGE_CONFIGS, EXCHANGE_ENDPOINTS, FOREIGN_EXCHANGES, DEX_EXCHANGES } from '@bitscope/shared';
import { createSigner } from './exchange/signer-factory';

/** Futures 잔고 지원 거래소 목록 (Spot과 별도로 Futures 잔고를 조회해야 하는 거래소) */
const FUTURES_SUPPORTED_EXCHANGES: readonly ExchangeType[] = ['binance', 'gate', 'bitget'] as const;

/** Futures 포지션/오더 지원 거래소 목록 */
const FUTURES_POSITION_EXCHANGES: readonly ExchangeType[] = ['binance', 'bybit', 'okx', 'gate', 'bitget', 'hyperliquid'] as const;

// ===== Route Handler 응답 타입 =====

/** Route Handler의 공통 응답 구조 */
export interface ApiResponse<T> {
  /** 성공 여부 */
  success: boolean;
  /** 응답 데이터 (성공 시) */
  data?: T;
  /** 캐시 히트 여부 */
  cached?: boolean;
  /** 스테일 데이터 여부 */
  stale?: boolean;
  /** 데이터의 저장 시각 (밀리초 타임스탬프) */
  dataTimestamp?: number | null;
  /** 오류 정보 (실패 시) */
  error?: {
    message: string;
    code: string;
    statusCode?: number;
  };
}

/** 지갑별 잔고 항목 */
export interface WalletBalanceItem {
  /** 지갑 이름 (예: 'Spot', 'Futures', 'Margin', 'Earn', 'Funding', 'Unified') */
  name: string;
  /** 해당 지갑의 USDT 환산 잔고 */
  balanceUsdt: number;
}

/**
 * 거래소별 지갑 요약 정보
 *
 * 해외 거래소의 전체 자산(Spot + Futures + Margin + Earn 등)을 USDT 합계로 제공한다.
 */
export interface WalletSummary {
  /** 전체 자산 USDT 환산 합계 */
  totalEquityUsdt: number;
  /** 지갑별 USDT 잔고 목록 */
  wallets: WalletBalanceItem[];
}

/** 잔고 조회 응답 데이터 */
export interface BalanceResponse {
  /** 거래소 식별자 */
  exchange: ExchangeType;
  /** 보유 코인 목록 */
  holdings: Holding[];
  /** 원화(KRW) 잔고 */
  krwBalance: number;
  /** 응답 수신 시각 (밀리초 타임스탬프) */
  timestamp: number;
  /** 지갑별 요약 (해외 거래소 전용, USDT 기준) */
  walletSummary?: WalletSummary;
}

/** 시세 조회 응답 데이터 */
export interface TickerResponse {
  /** 거래소 식별자 */
  exchange: ExchangeType;
  /** 시세 목록 */
  tickers: Ticker[];
  /** 응답 수신 시각 (밀리초 타임스탬프) */
  timestamp: number;
}

/** 호가 조회 응답 데이터 */
export interface OrderbookResponse {
  /** 거래소 식별자 */
  exchange: ExchangeType;
  /** 호가 정보 */
  orderbook: Orderbook;
  /** 응답 수신 시각 (밀리초 타임스탬프) */
  timestamp: number;
}

/** 주문 내역 항목 */
export interface OrderHistoryItem {
  /** 주문 고유 ID */
  orderId: string;
  /** 코인 심볼 */
  symbol: string;
  /** 주문 유형 (매수/매도) */
  side: 'buy' | 'sell';
  /** 주문 가격 */
  price: number;
  /** 주문 수량 */
  quantity: number;
  /** 체결 수량 */
  executedQuantity: number;
  /** 주문 상태 */
  status: 'open' | 'filled' | 'partially_filled' | 'cancelled';
  /** 주문 시각 */
  orderedAt: Date;
}

/** 주문 내역 조회 응답 데이터 */
export interface OrderHistoryResponse {
  /** 거래소 식별자 */
  exchange: ExchangeType;
  /** 주문 내역 목록 */
  orders: OrderHistoryItem[];
  /** 응답 수신 시각 (밀리초 타임스탬프) */
  timestamp: number;
}

/** 주문 내역 조회 파라미터 */
export interface OrderHistoryParams {
  /** 코인 심볼 (선택) */
  symbol?: string;
  /** 조회 시작일 (선택) */
  startDate?: Date;
  /** 조회 종료일 (선택) */
  endDate?: Date;
  /** 조회 건수 제한 (선택) */
  limit?: number;
}

// ===== API 클라이언트 오류 =====

/**
 * 거래소 API 클라이언트 오류
 *
 * API 호출 과정에서 발생하는 다양한 오류를 구분하기 위한 클래스이다.
 */
export class ExchangeApiError extends Error {
  /** 오류 코드 */
  readonly code: string;
  /** 거래소 식별자 */
  readonly exchange: ExchangeType;
  /** HTTP 상태 코드 (선택) */
  readonly statusCode?: number;

  constructor(
    message: string,
    code: string,
    exchange: ExchangeType,
    statusCode?: number,
  ) {
    super(message);
    this.name = 'ExchangeApiError';
    this.code = code;
    this.exchange = exchange;
    this.statusCode = statusCode;
  }
}

// ===== Route Handler 경로 생성 =====

/**
 * 거래소 API Route Handler의 기본 경로를 생성한다.
 *
 * @param exchange 거래소 식별자
 * @param endpoint API 엔드포인트 ('balance' | 'ticker' | 'orderbook' | 'orders')
 * @returns Route Handler 경로 문자열
 */
function buildRouteHandlerUrl(
  exchange: ExchangeType,
  endpoint: 'balance' | 'ticker' | 'orderbook' | 'orders',
): string {
  return `/api/exchange/${exchange}/${endpoint}`;
}

// ===== USDT/KRW 환율 =====

/** USDT/KRW 환율 캐시 */
let usdtKrwRateCache: { rate: number; fetchedAt: number } | null = null;

/** USDT/KRW 환율 캐시 유효 시간: 1분 */
const USDT_KRW_RATE_CACHE_TTL = 60 * 1000;

/**
 * 업비트 공개 API에서 USDT/KRW 환율을 조회한다.
 *
 * 업비트의 KRW-USDT 마켓 현재가를 기반으로 한다.
 * 결과는 1분간 캐싱하여 불필요한 API 호출을 줄인다.
 * 조회 실패 시 0을 반환한다.
 *
 * @returns USDT/KRW 환율 (예: 1400)
 */
export async function getUsdtKrwRate(): Promise<number> {
  // 캐시 확인
  if (usdtKrwRateCache && Date.now() - usdtKrwRateCache.fetchedAt < USDT_KRW_RATE_CACHE_TTL) {
    return usdtKrwRateCache.rate;
  }

  try {
    const response = await fetch('https://api.upbit.com/v1/ticker?markets=KRW-USDT', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return usdtKrwRateCache?.rate ?? 0;
    }

    const data = await response.json();
    if (Array.isArray(data) && data.length > 0 && typeof data[0].trade_price === 'number') {
      const rate = data[0].trade_price;
      usdtKrwRateCache = { rate, fetchedAt: Date.now() };
      return rate;
    }

    return usdtKrwRateCache?.rate ?? 0;
  } catch {
    return usdtKrwRateCache?.rate ?? 0;
  }
}

/**
 * 해외 거래소인지 확인한다 (USDT 기준 잔고 → KRW 환산 필요).
 */
function isForeignExchange(exchange: ExchangeType): boolean {
  return (FOREIGN_EXCHANGES as readonly string[]).includes(exchange)
    || (DEX_EXCHANGES as readonly string[]).includes(exchange);
}

// ===== 유효 마켓 심볼 필터링 =====

/** 거래소별 KRW 마켓 심볼 캐시 (세션 동안 유지) */
const krwMarketCache = new Map<ExchangeType, { symbols: Set<string>; fetchedAt: number }>();

/** 캐시 유효 시간: 5분 */
const KRW_MARKET_CACHE_TTL = 5 * 60 * 1000;

/**
 * 거래소의 유효 마켓에 상장된 심볼만 필터링한다.
 *
 * 거래소의 전체 마켓 목록을 조회하여 활성 마켓에 존재하는 심볼만 반환한다.
 * 국내 거래소는 KRW 마켓, 해외 거래소는 USDT 마켓 기준으로 필터링한다.
 * 에어드랍 등으로 받은 비상장 코인을 걸러내는 데 사용한다.
 * 결과는 5분간 캐싱하여 불필요한 API 호출을 줄인다.
 *
 * @param exchange 거래소 식별자
 * @param symbols 필터링할 심볼 배열
 * @returns 유효 마켓에 상장된 심볼 배열
 */
async function getValidKrwSymbols(
  exchange: ExchangeType,
  symbols: string[],
): Promise<string[]> {
  // 캐시 확인
  const cached = krwMarketCache.get(exchange);
  if (cached && Date.now() - cached.fetchedAt < KRW_MARKET_CACHE_TTL) {
    return symbols.filter((s) => cached.symbols.has(s));
  }

  try {
    // 거래소 공개 API로 전체 마켓 목록을 조회한다.
    // 브라우저 환경에서 CORS 오류가 발생할 수 있으므로 try-catch로 감싼다.
    const config = EXCHANGE_CONFIGS[exchange];
    const endpoint = EXCHANGE_ENDPOINTS[exchange].markets;
    // 일부 해외 거래소 markets 엔드포인트는 쿼리 파라미터가 필수
    let marketsSuffix = '';
    if (exchange === 'okx') {
      marketsSuffix = '?instType=SPOT';
    } else if (exchange === 'bybit') {
      marketsSuffix = '?category=spot';
    }
    const url = `${config.restBaseUrl}${endpoint}${marketsSuffix}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      // 마켓 목록 조회 실패 시 모든 심볼을 유효한 것으로 간주
      return symbols;
    }

    const markets = await response.json();
    const krwSymbols = new Set<string>();

    if (exchange === 'upbit' && Array.isArray(markets)) {
      // 업비트: [{ market: "KRW-BTC", ... }, ...]
      for (const m of markets) {
        if (typeof m.market === 'string' && m.market.startsWith('KRW-')) {
          krwSymbols.add(m.market.split('-')[1]);
        }
      }
    } else if (exchange === 'bithumb' && Array.isArray(markets)) {
      // 빗썸 v2: [{ market: "KRW-BTC", ... }, ...] (업비트와 동일한 형식)
      for (const m of markets) {
        if (typeof m.market === 'string' && m.market.startsWith('KRW-')) {
          krwSymbols.add(m.market.split('-')[1]);
        }
      }
    } else if (exchange === 'coinone') {
      // 코인원 v2: { markets: [{ target_currency: "BTC", ... }, ...] }
      // 또는 배열 직접 반환 형태
      const marketList = Array.isArray(markets) ? markets : markets?.markets;
      if (Array.isArray(marketList)) {
        for (const m of marketList) {
          if (m.target_currency) {
            krwSymbols.add(m.target_currency.toUpperCase());
          }
        }
      }
    } else if (exchange === 'binance') {
      // 바이낸스: { symbols: [{ symbol: "BTCUSDT", status: "TRADING", ... }, ...] }
      const symbolList = markets?.symbols;
      if (Array.isArray(symbolList)) {
        for (const s of symbolList) {
          if (
            s.quoteAsset === 'USDT' &&
            s.status === 'TRADING' &&
            s.baseAsset
          ) {
            krwSymbols.add(s.baseAsset.toUpperCase());
          }
        }
      }
    } else if (exchange === 'bybit') {
      // 바이빗: { retCode: 0, result: { list: [{ symbol: "BTCUSDT", status: "Trading", baseCoin: "BTC", quoteCoin: "USDT", ... }] } }
      const resultList = markets?.result?.list;
      if (Array.isArray(resultList)) {
        for (const s of resultList) {
          if (
            s.quoteCoin === 'USDT' &&
            s.status === 'Trading' &&
            s.baseCoin
          ) {
            krwSymbols.add(s.baseCoin.toUpperCase());
          }
        }
      }
    } else if (exchange === 'okx') {
      // OKX: { code: "0", data: [{ instId: "BTC-USDT", state: "live", baseCcy: "BTC", quoteCcy: "USDT", ... }] }
      const dataList = markets?.data;
      if (Array.isArray(dataList)) {
        for (const s of dataList) {
          if (
            s.quoteCcy === 'USDT' &&
            s.state === 'live' &&
            s.baseCcy
          ) {
            krwSymbols.add(s.baseCcy.toUpperCase());
          }
        }
      }
    } else if (exchange === 'gate') {
      // Gate.io: 배열 직접 반환 [{ id: "BTC_USDT", base: "BTC", quote: "USDT", trade_status: "tradable", ... }]
      if (Array.isArray(markets)) {
        for (const s of markets) {
          if (
            s.quote === 'USDT' &&
            s.trade_status === 'tradable' &&
            s.base
          ) {
            krwSymbols.add(s.base.toUpperCase());
          }
        }
      }
    } else if (exchange === 'bitget') {
      // Bitget: { code: "00000", data: [{ symbol: "BTCUSDT", ... }] }
      const dataList = markets?.data;
      if (Array.isArray(dataList)) {
        for (const s of dataList) {
          if (
            s.symbol?.endsWith('USDT') &&
            s.symbol
          ) {
            const baseCoin = s.symbol.replace('USDT', '');
            if (baseCoin) {
              krwSymbols.add(baseCoin.toUpperCase());
            }
          }
        }
      }
    } else if (exchange === 'lbank') {
      // LBank: { result: "true", data: ["btc_usdt", "eth_usdt", ...] }
      const pairList = markets?.data;
      if (Array.isArray(pairList)) {
        for (const pair of pairList) {
          if (typeof pair === 'string' && pair.endsWith('_usdt')) {
            const base = pair.split('_')[0];
            if (base) {
              krwSymbols.add(base.toUpperCase());
            }
          }
        }
      }
    } else if (exchange === 'hyperliquid') {
      // 하이퍼리퀴드: POST /info { type: "meta" }로 마켓 목록 조회
      // 응답: { universe: [{ name: "BTC", ... }, ...] }
      // 하이퍼리퀴드는 별도 마켓 목록 API가 POST이므로 여기서 직접 호출
      try {
        const metaResponse = await fetch(`${config.restBaseUrl}/info`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'meta' }),
        });
        if (metaResponse.ok) {
          const metaData = await metaResponse.json();
          if (metaData?.universe && Array.isArray(metaData.universe)) {
            for (const s of metaData.universe) {
              if (s.name) {
                krwSymbols.add(s.name.toUpperCase());
              }
            }
          }
        }
      } catch {
        // 마켓 조회 실패 시 모든 심볼을 유효한 것으로 간주
        return symbols;
      }
    }

    // 캐시 저장
    if (krwSymbols.size > 0) {
      krwMarketCache.set(exchange, { symbols: krwSymbols, fetchedAt: Date.now() });
    }

    return symbols.filter((s) => krwSymbols.has(s));
  } catch {
    // CORS 오류 또는 네트워크 오류 시 모든 심볼을 유효한 것으로 간주
    return symbols;
  }
}

// ===== 서명 생성 =====

/**
 * 거래소별 서명 생성기를 통해 잔고 조회 요청에 대한 서명을 생성한다.
 *
 * @param exchange 거래소 식별자
 * @param apiKey 복호화된 API Key 쌍
 * @returns 서명된 요청
 */
export function signBalanceRequest(
  exchange: ExchangeType,
  apiKey: ApiKeyPair,
): SignedRequest {
  const signer = createSigner(exchange);

  // 하이퍼리퀴드는 서명 없이 POST /info로 직접 요청한다
  if (exchange === 'hyperliquid') {
    return signer.signRequest({
      method: 'POST',
      endpoint: EXCHANGE_ENDPOINTS[exchange].balance,
      apiKey,
    });
  }

  // 코인원 private API는 POST만 지원하므로 거래소별로 메서드를 분기한다.
  // 업비트, 빗썸 v2, 바이낸스, 바이빗은 GET 방식으로 전체 잔고를 반환한다.
  const method = exchange === 'coinone' ? 'POST' : 'GET';

  // 바이빗 잔고 조회 시 accountType=UNIFIED 쿼리 파라미터 필수
  const queryParams = exchange === 'bybit'
    ? { accountType: 'UNIFIED' }
    : undefined;

  return signer.signRequest({
    method,
    endpoint: EXCHANGE_ENDPOINTS[exchange].balance,
    queryParams,
    apiKey,
  });
}

/**
 * 거래소별 서명 생성기를 통해 Futures 잔고 조회 요청에 대한 서명을 생성한다.
 *
 * 바이낸스, Gate.io, Bitget에 대해서만 Futures 잔고를 조회한다.
 * - 바이낸스: GET /fapi/v2/balance (fapi.binance.com 도메인)
 * - Gate.io: GET /api/v4/futures/usdt/accounts (같은 도메인)
 * - Bitget: GET /api/v2/mix/account/accounts?productType=USDT-FUTURES (같은 도메인)
 *
 * 서명 방식은 각 거래소의 Spot과 동일하며, 엔드포인트와 Base URL만 다르다.
 *
 * @param exchange 거래소 식별자
 * @param apiKey 복호화된 API Key 쌍
 * @returns 서명된 요청, 또는 Futures 미지원 거래소인 경우 null
 */
export function signFuturesBalanceRequest(
  exchange: ExchangeType,
  apiKey: ApiKeyPair,
): SignedRequest | null {
  const futuresEndpoint = EXCHANGE_ENDPOINTS[exchange].futures;

  if (!futuresEndpoint) {
    return null;
  }

  if (!(FUTURES_SUPPORTED_EXCHANGES as readonly string[]).includes(exchange)) {
    return null;
  }

  const signer = createSigner(exchange);

  // Bitget Futures는 productType=USDT-FUTURES 쿼리 파라미터가 필수
  const queryParams = exchange === 'bitget'
    ? { productType: 'USDT-FUTURES' }
    : undefined;

  return signer.signRequest({
    method: 'GET',
    endpoint: futuresEndpoint,
    queryParams,
    apiKey,
  });
}

/**
 * 거래소별 서명 생성기를 통해 선물 포지션 조회 요청에 대한 서명을 생성한다.
 *
 * 바이낸스, Gate.io, Bitget에 대해서만 선물 포지션을 조회한다.
 * - 바이낸스: GET /fapi/v2/positionRisk (fapi.binance.com 도메인)
 * - Gate.io: GET /api/v4/futures/usdt/positions (같은 도메인)
 * - Bitget: GET /api/v2/mix/position/all-position?productType=USDT-FUTURES (같은 도메인)
 *
 * @param exchange 거래소 식별자
 * @param apiKey 복호화된 API Key 쌍
 * @returns 서명된 요청, 또는 미지원 거래소인 경우 null
 */
export function signFuturesPositionsRequest(
  exchange: ExchangeType,
  apiKey: ApiKeyPair,
): SignedRequest | null {
  const endpoint = EXCHANGE_ENDPOINTS[exchange].futuresPositions;

  if (!endpoint) {
    return null;
  }

  if (!(FUTURES_POSITION_EXCHANGES as readonly string[]).includes(exchange)) {
    return null;
  }

  // 하이퍼리퀴드: signer가 clearinghouseState POST 요청을 생성 (포지션 포함)
  if (exchange === 'hyperliquid') {
    const signer = createSigner(exchange);
    return signer.signRequest({ method: 'POST', endpoint, apiKey });
  }

  const signer = createSigner(exchange);

  // 거래소별 필수 쿼리 파라미터
  let queryParams: Record<string, string> | undefined;
  if (exchange === 'bitget') {
    queryParams = { productType: 'USDT-FUTURES' };
  } else if (exchange === 'okx') {
    queryParams = { instType: 'SWAP' };
  } else if (exchange === 'bybit') {
    queryParams = { category: 'linear' };
  }

  return signer.signRequest({
    method: 'GET',
    endpoint,
    queryParams,
    apiKey,
  });
}

/**
 * 거래소별 서명 생성기를 통해 선물 오픈오더 조회 요청에 대한 서명을 생성한다.
 *
 * 바이낸스, Gate.io, Bitget에 대해서만 선물 오픈오더를 조회한다.
 * - 바이낸스: GET /fapi/v1/openOrders (fapi.binance.com 도메인)
 * - Gate.io: GET /api/v4/futures/usdt/orders?status=open (같은 도메인)
 * - Bitget: GET /api/v2/mix/order/orders-pending?productType=USDT-FUTURES (같은 도메인)
 *
 * @param exchange 거래소 식별자
 * @param apiKey 복호화된 API Key 쌍
 * @returns 서명된 요청, 또는 미지원 거래소인 경우 null
 */
export function signFuturesOpenOrdersRequest(
  exchange: ExchangeType,
  apiKey: ApiKeyPair,
): SignedRequest | null {
  const endpoint = EXCHANGE_ENDPOINTS[exchange].futuresOpenOrders;

  if (!endpoint) {
    return null;
  }

  if (!(FUTURES_POSITION_EXCHANGES as readonly string[]).includes(exchange)) {
    return null;
  }

  // 하이퍼리퀴드: openOrders type으로 POST 요청 직접 생성
  if (exchange === 'hyperliquid') {
    return {
      url: `${EXCHANGE_CONFIGS[exchange].restBaseUrl}/info`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'openOrders', user: apiKey.accessKey }),
    };
  }

  const signer = createSigner(exchange);

  // 거래소별 필수 쿼리 파라미터
  let queryParams: Record<string, string> | undefined;
  if (exchange === 'gate') {
    queryParams = { status: 'open' };
  } else if (exchange === 'bitget') {
    queryParams = { productType: 'USDT-FUTURES' };
  } else if (exchange === 'okx') {
    queryParams = { instType: 'SWAP' };
  } else if (exchange === 'bybit') {
    queryParams = { category: 'linear' };
  }

  return signer.signRequest({
    method: 'GET',
    endpoint,
    queryParams,
    apiKey,
  });
}

/**
 * 거래소별 서명 생성기를 통해 주문 내역 조회 요청에 대한 서명을 생성한다.
 *
 * @param exchange 거래소 식별자
 * @param apiKey 복호화된 API Key 쌍
 * @param params 주문 내역 조회 파라미터
 * @returns 서명된 요청
 */
export function signOrderHistoryRequest(
  exchange: ExchangeType,
  apiKey: ApiKeyPair,
  params?: OrderHistoryParams,
): SignedRequest {
  const signer = createSigner(exchange);

  // 코인원 private API는 POST만 지원하므로 거래소별로 메서드를 분기한다.
  const method = exchange === 'coinone' ? 'POST' : 'GET';

  const queryParams: Record<string, string> = {};
  if (params?.symbol) {
    queryParams.symbol = params.symbol;
  }
  if (params?.limit) {
    queryParams.limit = String(params.limit);
  }

  // OKX 주문 내역 조회 시 instType=SPOT 쿼리 파라미터 필수
  if (exchange === 'okx') {
    queryParams.instType = 'SPOT';
  }

  // 코인원은 POST body로, 업비트/빗썸은 query parameter로 파라미터를 전달한다.
  const body = exchange === 'coinone' && Object.keys(queryParams).length > 0
    ? (queryParams as Record<string, unknown>)
    : undefined;

  return signer.signRequest({
    method,
    endpoint: EXCHANGE_ENDPOINTS[exchange].orders,
    queryParams: exchange !== 'coinone' && Object.keys(queryParams).length > 0 ? queryParams : undefined,
    body,
    apiKey,
  });
}

// ===== API 호출 함수 =====

/**
 * Route Handler의 응답을 파싱하고 오류를 처리한다.
 *
 * @param response fetch 응답
 * @param exchange 거래소 식별자
 * @returns 파싱된 API 응답
 * @throws {ExchangeApiError} API 호출 실패 시
 */
async function parseApiResponse<T>(
  response: Response,
  exchange: ExchangeType,
): Promise<ApiResponse<T>> {
  let body: ApiResponse<T>;

  try {
    body = await response.json();
  } catch {
    throw new ExchangeApiError(
      '응답 데이터를 파싱할 수 없습니다.',
      'PARSE_ERROR',
      exchange,
      response.status,
    );
  }

  if (!body.success) {
    throw new ExchangeApiError(
      body.error?.message ?? '거래소 API 호출에 실패했습니다.',
      body.error?.code ?? 'UNKNOWN_ERROR',
      exchange,
      body.error?.statusCode ?? response.status,
    );
  }

  return body;
}

/**
 * 거래소의 Futures 잔고(USDT 합계)를 조회한다.
 *
 * 바이낸스/Gate.io/Bitget에 대해서만 Futures 잔고를 조회한다.
 * Futures용 서명을 생성하여 동일한 balance Route Handler에 전달하고,
 * Route Handler에서 Futures API로 릴레이된 응답의 USDT 합계를 반환한다.
 *
 * Futures 조회 실패 시 0을 반환한다 (Graceful Degradation).
 *
 * @param exchange 거래소 식별자
 * @param apiKey 복호화된 API Key 쌍
 * @returns Futures 총 잔고 (USDT). 미지원 거래소이거나 실패 시 0.
 */
async function fetchFuturesBalance(
  exchange: ExchangeType,
  apiKey: ApiKeyPair,
): Promise<number> {
  const futuresSignedRequest = signFuturesBalanceRequest(exchange, apiKey);
  if (!futuresSignedRequest) {
    return 0;
  }

  try {
    const url = buildRouteHandlerUrl(exchange, 'balance');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Balance-Type': 'futures',
      },
      body: JSON.stringify(futuresSignedRequest),
    });

    if (!response.ok) {
      return 0;
    }

    const body = await response.json();
    if (!body.success || !body.data) {
      return 0;
    }

    // Route Handler에서 futuresBalanceUsdt 필드로 반환된다
    return typeof body.data.futuresBalanceUsdt === 'number'
      ? body.data.futuresBalanceUsdt
      : 0;
  } catch {
    // Futures 조회 실패 시 0을 반환한다 (Graceful Degradation)
    return 0;
  }
}

/**
 * 거래소 잔고를 조회한다.
 *
 * 클라이언트에서 서명된 요청을 생성하여 Next.js Route Handler에 전달하고,
 * 정규화된 잔고 데이터를 반환한다.
 *
 * 바이낸스/Gate.io/Bitget의 경우 Spot과 Futures 잔고를 병렬로 조회하여
 * walletSummary에 Spot + Futures 분리 표시한다.
 *
 * @param exchange 거래소 식별자
 * @param apiKey 복호화된 API Key 쌍
 * @returns 정규화된 잔고 데이터
 * @throws {ExchangeApiError} API 호출 실패 시
 */
export async function fetchBalance(
  exchange: ExchangeType,
  apiKey: ApiKeyPair,
): Promise<BalanceResponse> {
  // Futures 잔고를 지원하는 거래소인지 확인
  const supportsFutures = (FUTURES_SUPPORTED_EXCHANGES as readonly string[]).includes(exchange);

  // 1. Spot 서명 생성
  const signedRequest = signBalanceRequest(exchange, apiKey);

  // 2. Spot 잔고 조회 (Futures 지원 거래소는 Futures도 병렬 조회)
  const url = buildRouteHandlerUrl(exchange, 'balance');
  const spotPromise = fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signedRequest),
  });

  // Futures 잔고 병렬 조회 (바이낸스/Gate/Bitget만)
  const futuresPromise = supportsFutures
    ? fetchFuturesBalance(exchange, apiKey)
    : Promise.resolve(0);

  // Spot과 Futures를 병렬로 대기
  const [response, futuresBalanceUsdt] = await Promise.all([spotPromise, futuresPromise]);

  // 3. Spot 응답 파싱 및 오류 처리
  const apiResponse = await parseApiResponse<BalanceResponse>(response, exchange);

  if (!apiResponse.data) {
    throw new ExchangeApiError(
      '잔고 데이터가 비어있습니다.',
      'EMPTY_RESPONSE',
      exchange,
    );
  }

  const balanceData = apiResponse.data;

  // 4. 보유 코인의 현재가를 ticker API로 조회하여 합침
  // 거래소 잔고 API는 현재가를 반환하지 않으므로 별도 조회 필요
  if (balanceData.holdings.length > 0) {
    try {
      // 유효 마켓 심볼만 필터링하여 ticker 조회
      // 잔고에 에어드랍 등으로 받은 비상장 코인이 포함될 수 있으므로
      // 먼저 거래소의 마켓 목록을 조회하여 유효한 심볼만 추출
      const allSymbols = balanceData.holdings.map((h) => h.symbol);
      const validSymbols = await getValidKrwSymbols(exchange, allSymbols);

      if (validSymbols.length > 0) {
        const tickerData = await fetchTicker(exchange, validSymbols);

        // ticker 데이터를 심볼별 맵으로 변환
        const priceMap = new Map<string, number>();
        for (const ticker of tickerData.tickers) {
          priceMap.set(ticker.symbol, ticker.currentPrice);
        }

        // 현재가를 합쳐서 평가금액, 손익, 수익률 재계산
        for (const holding of balanceData.holdings) {
          const currentPrice = priceMap.get(holding.symbol);
          if (currentPrice && currentPrice > 0) {
            holding.currentPrice = currentPrice;
            const totalBalance = holding.balance + holding.lockedBalance;
            holding.evaluationAmount = totalBalance * currentPrice;
            const investmentAmount = totalBalance * holding.avgBuyPrice;
            holding.profitLoss = holding.evaluationAmount - investmentAmount;
            holding.profitLossRate = investmentAmount > 0
              ? (holding.profitLoss / investmentAmount) * 100
              : 0;
          }
        }
      }

      // 유효 마켓에 없는 코인은 대시보드에서 제외
      // (에어드랍, 상장폐지 등으로 거래 불가능한 코인)
      const validSymbolSet = new Set(validSymbols);
      balanceData.holdings = balanceData.holdings.filter(
        (h) => validSymbolSet.has(h.symbol),
      );
    } catch {
      // ticker 조회 실패 시 매수평균가를 현재가로 유지 (graceful degradation)
    }
  }

  // 5. Futures 잔고를 walletSummary에 병합
  // Spot walletSummary는 normalizer에서 이미 생성되어 있으므로
  // Futures 잔고가 있으면 walletSummary에 Futures 항목을 추가한다.
  if (supportsFutures) {
    const existingWalletSummary = balanceData.walletSummary;
    const spotUsdt = existingWalletSummary?.totalEquityUsdt ?? 0;

    balanceData.walletSummary = {
      totalEquityUsdt: spotUsdt + futuresBalanceUsdt,
      wallets: [
        ...(existingWalletSummary?.wallets ?? []),
        { name: 'Futures', balanceUsdt: futuresBalanceUsdt },
      ],
    };
  }

  // 6. 해외 거래소의 USDT 기준 잔고를 KRW로 환산
  // 해외 거래소(바이낸스, 바이빗, OKX, Gate.io, Bitget)는 USDT 기준 시세이므로
  // 대시보드에서 국내 거래소(KRW 기준)와 합산하려면 KRW 환산이 필요하다.
  if (isForeignExchange(exchange)) {
    try {
      const usdtKrwRate = await getUsdtKrwRate();
      if (usdtKrwRate > 0) {
        // 보유 코인의 평가금액, 현재가, 매수평균가, 손익을 KRW로 환산
        for (const holding of balanceData.holdings) {
          holding.currentPrice = holding.currentPrice * usdtKrwRate;
          holding.avgBuyPrice = holding.avgBuyPrice * usdtKrwRate;
          holding.evaluationAmount = holding.evaluationAmount * usdtKrwRate;
          holding.profitLoss = holding.profitLoss * usdtKrwRate;
          // 수익률은 비율이므로 환산 불필요 (USDT든 KRW든 동일)
        }
        // USDT 잔고(krwBalance 필드에 임시 저장됨)도 KRW로 환산
        balanceData.krwBalance = balanceData.krwBalance * usdtKrwRate;
      }
    } catch {
      // USDT/KRW 환율 조회 실패 시 USDT 기준 금액 그대로 유지 (graceful degradation)
    }
  }

  return balanceData;
}

/**
 * 거래소 시세(Ticker)를 조회한다.
 *
 * 시세 데이터는 공개 API이므로 서명이 불필요하다.
 * Route Handler의 GET 엔드포인트를 통해 조회한다.
 *
 * @param exchange 거래소 식별자
 * @param symbols 조회할 코인 심볼 배열 (선택. 미지정 시 기본 코인)
 * @returns 정규화된 시세 데이터
 * @throws {ExchangeApiError} API 호출 실패 시
 */
export async function fetchTicker(
  exchange: ExchangeType,
  symbols?: string[],
): Promise<TickerResponse> {
  const url = buildRouteHandlerUrl(exchange, 'ticker');
  const searchParams = new URLSearchParams();
  if (symbols && symbols.length > 0) {
    searchParams.set('symbols', symbols.join(','));
  }

  const fullUrl = searchParams.toString() ? `${url}?${searchParams.toString()}` : url;

  const response = await fetch(fullUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  const apiResponse = await parseApiResponse<TickerResponse>(response, exchange);

  if (!apiResponse.data) {
    throw new ExchangeApiError(
      '시세 데이터가 비어있습니다.',
      'EMPTY_RESPONSE',
      exchange,
    );
  }

  return apiResponse.data;
}

/**
 * 거래소 호가(Orderbook)를 조회한다.
 *
 * 호가 데이터는 공개 API이므로 서명이 불필요하다.
 * Route Handler의 GET 엔드포인트를 통해 조회한다.
 *
 * @param exchange 거래소 식별자
 * @param symbol 조회할 코인 심볼
 * @returns 정규화된 호가 데이터
 * @throws {ExchangeApiError} API 호출 실패 시
 */
export async function fetchOrderbook(
  exchange: ExchangeType,
  symbol: string,
): Promise<OrderbookResponse> {
  const url = buildRouteHandlerUrl(exchange, 'orderbook');
  const fullUrl = `${url}?symbol=${encodeURIComponent(symbol)}`;

  const response = await fetch(fullUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  const apiResponse = await parseApiResponse<OrderbookResponse>(response, exchange);

  if (!apiResponse.data) {
    throw new ExchangeApiError(
      '호가 데이터가 비어있습니다.',
      'EMPTY_RESPONSE',
      exchange,
    );
  }

  return apiResponse.data;
}

// ===== 선물 거래 API 응답 타입 =====

/** 선물 오더북 조회 응답 */
export interface FuturesOrderbookResponse {
  /** 오더북 데이터 */
  orderbook: FuturesOrderbook;
  /** 응답 수신 시각 (밀리초 타임스탬프) */
  timestamp: number;
}

/** 선물 포지션 조회 응답 */
export interface FuturesPositionsResponse {
  /** 거래소 식별자 */
  exchange: FuturesExchangeType;
  /** 포지션 목록 */
  positions: FuturesPosition[];
  /** 응답 수신 시각 */
  timestamp: number;
}

/** 선물 오픈 오더 조회 응답 */
export interface FuturesOpenOrdersResponse {
  /** 거래소 식별자 */
  exchange: FuturesExchangeType;
  /** 오픈 오더 목록 */
  openOrders: FuturesOpenOrder[];
  /** 응답 수신 시각 */
  timestamp: number;
}

// ===== 선물 거래 API 호출 함수 =====

/**
 * 선물 오더북을 조회한다.
 *
 * 선물 오더북 데이터는 공개 API이므로 서명이 불필요하다.
 * Route Handler의 GET 엔드포인트를 통해 조회한다.
 *
 * @param exchange 선물 거래소 식별자
 * @param symbol 조회할 baseAsset 심볼 (예: 'BTC')
 * @returns 정규화된 선물 오더북 데이터
 * @throws {ExchangeApiError} API 호출 실패 시
 */
export async function fetchFuturesOrderbook(
  exchange: FuturesExchangeType,
  symbol: string,
): Promise<FuturesOrderbookResponse> {
  const url = `/api/exchange/${exchange}/futures-orderbook?symbol=${encodeURIComponent(symbol)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  const apiResponse = await parseApiResponse<FuturesOrderbookResponse>(
    response,
    exchange as ExchangeType,
  );

  if (!apiResponse.data) {
    throw new ExchangeApiError(
      '선물 오더북 데이터가 비어있습니다.',
      'EMPTY_RESPONSE',
      exchange as ExchangeType,
    );
  }

  return apiResponse.data;
}

/**
 * 선물 포지션을 조회한다.
 *
 * 포지션 데이터는 인증이 필요한 API이므로 클라이언트에서 서명된 요청을 전달한다.
 *
 * @param exchange 선물 거래소 식별자
 * @param signedRequest 서명된 요청
 * @returns 정규화된 선물 포지션 데이터
 * @throws {ExchangeApiError} API 호출 실패 시
 */
export async function fetchFuturesPositions(
  exchange: FuturesExchangeType,
  signedRequest: SignedRequest,
): Promise<FuturesPositionsResponse> {
  const url = `/api/exchange/${exchange}/futures-positions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signedRequest),
  });

  const apiResponse = await parseApiResponse<FuturesPositionsResponse>(
    response,
    exchange as ExchangeType,
  );

  if (!apiResponse.data) {
    throw new ExchangeApiError(
      '선물 포지션 데이터가 비어있습니다.',
      'EMPTY_RESPONSE',
      exchange as ExchangeType,
    );
  }

  return apiResponse.data;
}

/**
 * 선물 오픈 오더를 조회한다.
 *
 * 오픈 오더 데이터는 인증이 필요한 API이므로 클라이언트에서 서명된 요청을 전달한다.
 *
 * @param exchange 선물 거래소 식별자
 * @param signedRequest 서명된 요청
 * @returns 정규화된 선물 오픈 오더 데이터
 * @throws {ExchangeApiError} API 호출 실패 시
 */
export async function fetchFuturesOpenOrders(
  exchange: FuturesExchangeType,
  signedRequest: SignedRequest,
): Promise<FuturesOpenOrdersResponse> {
  const url = `/api/exchange/${exchange}/futures-open-orders`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signedRequest),
  });

  const apiResponse = await parseApiResponse<FuturesOpenOrdersResponse>(
    response,
    exchange as ExchangeType,
  );

  if (!apiResponse.data) {
    throw new ExchangeApiError(
      '선물 오픈 오더 데이터가 비어있습니다.',
      'EMPTY_RESPONSE',
      exchange as ExchangeType,
    );
  }

  return apiResponse.data;
}

/**
 * 거래소 주문 내역을 조회한다.
 *
 * 주문 내역은 인증이 필요한 API이므로 서명이 필요하다.
 * 클라이언트에서 서명된 요청을 생성하여 Route Handler에 전달한다.
 *
 * @param exchange 거래소 식별자
 * @param apiKey 복호화된 API Key 쌍
 * @param params 주문 내역 조회 파라미터 (선택)
 * @returns 정규화된 주문 내역 데이터
 * @throws {ExchangeApiError} API 호출 실패 시
 */
export async function fetchOrderHistory(
  exchange: ExchangeType,
  apiKey: ApiKeyPair,
  params?: OrderHistoryParams,
): Promise<OrderHistoryResponse> {
  // 1. 서명 생성
  const signedRequest = signOrderHistoryRequest(exchange, apiKey, params);

  // 2. Route Handler에 서명된 요청 전달
  const url = buildRouteHandlerUrl(exchange, 'orders');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signedRequest),
  });

  // 3. 응답 파싱 및 오류 처리
  const apiResponse = await parseApiResponse<OrderHistoryResponse>(response, exchange);

  if (!apiResponse.data) {
    throw new ExchangeApiError(
      '주문 내역 데이터가 비어있습니다.',
      'EMPTY_RESPONSE',
      exchange,
    );
  }

  return apiResponse.data;
}

// ===== 병렬 조회 =====

/** 거래소별 잔고 조회 결과 */
export interface ExchangeBalanceResult {
  /** 거래소 식별자 */
  exchange: ExchangeType;
  /** 잔고 데이터 (성공 시) */
  data: BalanceResponse | null;
  /** 오류 정보 (실패 시) */
  error: ExchangeApiError | null;
  /** 조회 상태 */
  status: 'success' | 'error';
}

/**
 * 여러 거래소의 잔고를 병렬로 조회한다.
 *
 * Promise.allSettled를 사용하여 일부 거래소가 실패하더라도
 * 나머지 거래소의 결과를 정상적으로 반환한다.
 * 이를 통해 Graceful Degradation 패턴을 지원한다.
 *
 * @param exchangeApiKeys 거래소별 API Key 맵 (거래소 식별자 -> 복호화된 API Key)
 * @returns 거래소별 잔고 조회 결과 배열
 *
 * @example
 * ```typescript
 * const results = await fetchBalancesInParallel({
 *   upbit: { accessKey: '...', secretKey: '...' },
 *   bithumb: { accessKey: '...', secretKey: '...' },
 * });
 *
 * results.forEach(result => {
 *   if (result.status === 'success') {
 *     console.log(`${result.exchange}: 잔고 조회 성공`);
 *   } else {
 *     console.log(`${result.exchange}: ${result.error?.message}`);
 *   }
 * });
 * ```
 *
 * @see 요구사항 NF1.3 (병렬 API 호출로 응답 시간 최소화)
 * @see 요구사항 2.6 (특정 거래소 실패 시 나머지 정상 표시)
 */
export async function fetchBalancesInParallel(
  exchangeApiKeys: Partial<Record<ExchangeType, ApiKeyPair>>,
): Promise<ExchangeBalanceResult[]> {
  const exchanges = Object.entries(exchangeApiKeys) as [ExchangeType, ApiKeyPair][];

  if (exchanges.length === 0) {
    return [];
  }

  const promises = exchanges.map(([exchange, apiKey]) =>
    fetchBalance(exchange, apiKey)
      .then((data): ExchangeBalanceResult => ({
        exchange,
        data,
        error: null,
        status: 'success',
      }))
      .catch((error): ExchangeBalanceResult => ({
        exchange,
        data: null,
        error:
          error instanceof ExchangeApiError
            ? error
            : new ExchangeApiError(
                error instanceof Error ? error.message : String(error),
                'UNKNOWN_ERROR',
                exchange,
              ),
        status: 'error',
      })),
  );

  return Promise.all(promises);
}

/**
 * 여러 거래소의 시세를 병렬로 조회한다.
 *
 * @param exchanges 조회할 거래소 목록
 * @param symbols 조회할 코인 심볼 배열 (선택)
 * @returns 거래소별 시세 조회 결과 배열
 */
export async function fetchTickersInParallel(
  exchanges: ExchangeType[],
  symbols?: string[],
): Promise<{ exchange: ExchangeType; data: TickerResponse | null; error: ExchangeApiError | null; status: 'success' | 'error' }[]> {
  if (exchanges.length === 0) {
    return [];
  }

  const promises = exchanges.map((exchange) =>
    fetchTicker(exchange, symbols)
      .then((data) => ({
        exchange,
        data,
        error: null as ExchangeApiError | null,
        status: 'success' as const,
      }))
      .catch((error) => ({
        exchange,
        data: null as TickerResponse | null,
        error:
          error instanceof ExchangeApiError
            ? error
            : new ExchangeApiError(
                error instanceof Error ? error.message : String(error),
                'UNKNOWN_ERROR',
                exchange,
              ),
        status: 'error' as const,
      })),
  );

  return Promise.all(promises);
}
