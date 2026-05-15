/**
 * 잔고 조회 릴레이 Route Handler
 *
 * 클라이언트가 서명한 거래소 잔고 조회 요청을 거래소 API에 릴레이하고,
 * 응답을 통일된 내부 데이터 모델(NormalizedBalance)로 정규화하여 반환한다.
 *
 * - POST 메서드: 클라이언트가 서명된 요청 정보를 body로 전달
 * - 캐싱: 기본 TTL 10초 (인메모리 캐시)
 * - Rate Limit: 거래소별 토큰 버킷 기반 제한
 * - 타임아웃: 10초
 *
 * @see 요구사항 12.2 (API Key 원문은 서버로 전송되지 않음)
 * @see 요구사항 12.3 (서명된 요청 릴레이 및 응답 반환)
 * @see 요구사항 12.4 (응답 데이터 통일된 내부 데이터 모델 정규화)
 * @see 요구사항 8.15, 8.16 (API Key 원문 서버 전송 금지)
 */

import { type NextRequest, NextResponse } from 'next/server';
import type { ExchangeType, SignedRequest } from '@bitscope/shared';
import { SUPPORTED_EXCHANGES, EXCHANGE_ENDPOINTS, HYPERLIQUID_CONFIG } from '@bitscope/shared';
import { relayRequest } from '../../_lib/proxy';
import { normalizeBalance, normalizeFuturesBalance } from '../../_lib/normalizer';

/** Futures 잔고 조회를 지원하는 거래소 목록 */
const FUTURES_EXCHANGES: readonly ExchangeType[] = ['binance', 'gate', 'bitget', 'lbank'] as const;

/** Route Handler 파라미터 타입 */
interface RouteParams {
  params: Promise<{
    exchange: string;
  }>;
}

/**
 * 잔고 조회 릴레이 핸들러
 *
 * 클라이언트가 서명한 거래소 잔고 조회 요청을 수신하여
 * 거래소 API에 릴레이하고 정규화된 응답을 반환한다.
 *
 * 요청 본문(body)에는 서명된 요청 정보(SignedRequest)가 포함되어야 한다.
 * API Key 원문은 포함되지 않으며, 서명된 헤더(JWT 토큰 또는 HMAC 서명)만 전달된다.
 *
 * @param request Next.js 요청 객체
 * @param context Route 파라미터 (exchange: 거래소 식별자)
 * @returns 정규화된 잔고 데이터 또는 오류 응답
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

  // 하이퍼리퀴드 특수 처리: 서명 없이 직접 API 호출
  // clearinghouseState(Perps)와 spotClearinghouseState(Spot)를 병렬로 조회하여 합친다
  if (exchange === 'hyperliquid') {
    return handleHyperliquidBalance(signedRequest);
  }

  // Futures 잔고 조회 처리: X-Balance-Type: futures 헤더가 있으면
  // Futures API로 릴레이하고 USDT 합계만 반환한다
  const balanceType = request.headers.get('X-Balance-Type');
  if (balanceType === 'futures' && (FUTURES_EXCHANGES as readonly string[]).includes(exchange)) {
    return handleFuturesBalance(exchange, signedRequest);
  }

  // 거래소 API에 릴레이
  const proxyResponse = await relayRequest({
    exchange,
    signedRequest,
    cacheEndpoint: EXCHANGE_ENDPOINTS[exchange].balance,
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
    const normalizedData = normalizeBalance(exchange, proxyResponse.data);


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
 * 하이퍼리퀴드 잔고 조회 핸들러
 *
 * 하이퍼리퀴드는 API Key 없이 지갑 주소만으로 잔고를 조회한다.
 * clearinghouseState(Perps)와 spotClearinghouseState(Spot)를 병렬로 호출하여
 * 합친 후 정규화한다.
 *
 * @param signedRequest 서명된 요청 (body에 지갑 주소 포함)
 * @returns 정규화된 잔고 데이터 또는 오류 응답
 */
