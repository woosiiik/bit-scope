/**
 * Kline 기반 파생 지표 계산
 *
 * CVD, 시간대별 수익률, 요일별 수익률, 세션별 누적 수익률을 Kline 데이터에서 계산한다.
 */

import type { HourlyReturnPoint, DailyReturnPoint, SessionReturnPoint, CVDPoint } from '@bitscope/shared';
import type { FuturesExchangeType } from '@bitscope/shared';

/** 정규화된 Kline 데이터 */
interface NormalizedKline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
  takerBuyQuoteVol?: number;
}

/**
 * Binance Kline 배열을 NormalizedKline으로 변환한다.
 */
export function parseBinanceKlines(raw: unknown): NormalizedKline[] {
  const arr = raw as number[][];
  if (!Array.isArray(arr)) return [];

  return arr.map((k) => ({
    openTime: Number(k[0]),
    open: Number(k[1]) || 0,
    high: Number(k[2]) || 0,
    low: Number(k[3]) || 0,
    close: Number(k[4]) || 0,
    volume: Number(k[5]) || 0,
    quoteVolume: Number(k[7]) || 0,
    takerBuyQuoteVol: Number(k[10]) || 0,
  }));
}

/**
 * CVD 계산: Taker Buy Volume - Taker Sell Volume 누적
 */
export function calculateCVD(klines: NormalizedKline[]): CVDPoint[] {
  let cumDelta = 0;
  return klines.map((k) => {
    const takerBuyVol = k.takerBuyQuoteVol ?? estimateTakerBuy(k);
    const takerSellVol = k.quoteVolume - takerBuyVol;
    cumDelta += (takerBuyVol - takerSellVol);
    return {
      timestamp: k.openTime,
      values: { binance: cumDelta } as Partial<Record<FuturesExchangeType, number>>,
    };
  });
}

/**
 * Taker Buy Volume 근사 추정 (takerBuyQuoteVol이 없는 경우)
 */
function estimateTakerBuy(k: NormalizedKline): number {
  if (k.quoteVolume === 0) return 0;
  const ratio = k.close >= k.open ? 0.55 : 0.45;
  return k.quoteVolume * ratio;
}

/**
 * 시간대별 평균 1분 수익률 계산
 */
export function calculateAvgReturnByHour(klines: NormalizedKline[]): HourlyReturnPoint[] {
  const hourBuckets = new Map<number, number[]>();

  for (const k of klines) {
    if (k.open === 0) continue;
    const hour = new Date(k.openTime).getUTCHours();
    const ret = (k.close - k.open) / k.open;
    if (!hourBuckets.has(hour)) hourBuckets.set(hour, []);
    hourBuckets.get(hour)!.push(ret);
  }

  return Array.from({ length: 24 }, (_, hour) => {
    const returns = hourBuckets.get(hour) ?? [];
    const avgReturn = returns.length > 0
      ? (returns.reduce((a, b) => a + b, 0) / returns.length) * 100
      : 0;
    return { hour, avgReturn };
  });
}

/**
 * 요일별 평균 수익률 계산
 */
export function calculateAvgReturnByDay(klines: NormalizedKline[]): DailyReturnPoint[] {
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayBuckets = new Map<number, number[]>();

  for (const k of klines) {
    if (k.open === 0) continue;
    // JavaScript getUTCDay: 0=Sun, 1=Mon, ...
    const jsDay = new Date(k.openTime).getUTCDay();
    // 변환: 0(Mon)~6(Sun)
    const day = jsDay === 0 ? 6 : jsDay - 1;
    const ret = (k.close - k.open) / k.open;
    if (!dayBuckets.has(day)) dayBuckets.set(day, []);
    dayBuckets.get(day)!.push(ret);
  }

  return Array.from({ length: 7 }, (_, day) => {
    const returns = dayBuckets.get(day) ?? [];
    const avgReturn = returns.length > 0
      ? (returns.reduce((a, b) => a + b, 0) / returns.length) * 100
      : 0;
    return { day, dayLabel: dayLabels[day] ?? '', avgReturn };
  });
}

/**
 * 세션별 누적 수익률 계산
 * APAC: UTC 0~7, EU: UTC 8~15, US: UTC 16~23
 */
export function calculateCumReturnBySession(klines: NormalizedKline[]): SessionReturnPoint[] {
  let apacCum = 0;
  let euCum = 0;
  let usCum = 0;

  return klines.map((k) => {
    if (k.open === 0) return { timestamp: k.openTime, apac: apacCum, eu: euCum, us: usCum };

    const hour = new Date(k.openTime).getUTCHours();
    const ret = ((k.close - k.open) / k.open) * 100;

    if (hour >= 0 && hour < 8) apacCum += ret;
    else if (hour >= 8 && hour < 16) euCum += ret;
    else usCum += ret;

    return { timestamp: k.openTime, apac: apacCum, eu: euCum, us: usCum };
  });
}

/**
 * 3M 연환산 베이시스 계산
 */
export function calculate3mBasis(futuresPrice: number, spotPrice: number, daysToExpiry: number): number {
  if (spotPrice === 0 || daysToExpiry <= 0) return 0;
  return ((futuresPrice - spotPrice) / spotPrice) * (365 / daysToExpiry) * 100;
}
