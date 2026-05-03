/**
 * 거래소별 API 엔드포인트, Rate Limit, WebSocket URL 등 상수 정의
 *
 * 국내 3개(업비트, 빗썸, 코인원) + 해외 5개(바이낸스, 바이빗, OKX, Gate.io, Bitget),
 * 총 8개 거래소의 API 설정값을 포함한다.
 */

import type { ExchangeType } from '../types/exchange';

/** 거래소 API 기본 설정 */
export interface ExchangeConfig {
  /** 거래소 식별자 */
  id: ExchangeType;
  /** 거래소 한글 이름 */
  nameKo: string;
  /** 거래소 영문 이름 */
  nameEn: string;
  /** REST API 기본 URL */
  restBaseUrl: string;
  /** WebSocket URL (없으면 undefined) */
  wsUrl?: string;
  /** Rate Limit 설정 */
  rateLimit: {
    /** 초당 최대 요청 수 */
    requestsPerSecond: number;
    /** 분당 최대 요청 수 */
    requestsPerMinute: number;
  };
  /** API 요청 타임아웃 (밀리초) */
  timeoutMs: number;
}

/** 거래소 API 엔드포인트 경로 */
export interface ExchangeEndpoints {
  /** 잔고 조회 */
  balance: string;
  /** 시세(티커) 조회 */
  ticker: string;
  /** 호가(오더북) 조회 */
  orderbook: string;
  /** 주문 내역 조회 */
  orders: string;
  /** 전체 마켓(코인) 목록 조회 */
  markets: string;
}

/** 업비트 API 설정 */
export const UPBIT_CONFIG: ExchangeConfig = {
  id: 'upbit',
  nameKo: '업비트',
  nameEn: 'Upbit',
  restBaseUrl: 'https://api.upbit.com/v1',
  wsUrl: 'wss://api.upbit.com/websocket/v1',
  rateLimit: {
    requestsPerSecond: 10,
    requestsPerMinute: 600,
  },
  timeoutMs: 10_000,
} as const;

/** 업비트 API 엔드포인트 */
export const UPBIT_ENDPOINTS: ExchangeEndpoints = {
  balance: '/accounts',
  ticker: '/ticker',
  orderbook: '/orderbook',
  orders: '/orders',
  markets: '/market/all',
} as const;

/** 빗썸 API 설정 (v2 - JWT 인증 기반) */
export const BITHUMB_CONFIG: ExchangeConfig = {
  id: 'bithumb',
  nameKo: '빗썸',
  nameEn: 'Bithumb',
  restBaseUrl: 'https://api.bithumb.com',
  wsUrl: 'wss://pubwss.bithumb.com/pub/ws',
  rateLimit: {
    /** Private API: 초당 140회, Public API: 초당 150회 (낮은 값 기준) */
    requestsPerSecond: 140,
    requestsPerMinute: 8_400,
  },
  timeoutMs: 10_000,
} as const;

/** 빗썸 API 엔드포인트 (v2 - JWT 인증 기반) */
export const BITHUMB_ENDPOINTS: ExchangeEndpoints = {
  balance: '/v1/accounts',
  ticker: '/public/ticker',
  orderbook: '/public/orderbook',
  orders: '/v1/orders',
  markets: '/v1/market/all',
} as const;

/** 코인원 API 설정 */
export const COINONE_CONFIG: ExchangeConfig = {
  id: 'coinone',
  nameKo: '코인원',
  nameEn: 'Coinone',
  restBaseUrl: 'https://api.coinone.co.kr',
  // 코인원은 공개 WebSocket이 없으므로 REST 폴링 방식 사용
  wsUrl: undefined,
  rateLimit: {
    /** Private API V2.1: 주문 외 80/초, Public API V2: 1200/분 (낮은 값 기준 20/초) */
    requestsPerSecond: 20,
    requestsPerMinute: 1_200,
  },
  timeoutMs: 10_000,
} as const;

/** 코인원 API 엔드포인트 */
export const COINONE_ENDPOINTS: ExchangeEndpoints = {
  balance: '/v2.1/account/balance/all',
  ticker: '/public/v2/ticker_new/KRW',
  orderbook: '/public/v2/orderbook/KRW',
  orders: '/v2.1/order/query_active_orders',
  markets: '/public/v2/markets/KRW',
} as const;

