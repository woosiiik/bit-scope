/**
 * 주식-perp 비교 뷰 응답 정규화 (R2.2, R2.3, R2.4, R3.2, R3.3, R5.1, R5.2)
 *
 * - 네이버 금융 주식 캔들(일봉/분봉) → NormalizedCandle[]
 * - frankfurter.dev USD→KRW 환율 → RatePoint[]
 * - Hyperliquid candleSnapshot perp 캔들 → NormalizedCandle[]
 *
 * 통화/타임스탬프 단위:
 * - 주식: KRW. 네이버 시각은 KST 문자열 — 분봉은 KST→UTC ms 변환, 일봉은 해당 날짜의
 *   UTC 자정으로 매핑하여 perp 일봉(UTC 자정)과 버킷 정합을 맞춘다.
 * - perp: USD, Hyperliquid `t`는 이미 UTC epoch ms이므로 그대로 사용
 */

import type { ComparisonInterval, NormalizedCandle, RatePoint } from '@bitscope/shared';

/** KST 오프셋 (UTC+9) ms */
const KST_OFFSET_MS = 9 * 3600 * 1000;

/**
 * 문자열/숫자 혼재 값을 안전하게 number로 변환한다.
 * futures-dashboard/_lib/normalizer.ts의 동일 헬퍼를 미러링한다.
 */
function safeFloat(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

/** number/문자열을 number로, 비유한수/누락이면 null. */
function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ===== 네이버 금융 응답 타입 (필요 필드만) =====

/** 일봉: /chart/domestic/item/{code}/day 항목 */
interface NaverDayItem {
  localDate?: string; // 'YYYYMMDD' (KST 거래일)
  openPrice?: number;
  highPrice?: number;
  lowPrice?: number;
  closePrice?: number;
}

/** 분봉: /chart/domestic/item/{code}/minute 항목 */
interface NaverMinuteItem {
  localDateTime?: string; // 'YYYYMMDDHHMMSS' (KST)
  openPrice?: number;
  highPrice?: number;
  lowPrice?: number;
  currentPrice?: number; // 해당 분의 종가
}

/** 주식 정규화 결과 (캔들 + 메타) */
export interface NormalizedStockCandles {
  candles: NormalizedCandle[];
  meta: {
    currency: string; // 'KRW' (R2.3)
    exchangeTimezoneName: string; // 'Asia/Seoul' (R2.3)
    gmtoffset: number; // 초 단위 (KST = 32400)
    regularMarketPrice: number | null; // 최근 종가
  };
}

/** 'YYYYMMDD'(KST 거래일) → 해당 날짜 UTC 자정 ms (perp 일봉 버킷과 정합). */
function parseNaverDate(localDate: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(localDate);
  if (m === null) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** 'YYYYMMDDHHMMSS'(KST) → UTC epoch ms. */
function parseNaverDateTime(localDateTime: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(localDateTime);
  if (m === null) return null;
  // KST 벽시계로 구성한 뒤 9h를 빼서 UTC instant로 변환.
  const kstAsUtc = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
  );
  return kstAsUtc - KST_OFFSET_MS;
}

/**
 * 네이버 금융 주식 응답(일봉/분봉)을 NormalizedCandle[]로 변환한다 (R2.2, R2.4, R5.1).
 *
 * - 일봉(interval==='1d'): `localDate`/`closePrice` 등, timestamp는 해당 날짜 UTC 자정.
 * - 분봉(그 외): `localDateTime`/`currentPrice` 등, timestamp는 KST→UTC ms 변환.
 * - 가격은 KRW. 유한수가 아닌 값은 null로 보존한다(forward-fill 금지, R2.4).
 * - 메타는 한국 주식 전제로 고정(KRW/Asia/Seoul/+9h), regularMarketPrice는 최근 종가.
 */
export function normalizeNaverCandles(
  raw: unknown,
  interval: ComparisonInterval,
): NormalizedStockCandles {
  const arr = Array.isArray(raw) ? raw : [];
  const isDaily = interval === '1d';

  const candles: NormalizedCandle[] = [];
  for (const item of arr) {
    if (item == null || typeof item !== 'object') continue;
    let timestamp: number | null;
    let close: number | null;
    if (isDaily) {
      const it = item as NaverDayItem;
      timestamp = it.localDate != null ? parseNaverDate(it.localDate) : null;
      close = numOrNull(it.closePrice);
    } else {
      const it = item as NaverMinuteItem;
      timestamp = it.localDateTime != null ? parseNaverDateTime(it.localDateTime) : null;
      close = numOrNull(it.currentPrice);
    }
    if (timestamp === null) continue;
    const it = item as NaverDayItem & NaverMinuteItem;
    candles.push({
      timestamp,
      open: numOrNull(it.openPrice),
      high: numOrNull(it.highPrice),
      low: numOrNull(it.lowPrice),
      close,
    });
  }

  // 최근(마지막) 유효 종가를 regularMarketPrice로 사용.
  let regularMarketPrice: number | null = null;
  for (let i = candles.length - 1; i >= 0; i--) {
    const c = candles[i];
    if (c !== undefined && c.close !== null) {
      regularMarketPrice = c.close;
      break;
    }
  }

  return {
    candles,
    meta: {
      currency: 'KRW',
      exchangeTimezoneName: 'Asia/Seoul',
      gmtoffset: 32400,
      regularMarketPrice,
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
