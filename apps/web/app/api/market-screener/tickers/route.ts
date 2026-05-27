/**
 * 마켓 스크리너 Tickers Route Handler
 *
 * GET /api/market-screener/tickers
 * 6개 거래소 벌크 ticker → 정규화 → 집계 → 캐싱
 */

import { NextResponse } from 'next/server';
import { buildCacheKey, getGlobalCache } from '../../exchange/_lib/cache';
import { fetchAllBulkTickers } from '../_lib/bulk-ticker-fetcher';
import { aggregateCoins } from '../_lib/coin-aggregator';

const CACHE_TTL = 30_000; // 30초

export async function GET(): Promise<NextResponse> {
  const cache = getGlobalCache();
  const cacheKey = buildCacheKey('ms', 'tickers');

  // 캐시 확인
  const cached = cache.getWithStale(cacheKey);
  if (cached.hit && cached.isFresh) {
    return NextResponse.json({ ...(cached.data as object), cached: true }, {
      headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' },
    });
  }

  try {
    const { tickers, errors, exchangeCount } = await fetchAllBulkTickers();
    const { coins, exchangeVolumes, exchangeOI } = aggregateCoins(tickers);

    const response = {
      success: true,
      data: { coins, exchangeVolumes, exchangeOI },
      errors,
      exchangeCount,
      timestamp: Date.now(),
    };

    cache.set(cacheKey, response, CACHE_TTL);

    return NextResponse.json({ ...response, cached: false }, {
      headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' },
    });
  } catch (error) {
    // 스테일 캐시 폴백
    if (cached.hit && cached.data) {
      return NextResponse.json({ ...(cached.data as object), cached: true, stale: true });
    }

    return NextResponse.json(
      { success: false, error: { message: error instanceof Error ? error.message : String(error), code: 'FETCH_ERROR' } },
      { status: 500 },
    );
  }
}
