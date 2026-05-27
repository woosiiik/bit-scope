/**
 * 벌크 ticker Fetcher
 * 6개 거래소 병렬 호출 + Binance premiumIndex 보충
 */

import type { FuturesExchangeType } from '@bitscope/shared';
import type { NormalizedTicker } from '@bitscope/shared';
import { BULK_TICKER_CONFIGS, BINANCE_PREMIUM_INDEX_URL } from '@bitscope/shared';
import { normalizeBulkTickers, enrichBinanceFunding } from './bulk-ticker-normalizer';

const FETCH_TIMEOUT = 5_000;

export interface BulkTickerResult {
  tickers: NormalizedTicker[];
  errors: Partial<Record<FuturesExchangeType, string>>;
  exchangeCount: number;
}

export async function fetchAllBulkTickers(): Promise<BulkTickerResult> {
  const exchanges: FuturesExchangeType[] = ['binance', 'bybit', 'okx', 'gate', 'bitget', 'hyperliquid'];

  // 6개 거래소 + Binance premiumIndex 병렬 호출
  const promises = exchanges.map(async (exchange) => {
    const config = BULK_TICKER_CONFIGS[exchange];
    const fetchOptions: RequestInit = {
      method: config.method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    };
    if (config.body) fetchOptions.body = config.body;

    const response = await fetch(config.url, fetchOptions);
    if (!response.ok) throw new Error(`${exchange}: ${response.status} ${response.statusText}`);
    const rawData = await response.json();

    // OKX/Bitget: HTTP 200이지만 응답 body에 에러 코드가 있을 수 있음
    if (exchange === 'okx' && rawData?.code !== undefined && rawData.code !== '0') {
      throw new Error(`OKX error: code=${rawData.code} msg=${rawData.msg ?? ''}`);
    }
    if (exchange === 'bitget' && rawData?.code !== undefined && rawData.code !== '00000') {
      throw new Error(`Bitget error: code=${rawData.code} msg=${rawData.msg ?? ''}`);
    }

    return { exchange, tickers: normalizeBulkTickers(exchange, rawData) };
  });

  // Binance premiumIndex (펀딩비율 보충)
  const premiumPromise = fetch(BINANCE_PREMIUM_INDEX_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  const [results, premiumData] = await Promise.all([
    Promise.allSettled(promises),
    premiumPromise,
  ]);

  const allTickers: NormalizedTicker[] = [];
  const errors: Partial<Record<FuturesExchangeType, string>> = {};
  let exchangeCount = 0;

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const exchange = exchanges[i]!;

    if (result.status === 'fulfilled') {
      allTickers.push(...result.value.tickers);
      exchangeCount++;
    } else {
      errors[exchange] = result.reason?.message ?? 'Unknown error';
    }
  }

  // Binance 펀딩비율 보충
  if (premiumData) {
    enrichBinanceFunding(allTickers, premiumData);
  }

  return { tickers: allTickers, errors, exchangeCount };
}
