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

// ===== Hyperliquid 헬퍼 =====

/**
 * Hyperliquid metaAndAssetCtxs 응답에서 코인별 필드를 추출한다.
 * coin을 파라미터로 받아 전역 변수 의존성을 제거했다.
 */
function extractHyperliquidField(raw: unknown, coin: string, field: string): number {
  const arr = raw as [{ universe: Array<{ name: string }> }, Array<Record<string, string>>];
  if (!Array.isArray(arr) || arr.length < 2) return 0;

  const [meta, ctxs] = arr;
  if (!meta?.universe || !Array.isArray(ctxs)) return 0;

  const idx = meta.universe.findIndex((u) => u.name === coin);
  if (idx < 0 || !ctxs[idx]) return 0;

  return safeFloat(ctxs[idx][field]);
}

// ===== Volume 24h 정규화 =====

export function normalizeVolume24h(exchange: FuturesExchangeType, raw: unknown, coin: string): ExchangeDataPoint {
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
      // OKX volCcy24h는 코인 단위, vol24h가 USDT 단위
      const d = raw as { data?: Array<{ volCcy24h?: string; vol24h?: string; last?: string }> };
      const item = d?.data?.[0];
      // vol24h * last = 대략적인 USDT 거래량
      const vol = safeFloat(item?.volCcy24h) * safeFloat(item?.last);
      return { exchange, value: vol || safeFloat(item?.vol24h) };
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
      return { exchange, value: extractHyperliquidField(raw, coin, 'dayNtlVlm') };
    }
    default:
      return { exchange, value: 0 };
  }
}

// ===== OI Snapshot 정규화 =====

export function normalizeOiSnapshot(exchange: FuturesExchangeType, raw: unknown, coin: string): ExchangeDataPoint {
  switch (exchange) {
    case 'binance': {
      // Binance openInterest는 코인 단위. markPrice를 별도로 가져오지 않으므로
      // ticker 24hr에서 함께 가져오거나, premiumIndex에서 가져올 수 있다.
      // 현재는 단일 엔드포인트이므로 코인 단위 그대로 반환 (USDT 환산은 추후 개선)
      const d = raw as { openInterest?: string };
      return { exchange, value: safeFloat(d?.openInterest) };
    }
    case 'bybit': {
      const d = raw as { result?: { list?: Array<{ openInterest?: string }> } };
      return { exchange, value: safeFloat(d?.result?.list?.[0]?.openInterest) };
    }
    case 'okx': {
      // OKX oi는 계약 단위, oiCcy는 코인 단위
      const d = raw as { data?: Array<{ oi?: string; oiCcy?: string }> };
      return { exchange, value: safeFloat(d?.data?.[0]?.oiCcy) };
    }
    case 'gate': {
      // Gate position_size는 계약 수, last는 현재가
      const d = raw as { position_size?: number; last?: string; quanto_multiplier?: string };
      return { exchange, value: safeFloat(d?.position_size) * safeFloat(d?.quanto_multiplier) };
    }
    case 'bitget': {
      const d = raw as { data?: Array<{ amount?: string }> };
      return { exchange, value: safeFloat(d?.data?.[0]?.amount) };
    }
    case 'hyperliquid': {
      const oi = extractHyperliquidField(raw, coin, 'openInterest');
      const markPx = extractHyperliquidField(raw, coin, 'markPx');
      return { exchange, value: oi * markPx };
    }
    default:
      return { exchange, value: 0 };
  }
}

// ===== Funding Rate 정규화 =====

export function normalizeFundingRate(exchange: FuturesExchangeType, raw: unknown, coin: string): FundingRateSnapshot {
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
      const d = raw as { data?: Array<{ fundingRate?: string }> };
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
      rate8h = extractHyperliquidField(raw, coin, 'funding');
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
      const d = raw as unknown[][];
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
      const d = raw as unknown[][];
      if (!Array.isArray(d)) return [];
      return d.map((k) => ({
        timestamp: Number(k[0]),
        values: { [exchange]: safeFloat(k[7]) } as Partial<Record<FuturesExchangeType, number>>,
      }));
    }
    case 'bybit': {
      const d = raw as { result?: { list?: string[][] } };
      const list = d?.result?.list;
      if (!Array.isArray(list)) return [];
      return list.map((k) => ({
        timestamp: Number(k[0]),
        values: { [exchange]: safeFloat(k[6]) } as Partial<Record<FuturesExchangeType, number>>,
      })).reverse();
    }
    case 'okx': {
      const d = raw as { data?: string[][] };
      const data = d?.data;
      if (!Array.isArray(data)) return [];
      // OKX candles: [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
      // volCcyQuote(index 7) = USDT 기준 거래량
      return data.map((k) => ({
        timestamp: Number(k[0]),
        values: { [exchange]: safeFloat(k[7]) } as Partial<Record<FuturesExchangeType, number>>,
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
        values: { [exchange]: safeFloat(k[5]) } as Partial<Record<FuturesExchangeType, number>>,
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
      const d = raw as Array<{ time?: number; open_interest?: string }>;
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

// ===== 통합 정규화 디스패처 =====

/**
 * 지표별로 적절한 정규화 함수를 호출한다.
 *
 * 핵심: cvd, avgReturn 등 Kline 기반 파생 지표는 정규화하지 않고
 * raw 데이터를 그대로 반환한다. kline-aggregator에서 원본 Kline 필드가 필요하기 때문.
 */
export function normalizeIndicator(
  exchange: FuturesExchangeType,
  indicator: FuturesDashboardIndicator,
  raw: unknown,
  coin: string,
): unknown {
  switch (indicator) {
    case 'volume24h':
      return normalizeVolume24h(exchange, raw, coin);
    case 'oiSnapshot':
      return normalizeOiSnapshot(exchange, raw, coin);
    case 'fundingRate':
      return normalizeFundingRate(exchange, raw, coin);
    case 'price':
      return normalizePriceHistory(exchange, raw);
    case 'volumeHistory':
      return normalizeVolumeHistory(exchange, raw);
    case 'oiHistory':
      return normalizeOiHistory(exchange, raw);

    // Kline 기반 파생 지표: raw 데이터 그대로 반환 (정규화 안 함)
    // parseBinanceKlines()가 원본 Kline 배열([openTime, o, h, l, c, vol, ...])을 필요로 함
    case 'cvd':
    case 'avgReturnByHour':
    case 'avgReturnByDay':
    case 'cumReturnBySession':
      return raw;

    case 'liquidations':
    case 'basis3m':
      return raw;

    default:
      return null;
  }
}