async function handleHyperliquidBalance(signedRequest: SignedRequest): Promise<NextResponse> {
  // signedRequest.body에서 지갑 주소 추출
  let walletAddress: string;
  try {
    const requestBody = JSON.parse(signedRequest.body || '{}');
    walletAddress = requestBody.user;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: '하이퍼리퀴드 요청에서 지갑 주소를 추출할 수 없습니다.',
          code: 'INVALID_REQUEST_BODY',
        },
      },
      { status: 400 },
    );
  }

  if (!walletAddress) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: '지갑 주소가 필요합니다.',
          code: 'MISSING_WALLET_ADDRESS',
        },
      },
      { status: 400 },
    );
  }

  const baseUrl = HYPERLIQUID_CONFIG.restBaseUrl;

  try {
    // clearinghouseState(Perps)와 spotClearinghouseState(Spot)를 병렬로 호출
    const [perpsResponse, spotResponse] = await Promise.all([
      fetch(`${baseUrl}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'clearinghouseState', user: walletAddress }),
        signal: AbortSignal.timeout(HYPERLIQUID_CONFIG.timeoutMs),
      }),
      fetch(`${baseUrl}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'spotClearinghouseState', user: walletAddress }),
        signal: AbortSignal.timeout(HYPERLIQUID_CONFIG.timeoutMs),
      }),
    ]);

    if (!perpsResponse.ok && !spotResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: '하이퍼리퀴드 API 호출에 실패했습니다.',
            code: 'EXCHANGE_API_ERROR',
            statusCode: perpsResponse.status,
          },
        },
        { status: 502 },
      );
    }

    const perpsData = perpsResponse.ok ? await perpsResponse.json() : null;
    const spotData = spotResponse.ok ? await spotResponse.json() : null;

    // 합쳐서 정규화
    const combinedData = {
      perps: perpsData,
      spot: spotData,
    };

    const normalizedData = normalizeBalance('hyperliquid', combinedData);

    return NextResponse.json({
      success: true,
      data: normalizedData,
      cached: false,
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    return NextResponse.json(
      {
        success: false,
        error: {
          message: isTimeout
            ? '하이퍼리퀴드 API 응답 시간이 초과되었습니다.'
            : `하이퍼리퀴드 API 호출 실패: ${error instanceof Error ? error.message : String(error)}`,
          code: isTimeout ? 'TIMEOUT' : 'EXCHANGE_API_ERROR',
        },
      },
      { status: 502 },
    );
  }
}

/**
 * Futures 잔고 조회 핸들러
 *
 * 바이낸스/Gate.io/Bitget의 Futures 잔고를 조회하여
 * USDT 합계만 반환한다. 서명된 요청을 거래소 Futures API에 릴레이하고,
 * 응답을 정규화하여 futuresBalanceUsdt 필드로 반환한다.
 *
 * Futures 조회 실패 시에도 Spot 잔고에는 영향을 주지 않는다 (Graceful Degradation).
 *
 * @param exchange 거래소 식별자
 * @param signedRequest 서명된 요청 (Futures 엔드포인트용)
 * @returns Futures USDT 합계 또는 오류 응답
 */
async function handleFuturesBalance(
  exchange: ExchangeType,
  signedRequest: SignedRequest,
): Promise<NextResponse> {
  const futuresEndpoint = EXCHANGE_ENDPOINTS[exchange].futures;

  // 거래소 API에 릴레이 (Futures 엔드포인트 캐시 키 사용)
  const proxyResponse = await relayRequest({
    exchange,
    signedRequest,
    cacheEndpoint: futuresEndpoint ?? 'futures',
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

  // Futures 응답 정규화: USDT 합계만 추출
  try {
    const futuresBalanceUsdt = normalizeFuturesBalance(exchange, proxyResponse.data);

    return NextResponse.json({
      success: true,
      data: { futuresBalanceUsdt },
      cached: proxyResponse.cached,
      stale: proxyResponse.stale,
      dataTimestamp: proxyResponse.dataTimestamp,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: `Futures 잔고 정규화 실패: ${error instanceof Error ? error.message : String(error)}`,
          code: 'NORMALIZATION_ERROR',
        },
      },
      { status: 500 },
    );
  }
}
