/**
 * 선물 포지션 조회 릴레이 Route Handler
 *
 * 클라이언트가 서명한 거래소 선물 포지션 조회 요청을 거래소 API에 릴레이하고,
 * 응답을 통일된 FuturesPosition[] 타입으로 정규화하여 반환한다.
 *
 * 지원 거래소: Binance, Gate.io, Bitget
 *
 * - POST 메서드: 서명된 요청을 통한 선물 포지션 조회
 * - 캐싱: 기본 TTL 10초 (인메모리 캐시)
 * - Rate Limit: 거래소별 토큰 버킷 기반 제한
 * - 타임아웃: 10초
 */

import { type NextRequest, NextResponse } from 'next/server';
import type { FuturesExchangeType, SignedRequest } from '@bitscope/shared';
import { EXCHANGE_ENDPOINTS, HYPERLIQUID_CONFIG } from '@bitscope/shared';
import { relayRequest } from '../../_lib/proxy';
import { normalizeFuturesPositions } from '../../_lib/normalizer';

/** 선물 포지션 지원 거래소 */
const FUTURES_POSITION_EXCHANGES: readonly string[] = ['binance', 'bybit', 'okx', 'gate', 'bitget', 'hyperliquid'] as const;

/** Route Handler 파라미터 타입 */
interface RouteParams {
  params: Promise<{
    exchange: string;
  }>;
}

/**
 * 선물 포지션 조회 릴레이 핸들러 (POST)
 */
export async function POST(
  request: NextRequest,
  context: RouteParams,
): Promise<NextResponse> {
  const { exchange: exchangeParam } = await context.params;

  // 거래소 식별자 유효성 검증
  if (!FUTURES_POSITION_EXCHANGES.includes(exchangeParam)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: `선물 포지션을 지원하지 않는 거래소입니다: ${exchangeParam}`,
          code: 'INVALID_EXCHANGE',
        },
      },
      { status: 400 },
    );
  }

  const exchange = exchangeParam as FuturesExchangeType;

  // 요청 본문 파싱
  let signedRequest: SignedRequest;
  try {
    const body = await request.json();
    signedRequest = body.signedRequest ?? body;
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

  // 하이퍼리퀴드 특수 처리: 서명 없이 POST /info로 직접 호출
  if (exchange === 'hyperliquid') {
    return handleHyperliquidPositions(signedRequest);
  }

  // 서명된 요청 필수 필드 검증
  if (!signedRequest.url || !signedRequest.method || !signedRequest.headers) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: '서명된 요청 정보가 불완전합니다. url, method, headers가 필요합니다.',
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
    cacheEndpoint: EXCHANGE_ENDPOINTS[exchange].futuresPositions,
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
    const positions = normalizeFuturesPositions(exchange, proxyResponse.data);

    return NextResponse.json({
      success: true,
      data: {
        exchange,
        positions,
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
          message: `응답 데이터 정규화 실패: ${error instanceof Error ? error.message : String(error)}`,
          code: 'NORMALIZATION_ERROR',
        },
      },
      { status: 500 },
    );
  }
}

/**
 * 하이퍼리퀴드 선물 포지션 조회 (직접 호출)
 *
 * 하이퍼리퀴드는 서명이 불필요하므로 POST /info에 직접 호출한다.
 * clearinghouseState의 assetPositions에서 포지션 데이터를 추출한다.
 */
async function handleHyperliquidPositions(signedRequest: SignedRequest): Promise<NextResponse> {
  // body에서 지갑 주소 추출
  const body = signedRequest.body ? JSON.parse(signedRequest.body) : null;
  const walletAddress = body?.user;

  if (!walletAddress) {
    return NextResponse.json(
      { success: false, error: { message: '지갑 주소가 필요합니다.', code: 'MISSING_WALLET_ADDRESS' } },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(`${HYPERLIQUID_CONFIG.restBaseUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'clearinghouseState', user: walletAddress }),
      signal: AbortSignal.timeout(HYPERLIQUID_CONFIG.timeoutMs),
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: { message: '하이퍼리퀴드 API 호출에 실패했습니다.', code: 'EXCHANGE_API_ERROR', statusCode: response.status } },
        { status: 502 },
      );
    }

    const rawData = await response.json();
    const positions = normalizeFuturesPositions('hyperliquid', rawData);

    return NextResponse.json({
      success: true,
      data: { exchange: 'hyperliquid', positions, timestamp: Date.now() },
      cached: false,
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    return NextResponse.json(
      {
        success: false,
        error: {
          message: isTimeout ? '하이퍼리퀴드 API 응답 시간 초과' : `하이퍼리퀴드 API 호출 실패: ${error instanceof Error ? error.message : String(error)}`,
          code: isTimeout ? 'TIMEOUT' : 'EXCHANGE_API_ERROR',
        },
      },
      { status: 502 },
    );
  }
}