/**
 * 바이낸스 API 설정 (해외 거래소 - 포트폴리오 + 김치 프리미엄 비교용)
 *
 * 바이낸스는 포트폴리오 거래소로 사용되며(자산 조회, 대시보드 표시),
 * 공개 시세 API를 통한 김치 프리미엄 비교에도 사용된다.
 * 바이낸스 잔고는 USDT 기준이므로 KRW 환산하여 표시한다.
 */
export const BINANCE_CONFIG: ExchangeConfig = {
  id: 'binance',
  nameKo: '바이낸스',
  nameEn: 'Binance',
  restBaseUrl: 'https://api.binance.com',
  wsUrl: 'wss://stream.binance.com:9443/ws',
  rateLimit: {
    requestsPerSecond: 20,
    requestsPerMinute: 1_200,
  },
  timeoutMs: 10_000,
} as const;

/** 바이낸스 API 엔드포인트 */
export const BINANCE_ENDPOINTS: ExchangeEndpoints = {
  /** 잔고 조회: GET /api/v3/account (HMAC-SHA256 인증 필요) */
  balance: '/api/v3/account',
  /** 시세(24h 통계) 조회: GET /api/v3/ticker/24hr */
  ticker: '/api/v3/ticker/24hr',
  /** 호가 조회: GET /api/v3/depth */
  orderbook: '/api/v3/depth',
  /** 주문 내역 조회: GET /api/v3/allOrders (HMAC-SHA256 인증 필요) */
  orders: '/api/v3/allOrders',
  /** 전체 거래 가능 심볼 정보: GET /api/v3/exchangeInfo */
  markets: '/api/v3/exchangeInfo',
} as const;

/** 바이낸스 가격 조회 전용 엔드포인트 (김치 프리미엄용) */
export const BINANCE_PRICE_ENDPOINTS = {
  /** 개별 시세 조회: GET /api/v3/ticker/price?symbol=BTCUSDT */
  tickerPrice: '/api/v3/ticker/price',
  /** 전체 시세 조회: GET /api/v3/ticker/price */
  allTickerPrices: '/api/v3/ticker/price',
} as const;

/** 바이낸스 REST 폴링 간격 (밀리초) */
export const BINANCE_POLLING_INTERVAL_MS = 5_000;

/**
 * 바이빗 API 설정 (해외 거래소 - 포트폴리오 + 김치 프리미엄 비교용)
 *
 * 바이빗은 포트폴리오 거래소로 사용되며(자산 조회, 대시보드 표시),
 * 공개 시세 API를 통한 김치 프리미엄 비교에도 사용된다.
 * 바이빗 잔고는 USDT 기준이므로 KRW 환산하여 표시한다.
 */
export const BYBIT_CONFIG: ExchangeConfig = {
  id: 'bybit',
  nameKo: '바이빗',
  nameEn: 'Bybit',
  restBaseUrl: 'https://api.bybit.com',
  wsUrl: undefined,
  rateLimit: {
    requestsPerSecond: 10,
    requestsPerMinute: 600,
  },
  timeoutMs: 10_000,
} as const;

/** 바이빗 API 엔드포인트 */
export const BYBIT_ENDPOINTS: ExchangeEndpoints = {
  /** 잔고 조회: GET /v5/account/wallet-balance?accountType=UNIFIED (HMAC-SHA256 인증 필요) */
  balance: '/v5/account/wallet-balance',
  /** 시세(티커) 조회: GET /v5/market/tickers?category=spot */
  ticker: '/v5/market/tickers',
  /** 호가 조회: GET /v5/market/orderbook?category=spot&symbol=BTCUSDT */
  orderbook: '/v5/market/orderbook',
  /** 주문 내역 조회: GET /v5/order/history?category=spot (HMAC-SHA256 인증 필요) */
  orders: '/v5/order/history',
  /** 전체 거래 가능 심볼 정보: GET /v5/market/instruments-info?category=spot */
  markets: '/v5/market/instruments-info',
} as const;

/**
 * OKX API 설정 (해외 거래소 - 포트폴리오 + 김치 프리미엄 비교용)
 *
 * OKX는 포트폴리오 거래소로 사용되며(자산 조회, 대시보드 표시),
 * 공개 시세 API를 통한 김치 프리미엄 비교에도 사용된다.
 * OKX 잔고는 USDT 기준이므로 KRW 환산하여 표시한다.
 *
 * OKX 인증 방식:
 * - HMAC-SHA256 + Base64 서명
 * - API Key 외에 Passphrase가 추가로 필요
 * - Passphrase는 secretKey에 "실제secretKey|||passphrase" 형식으로 합쳐서 저장
 * - 서명 시 분리하여 처리
 */
