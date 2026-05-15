/**
 * 선물 오더북(Futures Orderbook) 조회 릴레이 Route Handler
 *
 * 해외 거래소(Binance, Bybit, OKX, Gate, Bitget)의 선물 오더북(호가) 정보를 조회한다.
 * 선물 오더북 조회는 공개 API이므로 서명이 불필요하며, GET 요청으로 처리한다.
 *
 * - GET 메서드: 공개 선물 오더북 조회 (쿼리 파라미터로 baseAsset 지정)
 * - 캐싱: 기본 TTL 5초 (인메모리 캐시)
 * - Rate Limit: 거래소별 토큰 버킷 기반 제한
 * - 타임아웃: 10초
 *
 * @see 요구사항 5 (선물 오더북)
 * @see 요구사항 9.1 (선물 오더북 릴레이)
 * @see 설계 문서 - Route Handler 1: 선물 오더북
 */

import { type NextRequest, NextResponse } from 'next/server';
import type { ExchangeType, FuturesExchangeType, SignedRequest } from '@bitscope/shared';
import {
  FUTURES_EXCHANGES,
  EXCHANGE_CONFIGS,
  EXCHANGE_ENDPOINTS,
} from '@bitscope/shared';
import { relayRequest } from '../../_lib/proxy';
import { normalizeFuturesOrderbook } from '../../_lib/normalizer';

/** Route Handler 파라미터 타입 */
interface RouteParams {
  params: Promise<{
    exchange: string;
  }>;
}

/**
 * 거래소별 선물 오더북 조회 URL을 생성한다.
 *
 * 각 거래소의 선물 오더북 API 엔드포인트와 심볼 포맷에 맞게 URL을 구성한다.
 * Binance의 경우 Spot과 다른 도메인(fapi.binance.com)을 사용한다.
 *
 * @param exchange 거래소 식별자
 * @param symbol 기본 자산(baseAsset) (예: "BTC")
 * @returns 거래소 선물 오더북 조회 URL
 */
function buildFuturesOrderbookUrl(exchange: FuturesExchangeType, symbol: string): string {
  const config = EXCHANGE_CONFIGS[exchange as ExchangeType];
  const endpoints = EXCHANGE_ENDPOINTS[exchange as ExchangeType];
  const endpoint = endpoints.futuresOrderbook;
  const sym = symbol.toUpperCase();

  // Binance Futures는 별도 도메인(fapi.binance.com)을 사용한다
  const baseUrl = config.futuresBaseUrl ?? config.restBaseUrl;

  switch (exchange) {
    case 'binance':
      // Binance: GET /fapi/v1/depth?symbol=BTCUSDT&limit=20
      return `${baseUrl}${endpoint}?symbol=${sym}USDT&limit=20`;
    case 'bybit':
      // Bybit: GET /v5/market/orderbook?category=linear&symbol=BTCUSDT&limit=20
      return `${config.restBaseUrl}${endpoint}?category=linear&symbol=${sym}USDT&limit=20`;
    case 'okx':
      // OKX: GET /api/v5/market/books?instId=BTC-USDT-SWAP&sz=20
      return `${config.restBaseUrl}${endpoint}?instId=${sym}-USDT-SWAP&sz=20`;
    case 'gate':
      // Gate: GET /api/v4/futures/usdt/order_book?contract=BTC_USDT&limit=20
      return `${config.restBaseUrl}${endpoint}?contract=${sym}_USDT&limit=20`;
    case 'bitget':
      // Bitget: GET /api/v2/mix/market/depth?symbol=BTCUSDT&productType=USDT-FUTURES&limit=20
      return `${config.restBaseUrl}${endpoint}?symbol=${sym}USDT&productType=USDT-FUTURES&limit=20`;
    default:
      return `${config.restBaseUrl}${endpoint}`;
  }
}

/**
 * 공개 선물 오더북 조회 (GET)
 *
 * 쿼리 파라미터로 조회할 코인의 baseAsset을 지정한다.
 * 선물 오더북 데이터는 공개 API이므로 인증(서명)이 불필요하다.
 *
 * @param request Next.js 요청 객체
 * @param context Route 파라미터 (exchange: 거래소 식별자)
 * @returns 정규화된 선물 오더북 데이터 또는 오류 응답
 *
 * @example
 * GET /api/exchange/binance/futures-orderbook?symbol=BTC
 */
export async function GET(
  request: NextRequest,
  context: RouteParams,
): Promise<NextResponse> {
  const { exchange: exchangeParam } = await context.params;

  // 선물 거래소 식별자 유효성 검증 (FUTURES_EXCHANGES 사용)
  if (!FUTURES_EXCHANGES.includes(exchangeParam as FuturesExchangeType)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: `선물 거래를 지원하지 않는 거래소입니다: ${exchangeParam}`,
          code: 'INVALID_EXCHANGE',
        },
      },
      { status: 400 },
    );
  }

  const exchange = exchangeParam as FuturesExchangeType;

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

  // 거래소별 선물 오더북 조회 URL 생성
  const futuresOrderbookUrl = buildFuturesOrderbookUrl(exchange, symbol);

  // 공개 API이므로 별도 서명 없이 직접 요청
  const signedRequest: SignedRequest = {
    url: futuresOrderbookUrl,
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };

  // 거래소 API에 릴레이
  const proxyResponse = await relayRequest({
    exchange: exchange as ExchangeType,
    signedRequest,
    cacheEndpoint: EXCHANGE_ENDPOINTS[exchange as ExchangeType].futuresOrderbook,
    cacheParams: { symbol: symbol.toUpperCase(), type: 'futures' },
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
    const normalizedData = normalizeFuturesOrderbook(exchange, proxyResponse.data);
    // symbol을 정규화 데이터에 설정 (normalizeFuturesOrderbook은 빈 문자열로 초기화)
    normalizedData.symbol = symbol.toUpperCase();

    return NextResponse.json({
      success: true,
      data: {
        orderbook: normalizedData,
        timestamp: Date.now(),
      },
      cached: proxyResponse.cached,
      stale: proxyResponse.stale,
      dataTimestamp: proxyResponse.dataTimestamp,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: `선물 오더북 정규화 실패: ${error instanceof Error ? error.message : String(error)}`,
          code: 'NORMALIZATION_ERROR',
        },
      },
      { status: 500 },
    );
  }
}
