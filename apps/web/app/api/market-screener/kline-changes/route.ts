/**
 * Kline Changes Route Handler
 *
 * GET /api/market-screener/kline-changes?period=1w|1m
 * Binance Kline API로 주요 코인의 7일/30일 가격 변화율을 계산한다.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { buildCacheKey, getGlobalCache } from '../../exchange/_lib/cache';
import type { ChartPeriod } from '@bitscope/shared';

const FETCH_TIMEOUT = 10_000;
const CACHE_TTL = 300_000; // 5분

/** 주요 코인 (API 호출 수 제한을 위해 상위 50개) */
const TOP_COINS = [
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'TRX', 'LINK',
  'DOT', 'SUI', 'SHIB', 'TON', 'XLM', 'HBAR', 'BCH', 'LTC', 'UNI', 'PEPE',
  'NEAR', 'APT', 'FIL', 'ARB', 'OP', 'ATOM', 'RENDER', 'FET', 'AAVE', 'MKR',
  'INJ', 'SEI', 'STX', 'IMX', 'GRT', 'ALGO', 'BONK', 'WIF', 'FLOKI', 'ENA',
  'ONDO', 'TIA', 'JUP', 'WLD', 'TAO', 'RUNE', 'PENDLE', 'DYDX', 'CRV', 'FTM',
];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const period = (request.nextUrl.searchParams.get('period') as ChartPeriod) ?? '1w';

  if (period !== '1w' && period !== '1m') {
    return NextResponse.json(
      { success: false, error: { message: 'period must be 1w or 1m' } },
      { status: 400 },
    );
  }

  const cache = getGlobalCache();
  const cacheKey = buildCacheKey('ms', 'kline-changes', { period });

  const cached = cache.getWithStale(cacheKey);
  if (cached.hit && cached.isFresh) {
    return NextResponse.json({ ...(cached.data as object), cached: true });
  }

  try {
    const interval = period === '1w' ? '1d' : '1d';
    const limit = period === '1w' ? 7 : 30;

    // 상위 50개 코인에 대해 병렬로 Kline 호출
    const results = await Promise.allSettled(
      TOP_COINS.map(async (coin) => {
        const symbol = `${coin}USDT`;
        const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
        if (!res.ok) return { coin, change: 0 };

        const klines = await res.json();
        if (!Array.isArray(klines) || klines.length < 2) return { coin, change: 0 };

        const firstOpen = parseFloat(klines[0][1]) || 0;
        const lastClose = parseFloat(klines[klines.length - 1][4]) || 0;

        if (firstOpen === 0) return { coin, change: 0 };
        return { coin, change: ((lastClose - firstOpen) / firstOpen) * 100 };
      }),
    );

    const changes: Record<string, number> = {};
    for (const result of results) {
      if (result.status === 'fulfilled') {
        changes[result.value.coin] = result.value.change;
      }
    }

    const response = { success: true, data: changes, period, timestamp: Date.now() };
    cache.set(cacheKey, response, CACHE_TTL);

    return NextResponse.json({ ...response, cached: false });
  } catch (error) {
    if (cached.hit && cached.data) {
      return NextResponse.json({ ...(cached.data as object), cached: true, stale: true });
    }
    return NextResponse.json(
      { success: false, error: { message: error instanceof Error ? error.message : String(error) } },
      { status: 500 },
    );
  }
}