export const OKX_CONFIG: ExchangeConfig = {
  id: 'okx',
  nameKo: 'OKX',
  nameEn: 'OKX',
  restBaseUrl: 'https://www.okx.com',
  wsUrl: undefined,
  rateLimit: {
    requestsPerSecond: 10,
    requestsPerMinute: 600,
  },
  timeoutMs: 10_000,
} as const;

/** OKX API 엔드포인트 */
export const OKX_ENDPOINTS: ExchangeEndpoints = {
  /** 잔고 조회: GET /api/v5/account/balance (HMAC-SHA256 + Base64 인증 필요) */
  balance: '/api/v5/account/balance',
  /** 시세(티커) 조회: GET /api/v5/market/tickers?instType=SPOT */
  ticker: '/api/v5/market/tickers',
  /** 호가 조회: GET /api/v5/market/books?instId=BTC-USDT */
  orderbook: '/api/v5/market/books',
  /** 주문 내역 조회: GET /api/v5/trade/orders-history-archive?instType=SPOT (인증 필요) */
  orders: '/api/v5/trade/orders-history-archive',
  /** 전체 거래 가능 심볼 정보: GET /api/v5/public/instruments?instType=SPOT */
  markets: '/api/v5/public/instruments',
} as const;

/**
 * Gate.io API 설정 (해외 거래소 - 포트폴리오 + 김치 프리미엄 비교용)
 *
 * Gate.io는 포트폴리오 거래소로 사용되며(자산 조회, 대시보드 표시),
 * 공개 시세 API를 통한 김치 프리미엄 비교에도 사용된다.
 * Gate.io 잔고는 USDT 기준이므로 KRW 환산하여 표시한다.
 *
 * Gate.io 인증 방식:
 * - HMAC-SHA512 서명
 * - KEY 헤더: API Key
 * - SIGN 헤더: HMAC-SHA512 서명 (hex)
 * - Timestamp 헤더: Unix timestamp (초)
 * - 서명 문자열: method + '\n' + path + '\n' + queryString + '\n' + SHA512(body) + '\n' + timestamp
 */
export const GATE_CONFIG: ExchangeConfig = {
  id: 'gate',
  nameKo: 'Gate.io',
  nameEn: 'Gate.io',
  restBaseUrl: 'https://api.gateio.ws',
  wsUrl: undefined,
  rateLimit: {
    requestsPerSecond: 10,
    requestsPerMinute: 600,
  },
  timeoutMs: 10_000,
} as const;

/** Gate.io API 엔드포인트 */
export const GATE_ENDPOINTS: ExchangeEndpoints = {
  /** 잔고 조회: GET /api/v4/spot/accounts */
  balance: '/api/v4/spot/accounts',
  /** 시세(티커) 조회: GET /api/v4/spot/tickers */
  ticker: '/api/v4/spot/tickers',
  /** 호가 조회: GET /api/v4/spot/order_book?currency_pair=BTC_USDT */
  orderbook: '/api/v4/spot/order_book',
  /** 주문 내역 조회: GET /api/v4/spot/orders?status=finished */
  orders: '/api/v4/spot/orders',
  /** 전체 거래 가능 심볼 정보: GET /api/v4/spot/currency_pairs */
  markets: '/api/v4/spot/currency_pairs',
} as const;

/**
 * Bitget API 설정 (해외 거래소 - 포트폴리오 + 김치 프리미엄 비교용)
 *
 * Bitget은 포트폴리오 거래소로 사용되며(자산 조회, 대시보드 표시),
 * 공개 시세 API를 통한 김치 프리미엄 비교에도 사용된다.
 * Bitget 잔고는 USDT 기준이므로 KRW 환산하여 표시한다.
 *
 * Bitget 인증 방식:
 * - HMAC-SHA256 + Base64 서명 (OKX와 거의 동일)
 * - API Key 외에 Passphrase가 추가로 필요
 * - Passphrase는 secretKey에 "실제secretKey|||passphrase" 형식으로 합쳐서 저장
 * - 서명 시 분리하여 처리
 *
 * Bitget API v2 응답 구조: { code: "00000", data: [...] }
 */
