/**
 * 주식-perp 비교 뷰 병렬 fetch + 부분 실패 분리 (R9.2~9.5, R10.1)
 *
 * 세 소스(주식/환율/perp)를 `Promise.allSettled`로 병렬 조회하고,
 * 소스별 성공/실패를 `errors.{stock,perp,rate}`로 분리한다.
 * 기존 futures-dashboard `fetch-indicator.ts`의 `Promise.allSettled` 병렬 fetch
 * 패턴을 미러링한다.
 *
 * 데이터 소스 (모두 Yahoo에서 옮김 — Yahoo는 OCI 데이터센터 IP에서 429 상시 차단):
 * - 주식: 네이버 금융 API. 1분봉/일봉만 제공하므로 interval 폴백이 불필요하다.
 * - 환율: frankfurter.dev(ECB 공식). range 단위 전역 캐시.
 * - perp: Hyperliquid candleSnapshot.
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
  buildNaverStockUrl,
  resolveIntervalPlan,
} from './url-builder';
import { buildCacheKey, getGlobalCache } from '../../exchange/_lib/cache';

/** 외부 API 타임아웃 (ms) — futures-dashboard와 동일 정책 */
const FETCH_TIMEOUT = 10_000;

/** 브라우저 형태의 User-Agent (일부 외부 API가 빈 UA를 차단함). */
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** fetch-comparison 결과 */
export interface FetchComparisonResult {
  /** 네이버 주식 캔들 응답(raw JSON 배열). 실패 시 null */
  stockRaw: unknown;
  /** frankfurter 환율 응답(raw JSON). 실패 시 null */
  rateRaw: unknown;
  /** Hyperliquid candleSnapshot 응답(raw JSON). 실패 시 null */
  perpRaw: unknown;
  /** range로부터 결정한 interval */
  requestedInterval: ComparisonInterval;
  /** 실제로 적용된 interval (네이버는 폴백이 없어 requestedInterval과 동일) */
  appliedInterval: ComparisonInterval;
  /** interval 폴백이 발생했는지 여부 (네이버는 항상 false) */
  fallbackApplied: boolean;
  /** 소스별 부분 실패 메시지(R9.5) */
  errors: {
    stock: string | null;
    perp: string | null;
    rate: string | null;
  };
}

/**
 * 네이버 금융 국내 주식 캔들을 fetch한다(R2.1).
 *
 * 네이버는 1분봉/일봉을 깔끔한 JSON 배열로 제공하며 분봉 한계가 없어 interval 폴백이
 * 필요 없다. 빈 배열이면(거래일 없음 등) 에러로 간주한다.
 */
async function fetchNaverStock(
  stockSymbol: string,
  interval: ComparisonInterval,
  range: ComparisonRange,
): Promise<unknown> {
  const url = buildNaverStockUrl(stockSymbol, interval, range);
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', 'User-Agent': BROWSER_UA },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!response.ok) {
    throw new Error(`Naver stock API error: ${response.status} ${response.statusText}`);
  }
  const raw = await response.json();
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Naver empty stock candles');
  }
  return raw;
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
 * 주식/환율/perp 3소스를 병렬로 fetch하고 부분 실패 정보를 함께 반환한다.
 *
 * @param pair  주식 심볼 (예: '005930.KS' — 네이버 코드는 빌더가 추출)
 * @param perpCoin Hyperliquid 코인명 (예: 'xyz:SMSN')
 * @param range ComparisonRange — interval은 서버가 RANGE_TO_INTERVAL로 결정한다(R8.2/R8.4)
 */
export async function fetchComparison(
  pair: string,
  perpCoin: string,
  range: ComparisonRange,
): Promise<FetchComparisonResult> {
  const { interval: requestedInterval } = resolveIntervalPlan(range);

  const [stockSettled, rateSettled, perpSettled] = await Promise.allSettled([
    fetchNaverStock(pair, requestedInterval, range),
    fetchFrankfurterRate(range),
    fetchHyperliquidPerp(perpCoin, requestedInterval, range),
  ]);

  const errors: FetchComparisonResult['errors'] = {
    stock: null,
    perp: null,
    rate: null,
  };

  // 주식 결과 처리 (네이버는 interval 폴백이 없어 appliedInterval = requestedInterval).
  let stockRaw: unknown = null;
  if (stockSettled.status === 'fulfilled') {
    stockRaw = stockSettled.value;
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
    appliedInterval: requestedInterval,
    fallbackApplied: false,
    errors,
  };
}
