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
  /** Futures REST API 기본 URL (Spot과 다른 도메인을 사용하는 거래소용, 예: 바이낸스 fapi) */
  futuresBaseUrl?: string;
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
  /** Futures 잔고 조회 (선택, 해당 거래소만) */
  futures?: string;
  /** 선물 오더북 조회 (공개 API) */
  futuresOrderbook?: string;
  /** 선물 포지션 조회 (인증 필요) */
  futuresPositions?: string;
  /** 선물 오픈 오더 조회 (인증 필요) */
  futuresOpenOrders?: string;
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
  /** 바이낸스 USD-M Futures API는 별도 도메인(fapi.binance.com)을 사용한다 */
  futuresBaseUrl: 'https://fapi.binance.com',
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
  /** USD-M Futures 잔고 조회: GET /fapi/v2/balance (fapi.binance.com 도메인) */
  futures: '/fapi/v2/balance',
  /** 선물 오더북: GET /fapi/v1/depth (fapi.binance.com 도메인) */
  futuresOrderbook: '/fapi/v1/depth',
  /** 선물 포지션: GET /fapi/v2/positionRisk (fapi.binance.com 도메인) */
  futuresPositions: '/fapi/v2/positionRisk',
  /** 선물 오픈 오더: GET /fapi/v1/openOrders (fapi.binance.com 도메인) */
  futuresOpenOrders: '/fapi/v1/openOrders',
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
  /** 선물 오더북: GET /v5/market/orderbook?category=linear */
  futuresOrderbook: '/v5/market/orderbook',
  /** 선물 포지션: GET /v5/position/list?category=linear */
  futuresPositions: '/v5/position/list',
  /** 선물 오픈 오더: GET /v5/order/realtime?category=linear */
  futuresOpenOrders: '/v5/order/realtime',
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
  /** 선물 오더북: GET /api/v5/market/books?instId=BTC-USDT-SWAP */
  futuresOrderbook: '/api/v5/market/books',
  /** 선물 포지션: GET /api/v5/account/positions?instType=SWAP */
  futuresPositions: '/api/v5/account/positions',
  /** 선물 오픈 오더: GET /api/v5/trade/orders-pending?instType=SWAP */
  futuresOpenOrders: '/api/v5/trade/orders-pending',
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
  /** Futures USDT 계좌 조회: GET /api/v4/futures/usdt/accounts (같은 도메인) */
  futures: '/api/v4/futures/usdt/accounts',
  /** 선물 오더북: GET /api/v4/futures/usdt/order_book */
  futuresOrderbook: '/api/v4/futures/usdt/order_book',
  /** 선물 포지션: GET /api/v4/futures/usdt/positions */
  futuresPositions: '/api/v4/futures/usdt/positions',
  /** 선물 오픈 오더: GET /api/v4/futures/usdt/orders */
  futuresOpenOrders: '/api/v4/futures/usdt/orders',
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
  /** Futures(USDT-FUTURES) 계좌 조회: GET /api/v2/mix/account/accounts?productType=USDT-FUTURES (같은 도메인) */
  futures: '/api/v2/mix/account/accounts',
  /** 선물 오더북: GET /api/v2/mix/market/depth */
  futuresOrderbook: '/api/v2/mix/market/depth',
  /** 선물 포지션: GET /api/v2/mix/position/all-position */
  futuresPositions: '/api/v2/mix/position/all-position',
  /** 선물 오픈 오더: GET /api/v2/mix/order/orders-pending */
  futuresOpenOrders: '/api/v2/mix/order/orders-pending',
} as const;

/**
 * 하이퍼리퀴드 API 설정 (해외 거래소 - 포트폴리오용)
 *
 * 하이퍼리퀴드는 다른 거래소와 완전히 다른 방식으로 동작한다:
 * - API Key가 불필요하다. 지갑 주소만으로 잔고 조회가 가능하다.
 * - 모든 요청이 POST /info에 type 파라미터로 구분된다.
 * - 서명이 불필요하다 (조회는 공개 API).
 * - 자산은 USDC 기준이다 (USDT가 아님).
 * - 선물(Perps) 중심이지만 Spot도 지원한다.
 *
 * 설정 페이지에서 API Key 등록이 불필요하며,
 * 지갑 연결만으로 자동 조회가 가능하다.
 * accessKey에 지갑 주소를 저장하는 방식으로 기존 아키텍처와 통합한다.
 */
