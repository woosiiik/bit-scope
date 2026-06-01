/**
 * 주식-perp 비교 뷰 URL/Body 빌더
 *
 * 세 소스(주식/환율/perp)의 외부 API 요청을 생성한다.
 * - 주식:  GET https://api.stock.naver.com/chart/domestic/item/{code}/{day|minute}?startDateTime&endDateTime
 * - 환율:  GET https://api.frankfurter.dev/v1/{start}..{end}?base=USD&symbols=KRW
 * - perp:  POST https://api.hyperliquid.xyz/info  (candleSnapshot)
 *
 * 주식·환율 모두 Yahoo에서 옮겼다 — Yahoo는 데이터센터(OCI) IP에서 429로 상시 차단된다.
 * - 주식: 네이버 금융 API. 1분봉(`minute`)/일봉(`day`)만 제공하므로 interval은 1m/1d로 한정.
 *   날짜 파라미터는 KST(Asia/Seoul) 기준 'YYYYMMDDHHMMSS' 문자열이다.
 * - 환율: frankfurter.dev(ECB 공식, 무키). IP throttle이 없고 과거 일별 시계열을 제공한다(R4).
 *   FX는 분 단위로 거의 변하지 않으므로 일별 해상도 + step lookup으로 캔들에 매핑한다.
 *
 * interval은 사용자가 직접 보내지 않고 `range`로부터 `RANGE_TO_INTERVAL`로 결정한다
 * (R8.2/R8.4 — 주식·perp interval을 항상 동일하게 정렬).
 *
 * 기존 futures-dashboard `buildHyperliquidBody`의 candleSnapshot POST 패턴을 미러링하되,
 * 코인명에는 `xyz:` 접두사만 사용하고 `dex` 파라미터는 추가하지 않는다(R3.4).
 */

import type {
  ComparisonInterval,
  ComparisonRange,
} from '@bitscope/shared';
import { HYPERLIQUID_CONFIG, RANGE_TO_INTERVAL } from '@bitscope/shared';

/** 네이버 금융 국내 주식 차트 API base URL */
const NAVER_STOCK_BASE = 'https://api.stock.naver.com/chart/domestic/item';

/** KST 오프셋 (UTC+9) ms */
const KST_OFFSET_MS = 9 * 3600 * 1000;

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

/** UTC epoch ms → KST 'YYYYMMDDHHMMSS' 문자열 (네이버 startDateTime/endDateTime 형식). */
function formatKstStamp(epochMs: number): string {
  // KST 벽시계 = UTC instant + 9h. UTC 컴포넌트로 읽으면 KST 표기가 된다.
  const d = new Date(epochMs + KST_OFFSET_MS);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

/** 'NNNNNN.KS' 등 거래소 접미사를 떼고 네이버 종목코드만 남긴다 (예: '005930.KS' → '005930'). */
function toNaverCode(stockSymbol: string): string {
  return stockSymbol.replace(/\..*$/, '');
}

/**
 * 네이버 금융 국내 주식 캔들 URL을 생성한다(R2.1).
 *
 * interval이 '1d'면 일봉(`day`), 그 외(1m)는 분봉(`minute`) 엔드포인트를 사용한다.
 * 조회 구간은 `[now - perpLookbackMs, now]`로 perp 윈도우와 동일하게 맞춘다.
 * startDateTime/endDateTime은 KST 기준 'YYYYMMDDHHMMSS' 문자열이다.
 *
 * @param stockSymbol 페어 심볼 (예: '005930.KS')
 * @param interval 캔들 간격 ('1m' | '1d')
 * @param range ComparisonRange (perpLookbackMs로 시작 시각 계산)
 * @param now 호출 시각 (테스트 주입용, 기본 Date.now())
 */
export function buildNaverStockUrl(
  stockSymbol: string,
  interval: ComparisonInterval,
  range: ComparisonRange,
  now: number = Date.now(),
): string {
  const code = toNaverCode(stockSymbol);
  const path = interval === '1d' ? 'day' : 'minute';
  const { perpLookbackMs } = RANGE_TO_INTERVAL[range];
  const start = formatKstStamp(now - perpLookbackMs);
  const end = formatKstStamp(now);
  return `${NAVER_STOCK_BASE}/${code}/${path}?startDateTime=${start}&endDateTime=${end}`;
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
