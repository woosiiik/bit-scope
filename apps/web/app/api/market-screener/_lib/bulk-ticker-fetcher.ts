/**
 * 벌크 ticker Fetcher
 * 6개 거래소 병렬 호출 + Binance OI/펀딩 보충 + OKX OI/펀딩 보충
 */

import type { FuturesExchangeType } from '@bitscope/shared';
import type { NormalizedTicker } from '@bitscope/shared';
import { BULK_TICKER_CONFIGS, BINANCE_PREMIUM_INDEX_URL } from '@bitscope/shared';
import { normalizeBulkTickers, enrichBinanceFunding } from './bulk-ticker-normalizer';
import { normalizeSymbol } from './symbol-normalizer';

const FETCH_TIMEOUT = 5_000;

/** OKX 벌크 OI */
const OKX_OI_URL = 'https://www.okx.com/api/v5/public/open-interest?instType=SWAP';

/** OKX 벌크 펀딩 */
const OKX_FUNDING_URL = 'https://www.okx.com/api/v5/public/funding-rate';

function safeFloat(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

export interface BulkTickerResult {
  tickers: NormalizedTicker[];
  errors: Partial<Record<FuturesExchangeType, string>>;
  exchangeCount: number;
}

export async function fetchAllBulkTickers(): Promise<BulkTickerResult> {
  const exchanges: FuturesExchangeType[] = ['binance', 'bybit', 'okx', 'gate', 'bitget', 'hyperliquid'];

  // 6개 거래소 벌크 ticker
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

    if (exchange === 'okx' && rawData?.code !== undefined && rawData.code !== '0') {
      throw new Error(`OKX error: code=${rawData.code} msg=${rawData.msg ?? ''}`);
    }
    if (exchange === 'bitget' && rawData?.code !== undefined && rawData.code !== '00000') {
      throw new Error(`Bitget error: code=${rawData.code} msg=${rawData.msg ?? ''}`);
    }

    return { exchange, tickers: normalizeBulkTickers(exchange, rawData) };
  });

  // 보충 API 병렬 호출 (Binance premiumIndex, OKX OI, OKX Funding)
  const supplementaryFetches = [
    fetch(BINANCE_PREMIUM_INDEX_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT) })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch(OKX_OI_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT) })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch(OKX_FUNDING_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT) })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ];

  const [results, ...supplementary] = await Promise.all([
    Promise.allSettled(promises),
    ...supplementaryFetches,
  ]);

  const [premiumData, okxOiData, okxFundingData] = supplementary;

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

  // Binance 보충: premiumIndex에서 펀딩비율 + markPrice → OI 계산
  if (premiumData) {
    enrichBinanceFunding(allTickers, premiumData);
    enrichBinanceOI(allTickers, premiumData);
  }

  // OKX 보충: OI + 펀딩비율
  if (okxOiData) {
    enrichOkxOI(allTickers, okxOiData);
  }
  if (okxFundingData) {
    enrichOkxFunding(allTickers, okxFundingData);
  }

  return { tickers: allTickers, errors, exchangeCount };
}

/** Binance OI: 벌크 API 없음 (개별 심볼당 1회 호출 필요 = 250+ 호출)
 * Phase 2에서 주요 코인 상위 50개만 개별 호출로 보충 예정
 * 현재는 Binance OI = 0으로 유지, 나머지 5개 거래소 OI로 비교
 */

/** OKX 벌크 OI 보충 */
function enrichOkxOI(tickers: NormalizedTicker[], rawData: unknown): void {
  const d = rawData as { code?: string; data?: Array<{ instId?: string; oi?: string; oiCcy?: string }> };
  if (d?.code !== '0' || !Array.isArray(d?.data)) return;

  const oiMap = new Map<string, number>();
  for (const item of d.data) {
    const result = normalizeSymbol('okx', item.instId ?? '');
    if (result) {
      // oiCcy = 코인 단위 OI (USDT 환산은 aggregator에서)
      oiMap.set(result.symbol, safeFloat(item.oiCcy));
    }
  }

  for (const ticker of tickers) {
    if (ticker.exchange !== 'okx') continue;
    const oiCcy = oiMap.get(ticker.symbol);
    if (oiCcy !== undefined && ticker.price > 0) {
      ticker.openInterest = oiCcy * ticker.price; // USDT 환산
    }
  }
}

/** OKX 벌크 펀딩비율 보충 */
function enrichOkxFunding(tickers: NormalizedTicker[], rawData: unknown): void {
  const d = rawData as { code?: string; data?: Array<{ instId?: string; fundingRate?: string }> };
  if (d?.code !== '0' || !Array.isArray(d?.data)) return;

  const fundingMap = new Map<string, number>();
  for (const item of d.data) {
    const result = normalizeSymbol('okx', item.instId ?? '');
    if (result) {
      fundingMap.set(result.symbol, safeFloat(item.fundingRate));
    }
  }

  for (const ticker of tickers) {
    if (ticker.exchange !== 'okx') continue;
    const rate = fundingMap.get(ticker.symbol);
    if (rate !== undefined) {
      ticker.fundingRate = rate;
    }
  }
}
