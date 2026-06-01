/**
 * 주식-perp 비교 뷰 병렬 fetch + 부분 실패/폴백 재시도 (R2.5, R8.3, R9.2~9.5, R10.1)
 *
 * 세 소스(주식/환율/perp)를 `Promise.allSettled`로 병렬 조회하고,
 * 소스별 성공/실패를 `errors.{stock,perp,rate}`로 분리한다.
 * 기존 futures-dashboard `fetch-indicator.ts`의 `Promise.allSettled` 병렬 fetch
 * 패턴을 미러링한다.
 *
 * 폴백 정책:
 * - Yahoo 429/throttle 시 1회 지수 백오프 재시도 후에도 실패하면 `errors.stock` 세팅(R9.2).
 * - Yahoo 빈/422 응답 시 `fallbackInterval`로 1회 재시도하고
 *   `fallbackApplied=true` + `appliedInterval`을 세팅한다(R2.5/R8.3).
 *
 * 이 함수는 raw fetch 결과(주식/환율/perp)와 에러 맵, 적용 interval 정보를
 * 그대로 반환한다. 정규화·병합은 라우트(`route.ts`)에서 수행한다.
 */

import type {
  ComparisonInterval,
  ComparisonRange,
} from '@bitscope/shared';
import {
  buildHyperliquidBody,
  buildHyperliquidUrl,
  buildFrankfurterRateUrl,
  buildYahooStockUrl,
  getFallbackInterval,
  resolveIntervalPlan,
} from './url-builder';
import { buildCacheKey, getGlobalCache } from '../../exchange/_lib/cache';

/** 외부 API 타임아웃 (ms) — futures-dashboard와 동일 정책 */
const FETCH_TIMEOUT = 10_000;

/** Yahoo throttle 재시도 시 지수 백오프 대기 (ms) */
const YAHOO_RETRY_DELAY_MS = 1_000;

/**
 * Yahoo Finance chart API는 User-Agent 없는 요청을 "Edge: Too Many Requests"로
 * 차단한다. 브라우저 형태의 User-Agent를 보내야 정상 응답을 받는다.
 */
const YAHOO_HEADERS = {
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
} as const;

/** fetch-comparison 결과 */
export interface FetchComparisonResult {
  /** Yahoo 주식 chart 응답(raw JSON). 실패 시 null */
  stockRaw: unknown;
  /** Yahoo KRW=X 환율 chart 응답(raw JSON). 실패 시 null */
  rateRaw: unknown;
  /** Hyperliquid candleSnapshot 응답(raw JSON). 실패 시 null */
  perpRaw: unknown;
  /** range로부터 1차로 요청한 interval (R8.3 안내용) */
  requestedInterval: ComparisonInterval;
  /** 실제로 적용된 interval (폴백 시 requestedInterval과 다를 수 있음) */
  appliedInterval: ComparisonInterval;
  /** interval 폴백이 발생했는지 여부(R8.3) */
  fallbackApplied: boolean;
  /** 소스별 부분 실패 메시지(R9.5) */
  errors: {
    stock: string | null;
    perp: string | null;
    rate: string | null;
  };
}

/** Yahoo throttle(429 등) 여부 판정용 커스텀 에러 */
class YahooThrottleError extends Error {
  constructor(status: number) {
    super(`Yahoo throttled: ${status}`);
    this.name = 'YahooThrottleError';
  }
}

/** Yahoo 빈/422 응답(폴백 트리거) 여부 판정용 커스텀 에러 */
class YahooEmptyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'YahooEmptyError';
  }
}

/** ms 단위 sleep */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Yahoo chart 응답이 캔들 데이터를 담고 있는지(비어있지 않은지) 확인한다.
 * `chart.result[0].timestamp`가 비었거나 `chart.error`가 있으면 빈 응답으로 본다.
 */
function isYahooEmpty(raw: unknown): boolean {
  const chart = (raw as { chart?: { result?: unknown[]; error?: unknown } } | null)?.chart;
  if (!chart) return true;
  if (chart.error != null) return true;
  const result = chart.result?.[0] as { timestamp?: unknown[] } | undefined;
  return !result || !Array.isArray(result.timestamp) || result.timestamp.length === 0;
}

