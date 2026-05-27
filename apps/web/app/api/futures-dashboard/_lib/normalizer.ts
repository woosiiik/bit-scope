/**
 * 거래소별 선물 대시보드 응답 정규화
 *
 * 6개 거래소의 상이한 API 응답을 통일된 포맷으로 변환한다.
 */

import type { FuturesExchangeType } from '@bitscope/shared';
import type {
  FuturesDashboardIndicator,
  ExchangeDataPoint,
  FundingRateSnapshot,
  ExchangeTimeSeriesPoint,
} from '@bitscope/shared';

function safeFloat(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

// ===== Volume 24h 정규화 =====

export function normalizeVolume24h(exchange: FuturesExchangeType, raw: unknown): ExchangeDataPoint {
  switch (exchange) {
    case 'binance': {
      const d = raw as { quoteVolume?: string };
      return { exchange, value: safeFloat(d?.quoteVolume) };
    }
    case 'bybit': {
      const d = raw as { result?: { list?: Array<{ turnover24h?: string }> } };
      return { exchange, value: safeFloat(d?.result?.list?.[0]?.turnover24h) };
    }
    case 'okx': {
      const d = raw as { data?: Array<{ volCcy24h?: string }> };
      return { exchange, value: safeFloat(d?.data?.[0]?.volCcy24h) };
    }
    case 'gate': {
      const d = raw as { trade_size?: number; last?: string };
      return { exchange, value: safeFloat(d?.trade_size) * safeFloat(d?.last) };
    }
    case 'bitget': {
      const d = raw as { data?: Array<{ usdtVolume?: string }> };
      return { exchange, value: safeFloat(d?.data?.[0]?.usdtVolume) };
    }
    case 'hyperliquid': {
      // metaAndAssetCtxs 응답에서 해당 코인 찾기
      const d = raw as unknown;
      return { exchange, value: extractHyperliquidField(d, 'dayNtlVlm') };
    }
    default:
      return { exchange, value: 0 };
  }
}

// ===== OI Snapshot 정규화 =====

export function normalizeOiSnapshot(exchange: FuturesExchangeType, raw: unknown): ExchangeDataPoint {
  switch (exchange) {
    case 'binance': {
      const d = raw as { openInterest?: string; symbol?: string };
      return { exchange, value: safeFloat(d?.openInterest) };
    }
    case 'bybit': {
      const d = raw as { result?: { list?: Array<{ openInterest?: string }> } };
      return { exchange, value: safeFloat(d?.result?.list?.[0]?.openInterest) };
    }
    case 'okx': {
      const d = raw as { data?: Array<{ oi?: string; oiCcy?: string }> };
      return { exchange, value: safeFloat(d?.data?.[0]?.oi) };
    }
    case 'gate': {
      const d = raw as { position_size?: number; last?: string };
      return { exchange, value: safeFloat(d?.position_size) * safeFloat(d?.last) };
    }
    case 'bitget': {
      const d = raw as { data?: Array<{ amount?: string }> };
      return { exchange, value: safeFloat(d?.data?.[0]?.amount) };
    }
    case 'hyperliquid': {
      const d = raw as unknown;
      const oi = extractHyperliquidField(d, 'openInterest');
      const markPx = extractHyperliquidField(d, 'markPx');
      return { exchange, value: oi * markPx };
    }
    default:
      return { exchange, value: 0 };
  }
}

// ===== Funding Rate 정규화 =====

export function normalizeFundingRate(exchange: FuturesExchangeType, raw: unknown): FundingRateSnapshot {
  let rate8h = 0;

  switch (exchange) {
    case 'binance': {
      const d = raw as { lastFundingRate?: string; nextFundingTime?: number };
      rate8h = safeFloat(d?.lastFundingRate);
      return { exchange, rate8h, rateAnnual: rate8h * 3 * 365 * 100, nextFundingTime: d?.nextFundingTime };
    }
    case 'bybit': {
      const d = raw as { result?: { list?: Array<{ fundingRate?: string }> } };
      rate8h = safeFloat(d?.result?.list?.[0]?.fundingRate);
      return { exchange, rate8h, rateAnnual: rate8h * 3 * 365 * 100 };
    }
    case 'okx': {
      const d = raw as { data?: Array<{ fundingRate?: string; nextFundingRate?: string }> };
      rate8h = safeFloat(d?.data?.[0]?.fundingRate);
      return { exchange, rate8h, rateAnnual: rate8h * 3 * 365 * 100 };
    }
    case 'gate': {
      const d = raw as { funding_rate?: string; funding_next_apply?: number };
      rate8h = safeFloat(d?.funding_rate);
      return { exchange, rate8h, rateAnnual: rate8h * 3 * 365 * 100, nextFundingTime: d?.funding_next_apply ? d.funding_next_apply * 1000 : undefined };
    }
    case 'bitget': {
      const d = raw as { data?: Array<{ fundingRate?: string }> };
      rate8h = safeFloat(d?.data?.[0]?.fundingRate);
      return { exchange, rate8h, rateAnnual: rate8h * 3 * 365 * 100 };
    }
    case 'hyperliquid': {
      const d = raw as unknown;
      rate8h = extractHyperliquidField(d, 'funding');
      return { exchange, rate8h, rateAnnual: rate8h * 3 * 365 * 100 };
    }
    default:
      return { exchange, rate8h: 0, rateAnnual: 0 };
  }
}

// ===== Price 히스토리 정규화 (Kline → 시계열) =====

export function normalizePriceHistory(exchange: FuturesExchangeType, raw: unknown): ExchangeTimeSeriesPoint[] {
  switch (exchange) {
    case 'binance': {
      // [[openTime, open, high, low, close, volume, closeTime, ...], ...]
      const d = raw as number[][];
      if (!Array.isArray(d)) return [];
      return d.map((k) => ({
        timestamp: Number(k[0]),
        values: { [exchange]: safeFloat(k[4]) } as Partial<Record<FuturesExchangeType, number>>,
      }));
    }
    case 'bybit': {
      const d = raw as { result?: { list?: string[][] } };
      const list = d?.result?.list;
      if (!Array.isArray(list)) return [];
      return list.map((k) => ({
        timestamp: Number(k[0]),
        values: { [exchange]: safeFloat(k[4]) } as Partial<Record<FuturesExchangeType, number>>,
      })).reverse();
    }
    case 'okx': {
      const d = raw as { data?: string[][] };
      const data = d?.data;
      if (!Array.isArray(data)) return [];
      return data.map((k) => ({
        timestamp: Number(k[0]),
        values: { [exchange]: safeFloat(k[4]) } as Partial<Record<FuturesExchangeType, number>>,
      })).reverse();
    }
    case 'gate': {
      const d = raw as Array<{ t?: number; c?: string }>;
      if (!Array.isArray(d)) return [];
      return d.map((k) => ({
        timestamp: (k.t ?? 0) * 1000,
        values: { [exchange]: safeFloat(k.c) } as Partial<Record<FuturesExchangeType, number>>,
      }));
    }
    case 'bitget': {
      const d = raw as { data?: string[][] };
      const data = d?.data;
      if (!Array.isArray(data)) return [];
      return data.map((k) => ({
        timestamp: Number(k[0]),
        values: { [exchange]: safeFloat(k[4]) } as Partial<Record<FuturesExchangeType, number>>,
      })).reverse();
    }
    case 'hyperliquid': {
      const d = raw as Array<{ t?: number; c?: string }>;
      if (!Array.isArray(d)) return [];
      return d.map((k) => ({
        timestamp: k.t ?? 0,
        values: { [exchange]: safeFloat(k.c) } as Partial<Record<FuturesExchangeType, number>>,
      }));
    }
    default:
      return [];
  }
}

// ===== Volume 히스토리 정규화 =====

export function normalizeVolumeHistory(exchange: FuturesExchangeType, raw: unknown): ExchangeTimeSeriesPoint[] {
  switch (exchange) {
    case 'binance': {
      const d = raw as number[][];
      if (!Array.isArray(d)) return [];
      return d.map((k) => ({
        timestamp: Number(k[0]),
        values: { [exchange]: safeFloat(k[7]) } as Partial<Record<FuturesExchangeType, number>>, // quoteAssetVolume
      }));
    }
    case 'bybit': {
      const d = raw as { result?: { list?: string[][] } };
      const list = d?.result?.list;
      if (!Array.isArray(list)) return [];
      return list.map((k) => ({
        timestamp: Number(k[0]),
        values: { [exchange]: safeFloat(k[6]) } as Partial<Record<FuturesExchangeType, number>>, // turnover
      })).reverse();
    }
    case 'okx': {
      const d = raw as { data?: string[][] };
      const data = d?.data;
      if (!Array.isArray(data)) return [];
      return data.map((k) => ({
        timestamp: Number(k[0]),
        values: { [exchange]: safeFloat(k[7]) } as Partial<Record<FuturesExchangeType, number>>, // volCcyQuote
      })).reverse();
    }
    case 'gate': {
      const d = raw as Array<{ t?: number; v?: number; c?: string }>;
      if (!Array.isArray(d)) return [];
      return d.map((k) => ({
        timestamp: (k.t ?? 0) * 1000,
        values: { [exchange]: safeFloat(k.v) * safeFloat(k.c) } as Partial<Record<FuturesExchangeType, number>>,
      }));
    }
    case 'bitget': {
      const d = raw as { data?: string[][] };
      const data = d?.data;
      if (!Array.isArray(data)) return [];
      return data.map((k) => ({
        timestamp: Number(k[0]),
        values: { [exchange]: safeFloat(k[5]) } as Partial<Record<FuturesExchangeType, number>>, // quoteVolume
      })).reverse();
    }
    default:
      return [];
  }
}

// ===== OI History 정규화 =====

export function normalizeOiHistory(exchange: FuturesExchangeType, raw: unknown): ExchangeTimeSeriesPoint[] {
  switch (exchange) {
    case 'binance': {
      const d = raw as Array<{ timestamp?: number; sumOpenInterestValue?: string }>;
      if (!Array.isArray(d)) return [];
      return d.map((item) => ({
        timestamp: item.timestamp ?? 0,
        values: { [exchange]: safeFloat(item.sumOpenInterestValue) } as Partial<Record<FuturesExchangeType, number>>,
      }));
    }
    case 'bybit': {
      const d = raw as { result?: { list?: Array<{ openInterest?: string; timestamp?: string }> } };
      const list = d?.result?.list;
      if (!Array.isArray(list)) return [];
      return list.map((item) => ({
        timestamp: Number(item.timestamp),
        values: { [exchange]: safeFloat(item.openInterest) } as Partial<Record<FuturesExchangeType, number>>,
      })).reverse();
    }
    case 'okx': {
      const d = raw as { data?: Array<string[]> };
      const data = d?.data;
      if (!Array.isArray(data)) return [];
      return data.map((item) => ({
        timestamp: Number(item[0]),
        values: { [exchange]: safeFloat(item[1]) } as Partial<Record<FuturesExchangeType, number>>,
      })).reverse();
    }
    case 'gate': {
      const d = raw as Array<{ time?: number; open_interest?: string; lsr_account?: string }>;
      if (!Array.isArray(d)) return [];
      return d.map((item) => ({
        timestamp: (item.time ?? 0) * 1000,
        values: { [exchange]: safeFloat(item.open_interest) } as Partial<Record<FuturesExchangeType, number>>,
      }));
    }
    case 'bitget': {
      const d = raw as { data?: Array<{ amount?: string; ts?: string }> };
      const data = d?.data;
      if (!Array.isArray(data)) return [];
      return data.map((item) => ({
        timestamp: Number(item.ts),
        values: { [exchange]: safeFloat(item.amount) } as Partial<Record<FuturesExchangeType, number>>,
      }));
    }
    default:
      return [];
  }
}

// ===== Hyperliquid 헬퍼: coin별 필드 추출 =====

/** 글로벌 coin 컨텍스트 (fetchMultiExchangeIndicator에서 설정) */
let _hyperliquidCoin = 'BTC';

export function setHyperliquidCoin(coin: string): void {
  _hyperliquidCoin = coin;
}

function extractHyperliquidField(raw: unknown, field: string): number {
  // metaAndAssetCtxs 응답: [{ universe: [...] }, [{ markPx, dayNtlVlm, openInterest, funding, ... }]]
  const arr = raw as [{ universe: Array<{ name: string }> }, Array<Record<string, string>>];
  if (!Array.isArray(arr) || arr.length < 2) return 0;

  const [meta, ctxs] = arr;
  if (!meta?.universe || !Array.isArray(ctxs)) return 0;

  const idx = meta.universe.findIndex((u) => u.name === _hyperliquidCoin);
  if (idx < 0 || !ctxs[idx]) return 0;

  return safeFloat(ctxs[idx][field]);
}

// ===== 통합 정규화 디스패처 =====

export function normalizeIndicator(
  exchange: FuturesExchangeType,
  indicator: FuturesDashboardIndicator,
  raw: unknown,
  coin?: string,
): unknown {
  if (exchange === 'hyperliquid' && coin) {
    setHyperliquidCoin(coin);
  }

  switch (indicator) {
    case 'volume24h':
      return normalizeVolume24h(exchange, raw);
    case 'oiSnapshot':
      return normalizeOiSnapshot(exchange, raw);
    case 'fundingRate':
      return normalizeFundingRate(exchange, raw);
    case 'price':
      return normalizePriceHistory(exchange, raw);
    case 'volumeHistory':
      return normalizeVolumeHistory(exchange, raw);
    case 'oiHistory':
      return normalizeOiHistory(exchange, raw);
    case 'liquidations':
    case 'cvd':
    case 'basis3m':
    case 'avgReturnByHour':
    case 'avgReturnByDay':
    case 'cumReturnBySession':
      // Kline 기반 파생 지표는 kline-aggregator에서 처리
      return normalizePriceHistory(exchange, raw);
    default:
      return null;
  }
}