export const HYPERLIQUID_CONFIG: ExchangeConfig = {
  id: 'hyperliquid',
  nameKo: '하이퍼리퀴드',
  nameEn: 'Hyperliquid',
  restBaseUrl: 'https://api.hyperliquid.xyz',
  wsUrl: undefined,
  rateLimit: {
    requestsPerSecond: 10,
    requestsPerMinute: 600,
  },
  timeoutMs: 10_000,
} as const;

/**
 * 하이퍼리퀴드 API 엔드포인트
 *
 * 하이퍼리퀴드는 모든 요청이 POST /info에 type 파라미터로 구분된다.
 * - clearinghouseState: Perps 잔고 조회
 * - spotClearinghouseState: Spot 잔고 조회
 */
export const HYPERLIQUID_ENDPOINTS: ExchangeEndpoints = {
  /** 잔고 조회: POST /info (type: clearinghouseState + spotClearinghouseState) */
  balance: '/info',
  /** 시세 조회: POST /info (type: allMids) */
  ticker: '/info',
  /** 호가 조회: POST /info (type: l2Book) */
  orderbook: '/info',
  /** 주문 내역 조회: POST /info (type: userFills) */
  orders: '/info',
  /** 마켓 조회: POST /info (type: meta) */
  markets: '/info',
} as const;

/**
 * LBank API 설정 (해외 거래소 - 포트폴리오 + 김치 프리미엄 비교용)
 *
 * LBank은 포트폴리오 거래소로 사용되며(자산 조회, 대시보드 표시),
 * 공개 시세 API를 통한 김치 프리미엄 비교에도 사용된다.
 * LBank 잔고는 USDT 기준이므로 KRW 환산하여 표시한다.
 *
 * LBank 인증 방식:
 * - HmacSHA256 서명 (Secret Key 32자 이하)
 * - 파라미터 알파벳순 정렬 → MD5 해시 → 대문자 변환 → HmacSHA256 서명
 * - 모든 Private API는 POST + application/x-www-form-urlencoded
 * - 헤더에 timestamp, signature_method, echostr(30~40자 랜덤) 포함
 */
export const LBANK_CONFIG: ExchangeConfig = {
  id: 'lbank',
  nameKo: '엘뱅크',
  nameEn: 'LBank',
  restBaseUrl: 'https://api.lbank.info',
  futuresBaseUrl: 'https://lbkperp.lbank.com',
  wsUrl: undefined,
  rateLimit: {
    requestsPerSecond: 20,
    requestsPerMinute: 1_200,
  },
  timeoutMs: 10_000,
} as const;

/** LBank API 엔드포인트 */
export const LBANK_ENDPOINTS: ExchangeEndpoints = {
  /** 잔고 조회: POST /v2/supplement/user_info.do (HmacSHA256 인증 필요) */
  balance: '/v2/supplement/user_info.do',
  /** 시세(24h 통계) 조회: GET /v2/ticker/24hr.do */
  ticker: '/v2/ticker/24hr.do',
  /** 호가 조회: GET /v2/depth.do */
  orderbook: '/v2/depth.do',
  /** 주문 내역 조회: POST /v2/supplement/orders_info_history.do (인증 필요) */
  orders: '/v2/supplement/orders_info_history.do',
  /** 전체 거래쌍 목록: GET /v2/currencyPairs.do */
  markets: '/v2/currencyPairs.do',
  /** Futures 시세 조회: GET /cfd/openApi/v1/pub/marketData */
  futures: '/cfd/openApi/v1/pub/marketData',
} as const;

/** LBank REST 폴링 간격 (밀리초) */
export const LBANK_POLLING_INTERVAL_MS = 5_000;

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
  hyperliquid: HYPERLIQUID_CONFIG,
  lbank: LBANK_CONFIG,
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
  hyperliquid: HYPERLIQUID_ENDPOINTS,
  lbank: LBANK_ENDPOINTS,
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
  'hyperliquid',
  // 'lbank', // TODO: LBank 디버깅 후 활성화
] as const;

/** 국내 거래소 목록 (김치 프리미엄 비교 기준) */
export const DOMESTIC_EXCHANGES: readonly ExchangeType[] = [
  'upbit',
  'bithumb',
  'coinone',
] as const;

/** 해외 중앙화 거래소 목록 (CEX, USDT/USDC 기준 잔고 → KRW 환산 필요) */
export const FOREIGN_EXCHANGES: readonly ExchangeType[] = [
  'binance',
  'bybit',
  'okx',
  'gate',
  'bitget',
  // 'lbank', // TODO: LBank 디버깅 후 활성화
] as const;

/** 탈중앙화 거래소 목록 (DEX, 지갑 기반) */
export const DEX_EXCHANGES: readonly ExchangeType[] = [
  'hyperliquid',
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
