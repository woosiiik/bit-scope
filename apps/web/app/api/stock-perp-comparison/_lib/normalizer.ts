/**
 * 주식-perp 비교 뷰 응답 정규화 (R2.2, R2.3, R2.4, R3.2, R3.3, R5.1, R5.2)
 *
 * - Yahoo Finance chart API 주식 캔들 → NormalizedCandle[]
 * - frankfurter.dev USD→KRW 환율 → RatePoint[]
 * - Hyperliquid candleSnapshot perp 캔들 → NormalizedCandle[]
 *
 * 통화/타임스탬프 단위:
 * - 주식: KRW, Yahoo timestamp는 UTC epoch seconds → ×1000으로 ms 변환
 * - perp: USD, Hyperliquid `t`는 이미 UTC epoch ms이므로 그대로 사용
 */

import type { NormalizedCandle, RatePoint } from '@bitscope/shared';

/**
 * 문자열/숫자 혼재 값을 안전하게 number로 변환한다.
 * futures-dashboard/_lib/normalizer.ts의 동일 헬퍼를 미러링한다.
 */
function safeFloat(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

// ===== Yahoo 응답 타입 (필요 필드만) =====

interface YahooQuote {
  open?: Array<number | null>;
  high?: Array<number | null>;
  low?: Array<number | null>;
  close?: Array<number | null>;
}

interface YahooResult {
  timestamp?: Array<number>;
  indicators?: {
    quote?: YahooQuote[];
  };
  meta?: {
    currency?: string;
    exchangeTimezoneName?: string;
    gmtoffset?: number;
    regularMarketPrice?: number;
  };
}

interface YahooChartResponse {
  chart?: {
    result?: YahooResult[];
  };
}

/** Yahoo 주식 정규화 결과 (캔들 + 메타) */
export interface NormalizedYahooCandles {
  candles: NormalizedCandle[];
  meta: {
    currency: string; // 'KRW' 전제 (R2.3)
    exchangeTimezoneName: string; // 'Asia/Seoul' 전제 (R2.3)
    gmtoffset: number; // 초 단위 (Yahoo meta.gmtoffset)
    regularMarketPrice: number | null;
  };
}

/**
 * Yahoo Finance chart API 주식 응답을 NormalizedCandle[]로 변환한다 (R2.2, R2.3, R2.4, R5.1).
 *
 * - `chart.result[0].timestamp`(UTC epoch seconds)를 ×1000으로 ms 변환한다.
 * - `chart.result[0].indicators.quote[0]`에서 OHLCV를 추출한다.
 * - 거래 없음/휴장으로 OHLCV가 null이면 forward-fill 하지 않고 null을 그대로 보존한다 (R2.4).
 * - meta.currency('KRW'), meta.exchangeTimezoneName('Asia/Seoul'), meta.gmtoffset,
 *   meta.regularMarketPrice를 기록한다 (R2.3).
 */
export function normalizeYahooCandles(raw: unknown): NormalizedYahooCandles {
  const result = (raw as YahooChartResponse)?.chart?.result?.[0];

  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0] ?? {};
  const opens = quote.open ?? [];
  const highs = quote.high ?? [];
  const lows = quote.low ?? [];
  const closes = quote.close ?? [];

  const candles: NormalizedCandle[] = timestamps.map((ts, i) => ({
    timestamp: ts * 1000, // epoch s → ms (R5.1)
    // null은 보존한다 — forward-fill 금지 (R2.4)
    open: opens[i] ?? null,
    high: highs[i] ?? null,
    low: lows[i] ?? null,
    close: closes[i] ?? null,
  }));

  const meta = result?.meta;

  return {
    candles,
    meta: {
      currency: meta?.currency ?? 'KRW',
      exchangeTimezoneName: meta?.exchangeTimezoneName ?? 'Asia/Seoul',
      gmtoffset: typeof meta?.gmtoffset === 'number' ? meta.gmtoffset : 0,
      regularMarketPrice:
        typeof meta?.regularMarketPrice === 'number' ? meta.regularMarketPrice : null,
    },
  };
}

/** frankfurter.dev 환율 시계열 응답 (필요 필드만) */
interface FrankfurterResponse {
  base?: string;
  rates?: Record<string, { KRW?: number } | undefined>;
}

/**
 * frankfurter.dev USD→KRW 환율 응답을 RatePoint[]로 변환한다 (R4.1).
 *
 * 응답 형태: `{ rates: { 'YYYY-MM-DD': { KRW: number } } }` (ECB 공식, 일별).
 * - 날짜 키를 UTC 자정(epoch ms)으로 변환한다. FX는 일별이고 lookup이 step 방식이므로
 *   해당일 환율이 그날 캔들 전체에 적용된다.
 * - KRW 값이 없거나 유한수가 아니면 해당 날짜를 건너뛴다.
 * - rate는 USD/KRW (1 USD = rate KRW).
 *
 * 반환 배열의 정렬은 보장하지 않는다(lookup 빌더가 정렬한다).
 */
export function normalizeFrankfurterRate(raw: unknown): RatePoint[] {
  const rates = (raw as FrankfurterResponse | null)?.rates;
  if (rates == null || typeof rates !== 'object') return [];

  const points: RatePoint[] = [];
  for (const [date, value] of Object.entries(rates)) {
    const krw = value?.KRW;
    if (krw == null || !Number.isFinite(krw)) continue;
    const ts = Date.parse(`${date}T00:00:00Z`);
    if (Number.isNaN(ts)) continue;
    points.push({ timestamp: ts, rate: krw });
  }

  return points;
}

// ===== Hyperliquid candleSnapshot 타입 =====

interface HyperliquidCandle {
  t?: number; // open time (epoch ms)
  T?: number; // close time (epoch ms)
  s?: string; // symbol
  i?: string; // interval
  o?: string; // open
  c?: string; // close
  h?: string; // high
  l?: string; // low
  v?: string; // volume
  n?: number; // trade count
}

/**
 * Hyperliquid candleSnapshot perp 응답을 NormalizedCandle[]로 변환한다 (R3.2, R3.3, R5.2).
 *
 * - `{t,T,s,i,o,c,h,l,v,n}` 배열에서 `t`(이미 UTC epoch ms)를 그대로 사용한다 (R5.2).
 * - 문자열 OHLCV를 safeFloat로 number 변환한다 (R3.2).
 * - 가격 통화는 USD다 (R3.3).
 */
export function normalizeHyperliquidCandles(raw: unknown): NormalizedCandle[] {
  if (!Array.isArray(raw)) return [];

  return (raw as HyperliquidCandle[]).map((k) => ({
    timestamp: k.t ?? 0, // ms 그대로 (R5.2)
    open: safeFloat(k.o),
    high: safeFloat(k.h),
    low: safeFloat(k.l),
    close: safeFloat(k.c),
  }));
}
