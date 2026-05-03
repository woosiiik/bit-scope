/**
 * 주문 내역 조회 릴레이 Route Handler
 *
 * 클라이언트가 서명한 거래소 주문 내역 조회 요청을 거래소 API에 릴레이하고,
 * 응답을 통일된 내부 데이터 모델(NormalizedOrderHistory)로 정규화하여 반환한다.
 *
 * 주문 내역 조회는 인증이 필요한 API이므로 POST 메서드만 지원한다.
 * 클라이언트에서 거래소별 인증 방식(JWT/HMAC)으로 서명한 요청을 body로 전달한다.
 *
 * - POST 메서드: 서명된 요청을 통한 주문 내역 조회
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
import { SUPPORTED_EXCHANGES, EXCHANGE_ENDPOINTS } from '@bitscope/shared';
import { relayRequest } from '../../_lib/proxy';
import { normalizeOrderHistory } from '../../_lib/normalizer';

/** Route Handler 파라미터 타입 */
interface RouteParams {
  params: Promise<{
    exchange: string;
  }>;
}

/**
 * 주문 내역 조회 릴레이 핸들러 (POST)
 *
 * 클라이언트가 서명한 거래소 주문 내역 조회 요청을 수신하여
 * 거래소 API에 릴레이하고 정규화된 응답을 반환한다.
 *
 * 요청 본문(body)에는 서명된 요청 정보(SignedRequest)가 포함되어야 한다.
 * API Key 원문은 포함되지 않으며, 서명된 헤더(JWT 토큰 또는 HMAC 서명)만 전달된다.
 *
 * @param request Next.js 요청 객체
 * @param context Route 파라미터 (exchange: 거래소 식별자)
 * @returns 정규화된 주문 내역 데이터 또는 오류 응답
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

  // 거래소 API에 릴레이
  const proxyResponse = await relayRequest({
    exchange,
    signedRequest,
    cacheEndpoint: EXCHANGE_ENDPOINTS[exchange].orders,
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
    const normalizedData = normalizeOrderHistory(exchange, proxyResponse.data);

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
