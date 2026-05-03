/**
 * 거래소별 API 엔드포인트, Rate Limit, WebSocket URL 등 상수 정의
 *
 * 업비트, 빗썸, 코인원 3개 거래소의 API 설정값을 포함한다.
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
 * 거래소 설정 맵
 *
 * ExchangeType으로 해당 거래소의 설정을 조회할 수 있다.
 */
export const EXCHANGE_CONFIGS: Record<ExchangeType, ExchangeConfig> = {
  upbit: UPBIT_CONFIG,
  bithumb: BITHUMB_CONFIG,
  coinone: COINONE_CONFIG,
  binance: BINANCE_CONFIG,
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
} as const;

/** 지원하는 모든 거래소 목록 */
export const SUPPORTED_EXCHANGES: readonly ExchangeType[] = [
  'upbit',
  'bithumb',
  'coinone',
  'binance',
] as const;

/** 국내 거래소 목록 (김치 프리미엄 비교 기준) */
export const DOMESTIC_EXCHANGES: readonly ExchangeType[] = [
  'upbit',
  'bithumb',
  'coinone',
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
