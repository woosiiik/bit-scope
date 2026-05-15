/**
 * 호가(Orderbook) 조회 릴레이 Route Handler
 *
 * 거래소의 코인 호가(매수/매도 호가) 정보를 조회한다.
 * 호가 조회는 공개 API이므로 서명이 불필요하며, GET 요청으로 처리한다.
 * 클라이언트가 서명된 요청을 전달하는 POST 방식도 지원한다.
 *
 * - GET 메서드: 공개 호가 조회 (쿼리 파라미터로 심볼 지정)
 * - POST 메서드: 서명된 요청을 통한 호가 조회
 * - 캐싱: 기본 TTL 10초 (인메모리 캐시)
 * - Rate Limit: 거래소별 토큰 버킷 기반 제한
 * - 타임아웃: 10초
 *
 * @see 요구사항 5.4 (가격 차트, 호가 정보, 최근 체결 내역 표시)
 * @see 요구사항 12.3 (서명된 요청 릴레이 및 응답 반환)
 * @see 요구사항 12.4 (응답 데이터 통일된 내부 데이터 모델 정규화)
 */

import { type NextRequest, NextResponse } from 'next/server';
import type { ExchangeType, SignedRequest } from '@bitscope/shared';
import {
  SUPPORTED_EXCHANGES,
  EXCHANGE_CONFIGS,
  EXCHANGE_ENDPOINTS,
} from '@bitscope/shared';
import { relayRequest } from '../../_lib/proxy';
import { normalizeOrderbook } from '../../_lib/normalizer';

/** Route Handler 파라미터 타입 */
interface RouteParams {
  params: Promise<{
    exchange: string;
  }>;
}

/**
 * 거래소별 호가 조회 URL을 생성한다.
 *
 * @param exchange 거래소 식별자
 * @param symbol 코인 심볼 (예: "BTC")
 * @returns 거래소 호가 조회 URL
 */
function buildOrderbookUrl(exchange: ExchangeType, symbol: string): string {
  const baseUrl = EXCHANGE_CONFIGS[exchange].restBaseUrl;
  const endpoint = EXCHANGE_ENDPOINTS[exchange].orderbook;
  const sym = symbol.toUpperCase();

  switch (exchange) {
    case 'upbit':
      // 업비트: /v1/orderbook?markets=KRW-BTC
      return `${baseUrl}${endpoint}?markets=KRW-${sym}`;
    case 'bithumb':
      // 빗썸: /public/orderbook/{코인}_KRW
      return `${baseUrl}${endpoint}/${sym}_KRW`;
    case 'coinone':
      // 코인원: /public/v2/orderbook/KRW/{코인}
      return `${baseUrl}${endpoint}/${sym}`;
    case 'binance':
      // 바이낸스: /api/v3/depth?symbol=BTCUSDT&limit=20
      return `${baseUrl}${endpoint}?symbol=${sym}USDT&limit=20`;
    case 'bybit':
      // 바이빗: /v5/market/orderbook?category=spot&symbol=BTCUSDT
      return `${baseUrl}${endpoint}?category=spot&symbol=${sym}USDT`;
    case 'okx':
      // OKX: /api/v5/market/books?instId=BTC-USDT
      return `${baseUrl}${endpoint}?instId=${sym}-USDT&sz=20`;
    case 'gate':
      // Gate.io: /api/v4/spot/order_book?currency_pair=BTC_USDT
      return `${baseUrl}${endpoint}?currency_pair=${sym}_USDT&limit=20`;
    case 'bitget':
      // Bitget: /api/v2/spot/market/orderbook?symbol=BTCUSDT
      return `${baseUrl}${endpoint}?symbol=${sym}USDT&limit=20`;
    case 'hyperliquid':
      // 하이퍼리퀴드: POST /info 방식이므로 별도 핸들링 필요 (GET에서는 미지원)
      return `${baseUrl}${endpoint}`;
    default:
      return `${baseUrl}${endpoint}`;
  }
}

/**
 * 공개 호가 조회 (GET)
 *
 * 쿼리 파라미터로 조회할 코인 심볼을 지정한다.
 * 호가 데이터는 공개 API이므로 인증(서명)이 불필요하다.
 *
 * @param request Next.js 요청 객체
 * @param context Route 파라미터 (exchange: 거래소 식별자)
 * @returns 정규화된 호가 데이터 또는 오류 응답
 *
 * @example
 * GET /api/exchange/upbit/orderbook?symbol=BTC
 */
