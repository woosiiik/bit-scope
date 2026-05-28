/**
 * Liquidations 프록시 Route Handler
 *
 * GET /api/futures-dashboard/liquidations?coin=BTC&period=1d
 * apps/api의 /liquidations 엔드포인트를 프록시한다.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { buildCacheKey, getGlobalCache } from '../../exchange/_lib/cache';

import { getApiBaseUrl } from '@/lib/api-url';
const CACHE_TTL = 60_000; // 1분

export async function GET(request: NextRequest): Promise<NextResponse> {
  const coin = request.nextUrl.searchParams.get('coin') ?? 'BTC';
  const period = request.nextUrl.searchParams.get('period') ?? '1d';

  const cache = getGlobalCache();
  const cacheKey = buildCacheKey('fd', 'liquidations', { coin, period });

  const cached = cache.getWithStale(cacheKey);
  if (cached.hit && cached.isFresh) {
    return NextResponse.json({ ...(cached.data as object), cached: true });
  }

  try {
    const url = `${getApiBaseUrl()}/liquidations?symbol=${coin}&period=${period}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }

    const data = await res.json();
    cache.set(cacheKey, data, CACHE_TTL);

    return NextResponse.json({ ...data, cached: false });
  } catch (error) {
    if (cached.hit && cached.data) {
      return NextResponse.json({ ...(cached.data as object), cached: true, stale: true });
    }
    return NextResponse.json(
      { success: false, error: { message: error instanceof Error ? error.message : String(error) } },
      { status: 502 },
    );
  }
}
