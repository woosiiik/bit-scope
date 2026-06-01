/**
 * 주식-perp 비교 뷰 URL/Body 빌더
 *
 * 세 소스(주식/환율/perp)의 외부 API 요청을 생성한다.
 * - 주식:  GET https://query1.finance.yahoo.com/v8/finance/chart/{pair}?range&interval
 * - 환율:  GET https://api.frankfurter.dev/v1/{start}..{end}?base=USD&symbols=KRW
 * - perp:  POST https://api.hyperliquid.xyz/info  (candleSnapshot)
 *
 * 환율은 Yahoo(KRW=X) 대신 frankfurter.dev(ECB 공식, 무키)를 사용한다.
 * Yahoo는 데이터센터(OCI) IP에서 429로 throttle되어 환율 조회가 실패했고,
 * frankfurter는 IP throttle이 없고 과거 일별 시계열을 제공한다(R4). FX는 분 단위로
 * 거의 변하지 않으므로 일별 해상도 + step lookup으로 캔들에 매핑한다.
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

/** frankfurter.dev(ECB 공식 환율) base URL */
const FRANKFURTER_BASE = 'https://api.frankfurter.dev/v1';

/** 하루(ms) */
const DAY_MS = 864e5;

/**
 * range별 환율 시계열 조회 일수.
 *
 * 캔들 lookback보다 며칠 더 넉넉히 잡아, 주말·공휴일로 ECB 환율이 없는 날에도
 * 직전 영업일 환율을 step lookup으로 적용할 수 있게 한다.
 */
const RANGE_TO_RATE_DAYS: Record<ComparisonRange, number> = {
  '1d': 7,
  '5d': 10,
  '1mo': 40,
  '6mo': 200,
  '1y': 380,
};

/** epoch ms → 'YYYY-MM-DD' (UTC) */
function formatUtcDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

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
 * frankfurter.dev USD/KRW 환율 시계열 URL을 생성한다(R4.1).
 *
 * `{start}..{end}` 구간의 일별 USD→KRW 환율을 요청한다. start는 range별
 * `RANGE_TO_RATE_DAYS`만큼 과거, end는 호출 시각(now)이다. 날짜는 UTC 기준.
 *
 * @param range ComparisonRange
 * @param now 호출 시각 (테스트 주입용, 기본 Date.now())
 */
export function buildFrankfurterRateUrl(
  range: ComparisonRange,
  now: number = Date.now(),
): string {
  const start = formatUtcDate(now - RANGE_TO_RATE_DAYS[range] * DAY_MS);
  const end = formatUtcDate(now);
  return `${FRANKFURTER_BASE}/${start}..${end}?base=USD&symbols=KRW`;
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
