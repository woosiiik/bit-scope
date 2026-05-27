/**
 * 멀티 거래소 선물 대시보드 동적 Route Handler
 *
 * GET /api/futures-dashboard/[indicator]?coin=BTC&period=1m
 *
 * 12개 지표를 단일 동적 라우트에서 처리한다.
 * 서버 캐시를 거쳐 6개 거래소에 병렬 요청을 보내고 정규화된 응답을 반환한다.
 */

import { type NextRequest, NextResponse } from 'next/server';
import type { FuturesDashboardIndicator, Period } from '@bitscope/shared';
import { VALID_INDICATORS, SNAPSHOT_INDICATORS, KLINE_INDICATORS } from '@bitscope/shared';
import { buildCacheKey, getGlobalCache } from '../../exchange/_lib/cache';
import { fetchMultiExchangeIndicator } from '../_lib/fetch-indicator';

interface RouteParams {
  params: Promise<{ indicator: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteParams,
): Promise<NextResponse> {
  const { indicator: indicatorParam } = await context.params;
  const coin = request.nextUrl.searchParams.get('coin') ?? 'BTC';
  const period = (request.nextUrl.searchParams.get('period') as Period | null) ?? undefined;

  // 지표 유효성 검증
  if (!VALID_INDICATORS.includes(indicatorParam as FuturesDashboardIndicator)) {
    return NextResponse.json(
      {
        success: false,
        error: { message: `유효하지 않은 지표입니다: ${indicatorParam}`, code: 'INVALID_INDICATOR' },
      },
      { status: 400 },
    );
  }

  const indicator = indicatorParam as FuturesDashboardIndicator;

  // 서버 캐시 확인
  const cache = getGlobalCache();
  const cacheKey = buildCacheKey('fd', indicator, {
    coin,
    ...(period ? { period } : {}),
  });

  const cached = cache.getWithStale(cacheKey);
  if (cached.hit && cached.isFresh) {
    return NextResponse.json({
      success: true,
      ...(cached.data as object),
      cached: true,
    });
  }

  try {
    // 멀티 거래소 데이터 수집
    const result = await fetchMultiExchangeIndicator(indicator, coin, { period });

    // 캐시 저장 (TTL 분류)
    const ttl = getCacheTtl(indicator);
    cache.set(cacheKey, result, ttl);

    return NextResponse.json({
      success: true,
      ...result,
      cached: false,
    });
  } catch (error) {
    // 스테일 캐시 폴백
    if (cached.hit && cached.data) {
      return NextResponse.json({
        success: true,
        ...(cached.data as object),
        cached: true,
        stale: true,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          message: `데이터 수집 실패: ${error instanceof Error ? error.message : String(error)}`,
          code: 'FETCH_ERROR',
        },
      },
      { status: 500 },
    );
  }
}

function getCacheTtl(indicator: FuturesDashboardIndicator): number {
  if (SNAPSHOT_INDICATORS.includes(indicator)) return 30_000;
  if (KLINE_INDICATORS.includes(indicator)) return 600_000;
  return 300_000;
}
