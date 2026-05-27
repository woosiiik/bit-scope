/**
 * 벌크 ticker 정규화
 * 6개 거래소의 상이한 벌크 ticker 응답을 NormalizedTicker[] 통일 포맷으로 변환한다.
 */

import type { FuturesExchangeType } from '@bitscope/shared';
import type { NormalizedTicker } from '@bitscope/shared';
import { normalizeSymbol } from './symbol-normalizer';

function safeFloat(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

export function normalizeBulkTickers(exchange: FuturesExchangeType, rawData: unknown): NormalizedTicker[] {
  switch (exchange) {
    case 'binance':
      return normalizeBinance(rawData);
    case 'bybit':
      return normalizeBybit(rawData);
    case 'okx':
      return normalizeOkx(rawData);
    case 'gate':
      return normalizeGate(rawData);
    case 'bitget':
      return normalizeBitget(rawData);
    case 'hyperliquid':
      return normalizeHyperliquid(rawData);
    default:
      return [];
  }
}

function normalizeBinance(raw: unknown): NormalizedTicker[] {
  const arr = raw as Array<{ symbol?: string; lastPrice?: string; priceChangePercent?: string; quoteVolume?: string }>;
  if (!Array.isArray(arr)) return [];

  return arr
    .map((item) => {
      const result = normalizeSymbol('binance', item.symbol ?? '');
      if (!result) return null;
      const { symbol, priceMultiplier: pm } = result;
      return {
        exchange: 'binance' as FuturesExchangeType,
        symbol,
        price: safeFloat(item.lastPrice) * pm,
        change24h: safeFloat(item.priceChangePercent),
        volume24h: safeFloat(item.quoteVolume),
        openInterest: 0,
        fundingRate: 0,
      };
    })
    .filter((t): t is NormalizedTicker => t !== null);
}

/** Binance premiumIndex 응답으로 펀딩비율 보충 */
export function enrichBinanceFunding(
  tickers: NormalizedTicker[],
  premiumData: unknown,
): void {
  const arr = premiumData as Array<{ symbol?: string; lastFundingRate?: string; markPrice?: string }>;
  if (!Array.isArray(arr)) return;

  const fundingMap = new Map<string, number>();
  for (const item of arr) {
    const result = normalizeSymbol('binance', item.symbol ?? '');
    if (result) {
      fundingMap.set(result.symbol, safeFloat(item.lastFundingRate));
    }
  }

  for (const ticker of tickers) {
    if (ticker.exchange !== 'binance') continue;
    const rate = fundingMap.get(ticker.symbol);
    if (rate !== undefined) {
      ticker.fundingRate = rate;
    }
  }
}

function normalizeBybit(raw: unknown): NormalizedTicker[] {
  const d = raw as { result?: { list?: Array<Record<string, string>> } };
  const list = d?.result?.list;
  if (!Array.isArray(list)) return [];

  return list
    .map((item) => {
      const result = normalizeSymbol('bybit', item.symbol ?? '');
      if (!result) return null;
      const { symbol, priceMultiplier: pm } = result;
      const price = safeFloat(item.lastPrice) * pm;
      return {
        exchange: 'bybit' as FuturesExchangeType,
        symbol,
        price,
        change24h: safeFloat(item.price24hPcnt) * 100,
        volume24h: safeFloat(item.turnover24h),
        openInterest: safeFloat(item.openInterest) * price,
        fundingRate: safeFloat(item.fundingRate),
      };
    })
    .filter((t): t is NormalizedTicker => t !== null);
}

function normalizeOkx(raw: unknown): NormalizedTicker[] {
  const d = raw as { data?: Array<Record<string, string>> };
  const data = d?.data;
  if (!Array.isArray(data)) return [];

  return data
    .map((item) => {
      const result = normalizeSymbol('okx', item.instId ?? '');
      if (!result) return null;
      const last = safeFloat(item.last);
      const open24h = safeFloat(item.open24h);
      const change24h = open24h > 0 ? ((last - open24h) / open24h) * 100 : 0;
      return {
        exchange: 'okx' as FuturesExchangeType,
        symbol: result.symbol,
        price: last,
        change24h,
        volume24h: safeFloat(item.volCcy24h) * last,
        openInterest: 0,
        fundingRate: 0,
      };
    })
    .filter((t): t is NormalizedTicker => t !== null);
}

function normalizeGate(raw: unknown): NormalizedTicker[] {
  const arr = raw as Array<Record<string, string>>;
  if (!Array.isArray(arr)) return [];

  return arr
    .map((item) => {
      const result = normalizeSymbol('gate', item.contract ?? '');
      if (!result) return null;
      const last = safeFloat(item.last);
      const quantoMul = safeFloat(item.quanto_multiplier) || 1;
      return {
        exchange: 'gate' as FuturesExchangeType,
        symbol: result.symbol,
        price: last,
        change24h: safeFloat(item.change_percentage),
        volume24h: safeFloat(item.volume_24h_quote) || safeFloat(item.volume_24h) * last,
        openInterest: safeFloat(item.total_size) * quantoMul * last,
        fundingRate: safeFloat(item.funding_rate),
      };
    })
    .filter((t): t is NormalizedTicker => t !== null);
}

function normalizeBitget(raw: unknown): NormalizedTicker[] {
  const d = raw as { data?: Array<Record<string, string>> };
  const data = d?.data;
  if (!Array.isArray(data)) return [];

  return data
    .map((item) => {
      const result = normalizeSymbol('bitget', item.symbol ?? '');
      if (!result) return null;
      const { symbol, priceMultiplier: pm } = result;
      const last = safeFloat(item.lastPr || item.last) * pm;
      const open24h = safeFloat(item.open24h) * pm;
      const change24h = open24h > 0 ? ((last - open24h) / open24h) * 100 : safeFloat(item.change24h);
      return {
        exchange: 'bitget' as FuturesExchangeType,
        symbol,
        price: last,
        change24h,
        volume24h: safeFloat(item.usdtVolume) || safeFloat(item.quoteVolume),
        openInterest: safeFloat(item.openInterestUsd) || safeFloat(item.openInterest) * last,
        fundingRate: safeFloat(item.fundingRate),
      };
    })
    .filter((t): t is NormalizedTicker => t !== null);
}

function normalizeHyperliquid(raw: unknown): NormalizedTicker[] {
  const arr = raw as [{ universe: Array<{ name: string }> }, Array<Record<string, string>>];
  if (!Array.isArray(arr) || arr.length < 2) return [];

  const [meta, ctxs] = arr;
  if (!meta?.universe || !Array.isArray(ctxs)) return [];

  const tickers: NormalizedTicker[] = [];

  for (let i = 0; i < meta.universe.length && i < ctxs.length; i++) {
    const coin = meta.universe[i]!;
    const ctx = ctxs[i]!;

    const result = normalizeSymbol('hyperliquid', coin.name);
    if (!result) continue;

    const markPx = safeFloat(ctx.markPx);
    const prevDayPx = safeFloat(ctx.prevDayPx);
    const change24h = prevDayPx > 0 ? ((markPx - prevDayPx) / prevDayPx) * 100 : 0;

    tickers.push({
      exchange: 'hyperliquid',
      symbol: result.symbol,
      price: markPx,
      change24h,
      volume24h: safeFloat(ctx.dayNtlVlm),
      openInterest: safeFloat(ctx.openInterest) * markPx,
      fundingRate: safeFloat(ctx.funding),
    });
  }

  return tickers;
}
