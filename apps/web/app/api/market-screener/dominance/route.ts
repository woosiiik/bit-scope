/**
 * 시가총액 도미넌스 Route Handler
 *
 * GET /api/market-screener/dominance
 * CoinGecko /global API에서 시가총액 도미넌스 데이터를 프록시한다.
 */

import { NextResponse } from 'next/server';
import { buildCacheKey, getGlobalCache } from '../../exchange/_lib/cache';

const COINGECKO_GLOBAL_URL = 'https://api.coingecko.com/api/v3/global';
const CACHE_TTL = 300_000; // 5분 (CoinGecko 무료 제한 대응)

export async function GET(): Promise<NextResponse> {
  const cache = getGlobalCache();
  const cacheKey = buildCacheKey('ms', 'dominance');

  const cached = cache.getWithStale(cacheKey);
  if (cached.hit && cached.isFresh) {
    return NextResponse.json({ ...(cached.data as object), cached: true });
  }

  try {
    const res = await fetch(COINGECKO_GLOBAL_URL, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`CoinGecko error: ${res.status}`);
    }

    const raw = await res.json() as {
      data?: {
        market_cap_percentage?: Record<string, number>;
        total_market_cap?: Record<string, number>;
        total_volume?: Record<string, number>;
      };
    };

    const pct = raw?.data?.market_cap_percentage ?? {};
    const totalMarketCapUsd = raw?.data?.total_market_cap?.usd ?? 0;
    const totalVolumeUsd = raw?.data?.total_volume?.usd ?? 0;

    // 주요 코인 도미넌스 추출 (스테이블코인 제외)
    const stablecoins = ['usdt', 'usdc', 'dai', 'busd', 'tusd', 'usdp', 'fdusd'];
    const entries = Object.entries(pct)
      .filter(([key]) => !stablecoins.includes(key))
      .map(([key, value]) => ({ symbol: key.toUpperCase(), percentage: value }))
      .sort((a, b) => b.percentage - a.percentage);

    // 상위 코인 + Others
    const top = entries.slice(0, 6);
    const othersSum = entries.slice(6).reduce((s, e) => s + e.percentage, 0);
    // 스테이블코인 제외로 합이 100%가 안 될 수 있으므로 정규화
    const totalPct = top.reduce((s, e) => s + e.percentage, 0) + othersSum;
    const normalized = [
      ...top.map((e) => ({ ...e, percentage: (e.percentage / totalPct) * 100 })),
      { symbol: 'Others', percentage: (othersSum / totalPct) * 100 },
    ];

    const response = {
      success: true,
      data: {
        dominance: normalized,
        totalMarketCapUsd,
        totalVolumeUsd,
      },
      timestamp: Date.now(),
    };

    cache.set(cacheKey, response, CACHE_TTL);

    return NextResponse.json({ ...response, cached: false });
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
