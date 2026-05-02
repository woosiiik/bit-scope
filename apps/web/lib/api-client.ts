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
} from '@bitscope/shared';
import { createSigner } from './exchange/signer-factory';

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
  return signer.signRequest({
    method: 'GET',
    endpoint: 'balance',
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

  const queryParams: Record<string, string> = {};
  if (params?.symbol) {
    queryParams.symbol = params.symbol;
  }
  if (params?.limit) {
    queryParams.limit = String(params.limit);
  }

  return signer.signRequest({
    method: 'GET',
    endpoint: 'orders',
    queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
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
 * 거래소 잔고를 조회한다.
 *
 * 클라이언트에서 서명된 요청을 생성하여 Next.js Route Handler에 전달하고,
 * 정규화된 잔고 데이터를 반환한다.
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
  // 1. 서명 생성
  const signedRequest = signBalanceRequest(exchange, apiKey);

  // 2. Route Handler에 서명된 요청 전달
  const url = buildRouteHandlerUrl(exchange, 'balance');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signedRequest),
  });

  // 3. 응답 파싱 및 오류 처리
  const apiResponse = await parseApiResponse<BalanceResponse>(response, exchange);

  if (!apiResponse.data) {
    throw new ExchangeApiError(
      '잔고 데이터가 비어있습니다.',
      'EMPTY_RESPONSE',
      exchange,
    );
  }

  return apiResponse.data;
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
