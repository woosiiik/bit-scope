/**
 * 주식-perp 비교 뷰 Route Handler
 *
 * GET /api/stock-perp-comparison?pair=005930.KS&range=5d
 *
 * 기존 futures-dashboard `[indicator]/route.ts` 패턴을 미러링한 단일 통합 엔드포인트.
 * 서버 캐시(`getGlobalCache`/`getWithStale`)를 거쳐 세 소스(주식/환율/perp)를 병렬 조회한 뒤
 * 정규화·환율 변환·타임라인 병합을 수행하여 `ComparisonResponse`를 반환한다(baseCurrency='KRW').
 *
 * interval은 사용자가 직접 보내지 않고 `range`로부터 서버가 결정한다(R8.2/R8.4).
 * 모든 사용자 노출 메시지는 한국어다(R10.2).
 */

import { type NextRequest, NextResponse } from 'next/server';
import type { ComparisonRange, ComparisonResponse, StockPerpPair } from '@bitscope/shared';
import { DEFAULT_PAIR, DEFAULT_RANGE, PAIR_CONFIGS, RANGE_TO_INTERVAL } from '@bitscope/shared';
import { buildCacheKey, getGlobalCache } from '../exchange/_lib/cache';
import { fetchComparison } from './_lib/fetch-comparison';
import { normalizeHyperliquidCandles, normalizeYahooCandles, normalizeFrankfurterRate } from './_lib/normalizer';
import { intervalToMs, mergeTimeline } from './_lib/merge-timeline';

/** 유효한 range 토큰 집합 (RANGE_TO_INTERVAL 키에서 파생) */
const VALID_RANGES = Object.keys(RANGE_TO_INTERVAL) as ComparisonRange[];

/** 비교 데이터 서버 캐시 TTL (ms) — 단기(1d/5d)는 60초, 그 외는 600초 */
function getCacheTtl(range: ComparisonRange): number {
  return range === '1d' || range === '5d' ? 60_000 : 600_000;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const pairParam = request.nextUrl.searchParams.get('pair') ?? DEFAULT_PAIR?.stockSymbol ?? '';
  const rangeParam = request.nextUrl.searchParams.get('range') ?? DEFAULT_RANGE;

  // range 유효성 검증.
  if (!VALID_RANGES.includes(rangeParam as ComparisonRange)) {
    return NextResponse.json(
      {
        success: false,
        error: { message: `유효하지 않은 시간 범위입니다: ${rangeParam}`, code: 'INVALID_RANGE' },
      },
      { status: 400 },
    );
  }
  const range = rangeParam as ComparisonRange;

  // pair 유효성 검증 → perp 코인 결정(R1.2).
  const pairConfig: StockPerpPair | undefined = PAIR_CONFIGS.find(
    (p) => p.stockSymbol === pairParam,
  );
  if (!pairConfig) {
    return NextResponse.json(
      {
        success: false,
        error: { message: `유효하지 않은 종목입니다: ${pairParam}`, code: 'INVALID_PAIR' },
      },
      { status: 400 },
    );
  }

  // 서버 캐시 확인(pair+range 단위).
  const cache = getGlobalCache();
  const cacheKey = buildCacheKey('spc', pairConfig.stockSymbol, { range });

  const cached = cache.getWithStale<ComparisonResponse>(cacheKey);
  if (cached.hit && cached.isFresh) {
    return NextResponse.json({
      success: true,
      ...(cached.data as object),
      cached: true,
    });
  }

  try {
    // 병렬 fetch + 부분 실패/폴백.
    const fetched = await fetchComparison(pairConfig.stockSymbol, pairConfig.perpCoin, range);

    // 정규화.
    const stockNormalized = normalizeYahooCandles(fetched.stockRaw);
    const ratePoints = normalizeFrankfurterRate(fetched.rateRaw);
    const perpCandles = normalizeHyperliquidCandles(fetched.perpRaw);

    // 타임라인 병합 + 통화 변환(baseCurrency='KRW').
    const intervalMs = intervalToMs(fetched.appliedInterval);
    const points = mergeTimeline(stockNormalized.candles, perpCandles, ratePoints, intervalMs);

    const response: ComparisonResponse = {
      pair: pairConfig,
      range,
      requestedInterval: fetched.requestedInterval,
      appliedInterval: fetched.appliedInterval,
      fallbackApplied: fetched.fallbackApplied,
      baseCurrency: 'KRW',
      points,
      meta: {
        stockTimezone: stockNormalized.meta.exchangeTimezoneName,
        gmtoffset: stockNormalized.meta.gmtoffset,
        regularMarketPrice: stockNormalized.meta.regularMarketPrice,
      },
      errors: fetched.errors,
    };

    // 전 소스 실패(데이터 없음) → 스테일 캐시 폴백.
    const hasData = points.length > 0;
    const allFailed =
      fetched.errors.stock !== null &&
      fetched.errors.perp !== null &&
      fetched.errors.rate !== null;

    if (!hasData && allFailed && cached.hit && cached.data) {
      return NextResponse.json({
        success: true,
        ...(cached.data as object),
        cached: true,
        stale: true,
      });
    }

    // 캐시 저장(데이터가 있는 경우만).
    if (hasData) {
      cache.set(cacheKey, response, getCacheTtl(range));
    }

    return NextResponse.json({
      success: true,
      ...response,
      cached: false,
    });
  } catch (error) {
    // 스테일 캐시 폴백.
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