export async function GET(
  request: NextRequest,
  context: RouteParams,
): Promise<NextResponse> {
  const { exchange: exchangeParam } = await context.params;

  // 거래소 식별자 유효성 검증
  if (!SUPPORTED_EXCHANGES.includes(exchangeParam as ExchangeType)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: `지원하지 않는 거래소입니다: ${exchangeParam}`,
          code: 'INVALID_EXCHANGE',
        },
      },
      { status: 400 },
    );
  }

  const exchange = exchangeParam as ExchangeType;

  // 쿼리 파라미터에서 심볼 추출 (필수)
  const symbol = request.nextUrl.searchParams.get('symbol');
  if (!symbol) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: '코인 심볼(symbol) 파라미터가 필요합니다.',
          code: 'MISSING_SYMBOL',
        },
      },
      { status: 400 },
    );
  }

  // 거래소별 호가 조회 URL 생성
  const orderbookUrl = buildOrderbookUrl(exchange, symbol);

  // 공개 API이므로 별도 서명 없이 직접 요청
  const signedRequest: SignedRequest = {
    url: orderbookUrl,
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };

  // 거래소 API에 릴레이
  const proxyResponse = await relayRequest({
    exchange,
    signedRequest,
    cacheEndpoint: EXCHANGE_ENDPOINTS[exchange].orderbook,
    cacheParams: { symbol: symbol.toUpperCase() },
  });

  // 릴레이 실패 시 오류 반환
  if (!proxyResponse.success) {
    const statusCode = proxyResponse.error?.statusCode ?? 502;
    return NextResponse.json(
      {
        success: false,
        error: proxyResponse.error,
      },
      { status: statusCode },
    );
  }

  // 응답 데이터 정규화
  try {
    const normalizedData = normalizeOrderbook(exchange, proxyResponse.data);

    return NextResponse.json({
      success: true,
      data: normalizedData,
      cached: proxyResponse.cached,
      stale: proxyResponse.stale,
      dataTimestamp: proxyResponse.dataTimestamp,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: `응답 데이터 정규화 실패: ${error instanceof Error ? error.message : String(error)}`,
          code: 'NORMALIZATION_ERROR',
        },
      },
      { status: 500 },
    );
  }
}

/**
 * 서명된 요청을 통한 호가 조회 (POST)
 *
 * 클라이언트가 직접 서명한 요청을 거래소 API에 릴레이한다.
 *
 * @param request Next.js 요청 객체
 * @param context Route 파라미터 (exchange: 거래소 식별자)
 * @returns 정규화된 호가 데이터 또는 오류 응답
 */
export async function POST(
  request: NextRequest,
  context: RouteParams,
): Promise<NextResponse> {
  const { exchange: exchangeParam } = await context.params;

  // 거래소 식별자 유효성 검증
  if (!SUPPORTED_EXCHANGES.includes(exchangeParam as ExchangeType)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: `지원하지 않는 거래소입니다: ${exchangeParam}`,
          code: 'INVALID_EXCHANGE',
        },
      },
      { status: 400 },
    );
  }

  const exchange = exchangeParam as ExchangeType;

  // 요청 본문 파싱
  let body: { signedRequest: SignedRequest };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: '요청 본문을 파싱할 수 없습니다.',
          code: 'INVALID_REQUEST_BODY',
        },
      },
      { status: 400 },
    );
  }

  const { signedRequest } = body;

  // 서명된 요청 필수 필드 검증
  if (!signedRequest?.url || !signedRequest?.method || !signedRequest?.headers) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: '서명된 요청 정보가 불완전합니다. signedRequest 내 url, method, headers가 필요합니다.',
          code: 'INVALID_SIGNED_REQUEST',
        },
      },
      { status: 400 },
    );
  }

  // 거래소 API에 릴레이
  const proxyResponse = await relayRequest({
    exchange,
    signedRequest,
    cacheEndpoint: EXCHANGE_ENDPOINTS[exchange].orderbook,
  });

  // 릴레이 실패 시 오류 반환
  if (!proxyResponse.success) {
    const statusCode = proxyResponse.error?.statusCode ?? 502;
    return NextResponse.json(
      {
        success: false,
        error: proxyResponse.error,
      },
      { status: statusCode },
    );
  }

  // 응답 데이터 정규화
  try {
    const normalizedData = normalizeOrderbook(exchange, proxyResponse.data);

    return NextResponse.json({
      success: true,
      data: normalizedData,
      cached: proxyResponse.cached,
      stale: proxyResponse.stale,
      dataTimestamp: proxyResponse.dataTimestamp,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: `응답 데이터 정규화 실패: ${error instanceof Error ? error.message : String(error)}`,
          code: 'NORMALIZATION_ERROR',
        },
      },
      { status: 500 },
    );
  }
}