/**
 * Yahoo 주식 chart를 한 번 fetch한다.
 *
 * - 429/throttle(또는 5xx) 응답이면 `YahooThrottleError`를 던진다.
 * - 422 응답이거나 정상 200이지만 빈 캔들이면 `YahooEmptyError`를 던진다(폴백 트리거).
 */
async function fetchYahooStockOnce(
  pair: string,
  range: ComparisonRange,
  interval: ComparisonInterval,
): Promise<unknown> {
  const url = buildYahooStockUrl(pair, range, interval);
  const response = await fetch(url, {
    method: 'GET',
    headers: YAHOO_HEADERS,
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });

  // 429/5xx → throttle로 간주하여 지수 백오프 재시도 대상.
  if (response.status === 429 || response.status >= 500) {
    throw new YahooThrottleError(response.status);
  }
  // 422 → 분봉 한계 초과 등. 폴백 interval로 재시도 대상.
  if (response.status === 422) {
    throw new YahooEmptyError(`Yahoo 422: ${pair} ${interval}`);
  }
  if (!response.ok) {
    throw new Error(`Yahoo stock API error: ${response.status} ${response.statusText}`);
  }

  const raw = await response.json();
  // 200이지만 빈 캔들 → 폴백 interval로 재시도 대상.
  if (isYahooEmpty(raw)) {
    throw new YahooEmptyError(`Yahoo empty candles: ${pair} ${interval}`);
  }
  return raw;
}

/**
 * Yahoo 주식 캔들을 fetch하되, throttle 1회 지수 백오프 재시도 +
 * 빈/422 응답 시 폴백 interval 1회 재시도를 적용한다.
 *
 * @returns 성공 시 raw 응답과 실제 적용 interval/폴백 여부.
 */
async function fetchYahooStockWithFallback(
  pair: string,
  range: ComparisonRange,
  interval: ComparisonInterval,
): Promise<{ raw: unknown; appliedInterval: ComparisonInterval; fallbackApplied: boolean }> {
  try {
    const raw = await fetchYahooStockOnce(pair, range, interval);
    return { raw, appliedInterval: interval, fallbackApplied: false };
  } catch (error) {
    if (error instanceof YahooThrottleError) {
      // 429/throttle → 1회 지수 백오프 재시도(R9.2).
      await sleep(YAHOO_RETRY_DELAY_MS);
      const raw = await fetchYahooStockOnce(pair, range, interval);
      return { raw, appliedInterval: interval, fallbackApplied: false };
    }

    if (error instanceof YahooEmptyError) {
      // 빈/422 → 폴백 interval로 1회 재시도(R2.5/R8.3).
      const fallbackInterval = getFallbackInterval(range);
      if (fallbackInterval !== null) {
        const raw = await fetchYahooStockOnce(pair, range, fallbackInterval);
        return { raw, appliedInterval: fallbackInterval, fallbackApplied: true };
      }
    }

    throw error;
  }
}

/** 환율 시계열 전역 캐시 TTL (ms) — FX는 일별이라 길게 잡아 외부 호출을 줄인다. */
const RATE_CACHE_TTL_MS = 3 * 3600 * 1000; // 3시간

/** frankfurter 응답이 환율 데이터를 담고 있는지(비어있지 않은지) 확인한다. */
function isFrankfurterEmpty(raw: unknown): boolean {
  const rates = (raw as { rates?: Record<string, unknown> } | null)?.rates;
  return rates == null || typeof rates !== 'object' || Object.keys(rates).length === 0;
}

/**
 * frankfurter.dev USD→KRW 환율 시계열을 fetch한다(R4.1).
 *
 * Yahoo(KRW=X)는 OCI 데이터센터 IP에서 429로 throttle되어 환율 조회가 실패했다.
 * frankfurter는 ECB 공식 환율을 무키·무throttle로 제공한다. FX는 일별이고 거의 변하지
 * 않으므로 range 단위로 전역 캐시(`RATE_CACHE_TTL_MS`)하여 외부 호출을 최소화한다.
 *
 * - 캐시 fresh hit → 캐시된 raw 반환.
 * - miss/만료 → fetch 후 캐시 저장. fetch 실패 시 스테일 캐시가 있으면 그걸로 폴백.
 */
