/**
 * 시세(Ticker) 조회 릴레이 Route Handler
 *
 * 거래소의 코인 시세(현재가, 변동률, 거래량 등)를 조회한다.
 * 시세 조회는 공개 API이므로 서명이 불필요하며, GET 요청으로 처리한다.
 * 클라이언트가 서명된 요청을 전달하는 POST 방식도 지원한다.
 *
 * - GET 메서드: 공개 시세 조회 (쿼리 파라미터로 심볼 지정)
 * - POST 메서드: 서명된 요청을 통한 시세 조회 (인증이 필요한 경우)
 * - 캐싱: 기본 TTL 10초 (인메모리 캐시)
 * - Rate Limit: 거래소별 토큰 버킷 기반 제한
 * - 타임아웃: 10초
 *
 * @see 요구사항 5.1 (거래소별 전체 코인 시세 목록 표시)
 * @see 요구사항 5.2 (실시간 시세 업데이트)
 * @see 요구사항 12.3 (서명된 요청 릴레이 및 응답 반환)
 * @see 요구사항 12.4 (응답 데이터 통일된 내부 데이터 모델 정규화)
 */

import { NextRequest, NextResponse } from 'next/server';
import type { ExchangeType, SignedRequest } from '@bitscope/shared';
import {
  SUPPORTED_EXCHANGES,
  EXCHANGE_CONFIGS,
  EXCHANGE_ENDPOINTS,
} from '@bitscope/shared';
import { relayRequest } from '../../_lib/proxy';
import { normalizeTicker } from '../../_lib/normalizer';

/** Route Handler 파라미터 타입 */
interface RouteParams {
  params: Promise<{
    exchange: string;
  }>;
}

/**
 * 업비트 시세 조회를 위한 마켓 코드를 생성한다.
 *
 * @param symbols 코인 심볼 배열 (예: ["BTC", "ETH"])
 * @returns 업비트 마켓 코드 문자열 (예: "KRW-BTC,KRW-ETH")
 */
function buildUpbitMarkets(symbols: string[]): string {
  return symbols.map((s) => `KRW-${s.toUpperCase()}`).join(',');
}

/**
 * 거래소별 시세 조회 URL을 생성한다.
 *
 * @param exchange 거래소 식별자
 * @param symbols 코인 심볼 배열
 * @returns 거래소 시세 조회 URL
 */
async function fetchUpbitKrwMarkets(): Promise<string[]> {
  try {
    const res = await fetch('https://api.upbit.com/v1/market/all?is_details=false', {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const markets = (await res.json()) as Array<{ market: string }>;
    return markets
      .filter((m) => m.market.startsWith('KRW-'))
      .map((m) => m.market);
  } catch {
    return [];
  }
}

function buildTickerUrl(exchange: ExchangeType, symbols?: string[], upbitMarkets?: string[]): string {
  const baseUrl = EXCHANGE_CONFIGS[exchange].restBaseUrl;
  const endpoint = EXCHANGE_ENDPOINTS[exchange].ticker;

  switch (exchange) {
    case 'upbit': {
      if (symbols) {
        return `${baseUrl}${endpoint}?markets=${buildUpbitMarkets(symbols)}`;
      }
      // 전체 KRW 마켓 조회
      const markets = upbitMarkets && upbitMarkets.length > 0
        ? upbitMarkets.join(',')
        : 'KRW-BTC';
      return `${baseUrl}${endpoint}?markets=${markets}`;
    }
    case 'bithumb': {
      // 빗썸: /public/ticker/{코인}_{결제통화} 또는 /public/ticker/ALL_KRW
      const bithumbSymbol = symbols?.[0];
      if (bithumbSymbol && symbols.length === 1) {
        return `${baseUrl}${endpoint}/${bithumbSymbol.toUpperCase()}_KRW`;
      }
      return `${baseUrl}${endpoint}/ALL_KRW`;
    }
    case 'coinone': {
      // 코인원: /public/v2/ticker_new/KRW/{코인} 또는 전체 목록
      const coinoneSymbol = symbols?.[0];
      if (coinoneSymbol && symbols.length === 1) {
        return `${baseUrl}${endpoint}/${coinoneSymbol.toUpperCase()}`;
      }
      return `${baseUrl}${endpoint}`;
    }
    default:
      return `${baseUrl}${endpoint}`;
  }
}

/**
 * 공개 시세 조회 (GET)
 *
 * 쿼리 파라미터로 조회할 코인 심볼을 지정한다.
 * 시세 데이터는 공개 API이므로 인증(서명)이 불필요하다.
 *
 * @param request Next.js 요청 객체
 * @param context Route 파라미터 (exchange: 거래소 식별자)
 * @returns 정규화된 시세 데이터 또는 오류 응답
 *
 * @example
 * GET /api/exchange/upbit/ticker?symbols=BTC,ETH
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

  // 쿼리 파라미터에서 심볼 목록 추출
  const symbolsParam = request.nextUrl.searchParams.get('symbols');
  const symbols = symbolsParam
    ? symbolsParam.split(',').map((s) => s.trim().toUpperCase())
    : undefined;

  // 업비트 전체 조회 시 KRW 마켓 목록을 먼저 가져온다
  let upbitMarkets: string[] | undefined;
  if (exchange === 'upbit' && !symbols) {
    upbitMarkets = await fetchUpbitKrwMarkets();
  }

  // 거래소별 시세 조회 URL 생성
  const tickerUrl = buildTickerUrl(exchange, symbols, upbitMarkets);

  // 공개 API이므로 별도 서명 없이 직접 요청
  const signedRequest: SignedRequest = {
    url: tickerUrl,
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };

  // 캐시 파라미터 생성
  const cacheParams = symbols ? { symbols: symbols.join(',') } : undefined;

  // 거래소 API에 릴레이
  const proxyResponse = await relayRequest({
    exchange,
    signedRequest,
    cacheEndpoint: EXCHANGE_ENDPOINTS[exchange].ticker,
    cacheParams,
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
    const symbol = symbols && symbols.length === 1 ? symbols[0] : undefined;
    const normalizedData = normalizeTicker(exchange, proxyResponse.data, symbol);

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
 * 서명된 요청을 통한 시세 조회 (POST)
 *
 * 클라이언트가 직접 서명한 요청을 거래소 API에 릴레이한다.
 * 인증이 필요한 특수한 시세 API 호출이나, 클라이언트가 직접 URL을 구성한 경우에 사용한다.
 *
 * @param request Next.js 요청 객체
 * @param context Route 파라미터 (exchange: 거래소 식별자)
 * @returns 정규화된 시세 데이터 또는 오류 응답
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
  let body: { signedRequest: SignedRequest; symbol?: string };
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

  const { signedRequest, symbol } = body;

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
    cacheEndpoint: EXCHANGE_ENDPOINTS[exchange].ticker,
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
    const normalizedData = normalizeTicker(exchange, proxyResponse.data, symbol);

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
