/**
 * 주식-perp 비교 뷰 URL/Body 빌더
 *
 * 세 소스(주식/환율/perp)의 외부 API 요청을 생성한다.
 * - 주식:  GET https://query1.finance.yahoo.com/v8/finance/chart/{pair}?range&interval
 * - 환율:  GET https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?range&interval=1h
 * - perp:  POST https://api.hyperliquid.xyz/info  (candleSnapshot)
 *
 * interval은 사용자가 직접 보내지 않고 `range`로부터 `RANGE_TO_INTERVAL`로 결정한다
 * (R8.2/R8.4 — 주식·perp interval을 항상 동일하게 정렬). 분봉 한계 초과 시
 * `fallbackInterval`로 한 단계 거친 간격으로 전환한다(R2.5/R8.3).
 *
 * 기존 futures-dashboard `buildHyperliquidBody`의 candleSnapshot POST 패턴을 미러링하되,
 * 코인명에는 `xyz:` 접두사만 사용하고 `dex` 파라미터는 추가하지 않는다(R3.4).
 */

import type {
  ComparisonInterval,
  ComparisonRange,
} from '@bitscope/shared';
import { HYPERLIQUID_CONFIG, RANGE_TO_INTERVAL } from '@bitscope/shared';

/** Yahoo Finance chart API base URL */
const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

/** USD/KRW 환율 심볼 (Yahoo) */
const YAHOO_RATE_SYMBOL = 'KRW=X';

/**
 * 환율 조회 interval — candle interval이 1m이어도 1h로 고정한다.
 * 환율은 분 단위로 거의 변하지 않고 Yahoo가 KRW=X 분봉을 잘 주지 않으므로
 * 호출을 경량화한다. 캔들과의 정합은 lookup 단계에서 처리한다.
 */
const RATE_INTERVAL = '1h' as const;

/** range → interval/lookback 결정 결과 */
export interface IntervalPlan {
  /** range가 1차로 요청하는 interval */
  interval: ComparisonInterval;
  /** 폴백 시 사용할 한 단계 거친 interval (없으면 null) */
  fallbackInterval: ComparisonInterval | null;
  /** perp candleSnapshot 조회 기간 (ms) */
  perpLookbackMs: number;
}

/**
 * range로부터 interval/fallbackInterval/perpLookbackMs를 도출한다.
 */
export function resolveIntervalPlan(range: ComparisonRange): IntervalPlan {
  const plan = RANGE_TO_INTERVAL[range];
  return {
    interval: plan.interval,
    fallbackInterval: plan.fallbackInterval,
    perpLookbackMs: plan.perpLookbackMs,
  };
}

/**
 * 1차 interval에서 폴백 interval로의 전환을 도출한다.
 *
 * Yahoo 빈/422 응답 등으로 분봉 한계를 초과했을 때 `fetch-comparison`이
 * 한 단계 거친 interval로 1회 재시도하기 위해 사용한다(R8.3).
 *
 * @returns 폴백 interval. 더 이상 폴백할 단계가 없으면 null.
 */
export function getFallbackInterval(range: ComparisonRange): ComparisonInterval | null {
  return RANGE_TO_INTERVAL[range].fallbackInterval;
}

/**
 * perp candleSnapshot의 startTime/endTime(epoch ms UTC)을 계산한다.
 *
 * endTime은 호출 시각(`now`), startTime은 `now - perpLookbackMs`이다.
 * 테스트 가능성을 위해 `now`를 주입 가능하게 한다(기본값 Date.now()).
 */
export function resolvePerpWindow(
  range: ComparisonRange,
  now: number = Date.now(),
): { startTime: number; endTime: number } {
  const { perpLookbackMs } = RANGE_TO_INTERVAL[range];
  return {
    startTime: now - perpLookbackMs,
    endTime: now,
  };
}

/**
 * Yahoo 주식 캔들 URL을 생성한다(R2.1).
 *
 * @param pair Yahoo 주식 심볼 (예: '005930.KS')
 * @param range Yahoo range 토큰
 * @param interval 캔들 간격 (range로부터 도출 또는 폴백 결과)
 */
export function buildYahooStockUrl(
  pair: string,
  range: ComparisonRange,
  interval: ComparisonInterval,
): string {
  return `${YAHOO_CHART_BASE}/${encodeURIComponent(pair)}?range=${range}&interval=${interval}`;
}

/**
 * Yahoo USD/KRW 환율 URL을 생성한다(R4.1).
 *
 * interval은 candle interval과 무관하게 1h로 고정한다.
 */
export function buildYahooRateUrl(range: ComparisonRange): string {
  return `${YAHOO_CHART_BASE}/${encodeURIComponent(YAHOO_RATE_SYMBOL)}?range=${range}&interval=${RATE_INTERVAL}`;
}

/** Hyperliquid POST 엔드포인트 URL (R3.1) */
export function buildHyperliquidUrl(): string {
  return `${HYPERLIQUID_CONFIG.restBaseUrl}/info`;
}

/**
 * Hyperliquid candleSnapshot POST body를 생성한다(R3.1/R3.4).
 *
 * futures-dashboard `buildHyperliquidBody`의 candleSnapshot 패턴을 미러링한다.
 * 코인명에는 `xyz:` 접두사만 사용하고 `dex` 파라미터는 추가하지 않는다.
 *
 * @param coin Hyperliquid 코인명 (예: 'xyz:SMSN')
 * @param interval 캔들 간격 (주식과 동일하게 정렬 — R3.5)
 * @param range range 토큰 (perpLookbackMs로 startTime 계산)
 * @param now 호출 시각 (테스트 주입용, 기본 Date.now())
 */
export function buildHyperliquidBody(
  coin: string,
  interval: ComparisonInterval,
  range: ComparisonRange,
  now: number = Date.now(),
): string {
  const { startTime, endTime } = resolvePerpWindow(range, now);
  return JSON.stringify({
    type: 'candleSnapshot',
    req: { coin, interval, startTime, endTime },
  });
}