async function fetchFrankfurterRate(range: ComparisonRange): Promise<unknown> {
  const cache = getGlobalCache();
  const cacheKey = buildCacheKey('spc-rate', 'USDKRW', { range });

  const cached = cache.getWithStale<unknown>(cacheKey);
  if (cached.hit && cached.isFresh) {
    return cached.data;
  }

  const url = buildFrankfurterRateUrl(range);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!response.ok) {
      throw new Error(`Frankfurter rate API error: ${response.status} ${response.statusText}`);
    }
    const raw = await response.json();
    if (isFrankfurterEmpty(raw)) {
      throw new Error('Frankfurter empty rates');
    }
    cache.set(cacheKey, raw, RATE_CACHE_TTL_MS);
    return raw;
  } catch (error) {
    // 일시 장애 시 스테일 캐시로 폴백(있으면).
    if (cached.hit && cached.data != null) {
      return cached.data;
    }
    throw error;
  }
}

/**
 * Hyperliquid candleSnapshot perp 캔들을 fetch한다(R3.1).
 *
 * futures-dashboard의 POST 패턴을 미러링한다(`Content-Type: application/json`).
 */
async function fetchHyperliquidPerp(
  coin: string,
  interval: ComparisonInterval,
  range: ComparisonRange,
): Promise<unknown> {
  const url = buildHyperliquidUrl();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: buildHyperliquidBody(coin, interval, range),
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!response.ok) {
    throw new Error(`Hyperliquid API error: ${response.status} ${response.statusText}`);
  }
  const raw = await response.json();
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('no perp candles');
  }
  return raw;
}

/**
 * 주식/환율/perp 3소스를 병렬로 fetch하고 부분 실패/폴백 정보를 함께 반환한다.
 *
 * @param pair  Yahoo 주식 심볼 (예: '005930.KS')
 * @param perpCoin Hyperliquid 코인명 (예: 'xyz:SMSN')
 * @param range ComparisonRange — interval은 서버가 폴백 표로 결정한다(R8.2/R8.4)
 */
export async function fetchComparison(
  pair: string,
  perpCoin: string,
  range: ComparisonRange,
): Promise<FetchComparisonResult> {
  const { interval: requestedInterval } = resolveIntervalPlan(range);

  const [stockSettled, rateSettled, perpSettled] = await Promise.allSettled([
    fetchYahooStockWithFallback(pair, range, requestedInterval),
    fetchFrankfurterRate(range),
    fetchHyperliquidPerp(perpCoin, requestedInterval, range),
  ]);

  const errors: FetchComparisonResult['errors'] = {
    stock: null,
    perp: null,
    rate: null,
  };

  // 주식 결과 처리(폴백 정보 반영).
  let stockRaw: unknown = null;
  let appliedInterval: ComparisonInterval = requestedInterval;
  let fallbackApplied = false;
  if (stockSettled.status === 'fulfilled') {
    stockRaw = stockSettled.value.raw;
    appliedInterval = stockSettled.value.appliedInterval;
    fallbackApplied = stockSettled.value.fallbackApplied;
  } else {
    errors.stock = stockSettled.reason?.message ?? 'Unknown error';
    console.error(`[stock-perp-comparison] ${pair} stock failed: ${errors.stock}`);
  }

  // 환율 결과 처리.
  let rateRaw: unknown = null;
  if (rateSettled.status === 'fulfilled') {
    rateRaw = rateSettled.value;
  } else {
    errors.rate = rateSettled.reason?.message ?? 'Unknown error';
    console.error(`[stock-perp-comparison] ${pair} rate failed: ${errors.rate}`);
  }

  // perp 결과 처리.
  let perpRaw: unknown = null;
  if (perpSettled.status === 'fulfilled') {
    perpRaw = perpSettled.value;
  } else {
    errors.perp = perpSettled.reason?.message ?? 'Unknown error';
    console.error(`[stock-perp-comparison] ${perpCoin} perp failed: ${errors.perp}`);
  }

  return {
    stockRaw,
    rateRaw,
    perpRaw,
    requestedInterval,
    appliedInterval,
    fallbackApplied,
    errors,
  };
}