export const BITGET_CONFIG: ExchangeConfig = {
  id: 'bitget',
  nameKo: '비트겟',
  nameEn: 'Bitget',
  restBaseUrl: 'https://api.bitget.com',
  wsUrl: undefined,
  rateLimit: {
    requestsPerSecond: 10,
    requestsPerMinute: 600,
  },
  timeoutMs: 10_000,
} as const;

/** Bitget API 엔드포인트 */
export const BITGET_ENDPOINTS: ExchangeEndpoints = {
  /** 잔고 조회: GET /api/v2/spot/account/assets (HMAC-SHA256 + Base64 인증 필요) */
  balance: '/api/v2/spot/account/assets',
  /** 시세(티커) 조회: GET /api/v2/spot/market/tickers */
  ticker: '/api/v2/spot/market/tickers',
  /** 호가 조회: GET /api/v2/spot/market/orderbook?symbol=BTCUSDT */
  orderbook: '/api/v2/spot/market/orderbook',
  /** 주문 내역 조회: GET /api/v2/spot/trade/history-orders (인증 필요) */
  orders: '/api/v2/spot/trade/history-orders',
  /** 전체 거래 가능 심볼 정보: GET /api/v2/spot/market/tickers */
  markets: '/api/v2/spot/market/tickers',
} as const;

/**
 * 거래소 설정 맵
 *
 * ExchangeType으로 해당 거래소의 설정을 조회할 수 있다.
 */
export const EXCHANGE_CONFIGS: Record<ExchangeType, ExchangeConfig> = {
  upbit: UPBIT_CONFIG,
  bithumb: BITHUMB_CONFIG,
  coinone: COINONE_CONFIG,
  binance: BINANCE_CONFIG,
  bybit: BYBIT_CONFIG,
  okx: OKX_CONFIG,
  gate: GATE_CONFIG,
  bitget: BITGET_CONFIG,
} as const;

/**
 * 거래소 엔드포인트 맵
 *
 * ExchangeType으로 해당 거래소의 API 엔드포인트를 조회할 수 있다.
 */
export const EXCHANGE_ENDPOINTS: Record<ExchangeType, ExchangeEndpoints> = {
  upbit: UPBIT_ENDPOINTS,
  bithumb: BITHUMB_ENDPOINTS,
  coinone: COINONE_ENDPOINTS,
  binance: BINANCE_ENDPOINTS,
  bybit: BYBIT_ENDPOINTS,
  okx: OKX_ENDPOINTS,
  gate: GATE_ENDPOINTS,
  bitget: BITGET_ENDPOINTS,
} as const;

/** 지원하는 모든 거래소 목록 */
export const SUPPORTED_EXCHANGES: readonly ExchangeType[] = [
  'upbit',
  'bithumb',
  'coinone',
  'binance',
  'bybit',
  'okx',
  'gate',
  'bitget',
] as const;

/** 국내 거래소 목록 (김치 프리미엄 비교 기준) */
export const DOMESTIC_EXCHANGES: readonly ExchangeType[] = [
  'upbit',
  'bithumb',
  'coinone',
] as const;

/** 해외 거래소 목록 (USDT 기준 잔고 → KRW 환산 필요) */
export const FOREIGN_EXCHANGES: readonly ExchangeType[] = [
  'binance',
  'bybit',
  'okx',
  'gate',
  'bitget',
] as const;

/** 캐시 기본 TTL (밀리초) */
export const DEFAULT_CACHE_TTL_MS = 10_000;

/** 자동 새로고침 기본 주기 (밀리초) */
export const DEFAULT_REFRESH_INTERVAL_MS = 30_000;

/** 코인원 REST 폴링 간격 (밀리초) */
export const COINONE_POLLING_INTERVAL_MS = 5_000;

/** WebSocket 자동 재연결 최대 시도 횟수 */
export const WS_MAX_RECONNECT_ATTEMPTS = 5;

/** 지수 백오프 재시도 설정 */
export const RETRY_CONFIG = {
  /** 최대 재시도 횟수 */
  maxRetries: 3,
  /** 기본 대기 시간 (밀리초) */
  baseDelayMs: 1_000,
  /** 최대 대기 시간 (밀리초) */
  maxDelayMs: 4_000,
} as const;

/** 김치 프리미엄 이력 저장 간격 (밀리초) */
export const PREMIUM_SNAPSHOT_INTERVAL_MS = 60_000;
