/**
 * New Listings Route Handler
 *
 * GET /api/market-screener/new-listings
 * Binance/Bybit/OKX exchangeInfo에서 최근 30일 이내 상장된 선물 코인을 감지한다.
 */

import { NextResponse } from 'next/server';
import { buildCacheKey, getGlobalCache } from '../../exchange/_lib/cache';
import { normalizeSymbol } from '../_lib/symbol-normalizer';
import type { NewListingCoin } from '@bitscope/shared';

const FETCH_TIMEOUT = 10_000;
const CACHE_TTL = 3_600_000; // 1시간
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET(): Promise<NextResponse> {
  const cache = getGlobalCache();
  const cacheKey = buildCacheKey('ms', 'new-listings');

  const cached = cache.getWithStale(cacheKey);
  if (cached.hit && cached.isFresh) {
    return NextResponse.json({ ...(cached.data as object), cached: true });
  }

  try {
    const now = Date.now();
    const cutoff = now - THIRTY_DAYS_MS;

    const [binanceData, bybitData] = await Promise.allSettled([
      fetchBinanceNewListings(cutoff),
      fetchBybitNewListings(cutoff),
    ]);

    const listings: NewListingCoin[] = [];
    const seen = new Map<string, number>();

    for (const result of [binanceData, bybitData]) {
      if (result.status === 'fulfilled') {
        for (const coin of result.value) {
          const existing = seen.get(coin.symbol);
          if (!existing || coin.listDate < existing) {
            seen.set(coin.symbol, coin.listDate);
            // 중복 제거: 가장 이른 상장일 사용
            const idx = listings.findIndex((l) => l.symbol === coin.symbol);
            if (idx >= 0) {
              listings[idx] = coin;
            } else {
              listings.push(coin);
            }
          }
        }
      }
    }

    listings.sort((a, b) => b.listDate - a.listDate);

    const response = { success: true, data: listings, timestamp: now };
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

async function fetchBinanceNewListings(cutoff: number): Promise<NewListingCoin[]> {
  const res = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo', {
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!res.ok) throw new Error(`Binance exchangeInfo: ${res.status}`);
  const data = await res.json();

  const listings: NewListingCoin[] = [];
  for (const sym of data.symbols ?? []) {
    const onboardDate = sym.onboardDate ?? 0;
    if (onboardDate < cutoff) continue;
    if (sym.contractType !== 'PERPETUAL' || sym.quoteAsset !== 'USDT') continue;

    const result = normalizeSymbol('binance', sym.symbol ?? '');
    if (!result) continue;

    listings.push({ symbol: result.symbol, exchange: 'binance', listDate: onboardDate });
  }
  return listings;
}

async function fetchBybitNewListings(cutoff: number): Promise<NewListingCoin[]> {
  const res = await fetch('https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000', {
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!res.ok) throw new Error(`Bybit instruments: ${res.status}`);
  const data = await res.json();

  const listings: NewListingCoin[] = [];
  for (const item of data?.result?.list ?? []) {
    const launchTime = Number(item.launchTime) || 0;
    if (launchTime < cutoff) continue;
    if (item.quoteCoin !== 'USDT') continue;

    const result = normalizeSymbol('bybit', item.symbol ?? '');
    if (!result) continue;

    listings.push({ symbol: result.symbol, exchange: 'bybit', listDate: launchTime });
  }
  return listings;
}
