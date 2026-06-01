/**
 * 주식/perp 타임라인 병합 + 통화 변환 + marketOpen/stockGap 도출
 * (R4.2, R5.3, R5.5, R6.2, R6.3, R7.1, R7.2)
 *
 * - `futures-dashboard`의 `mergeTimeSeries` 버킷 패턴을 미러링한다:
 *   `bucket = floor(ts / intervalMs) * intervalMs`로 주식·perp 캔들을 동일 버킷에
 *   매핑하고, 한쪽이 결측인 버킷은 null로 유지한다(forward-fill 금지).
 * - 각 포인트에 환율 lookup(`buildRateLookup`)을 적용하여
 *   `perpPrice = perpPriceRaw(USD) × appliedRate`(baseCurrency='KRW')를 계산한다.
 *   환율이 없으면 `appliedRate`/`perpPrice`는 null이고 `perpPriceRaw`는 보존한다.
 * - `marketOpen`(1차: 해당 버킷의 주식 close 존재, 2차 보조: KRX 세션/요일)과
 *   `stockGap`(직전 포인트가 개장이었고 현재 버킷에 주식이 결측 → 갭 시작점)을
 *   도출하고 timestamp 오름차순으로 정렬한다.
 */

import type {
  ComparisonInterval,
  ComparisonPoint,
  NormalizedCandle,
} from '@bitscope/shared';
import { KRX_SESSION } from '@bitscope/shared';
import { buildRateLookup } from './rate-lookup';

/** 하루 ms */
const DAY_MS = 86_400_000;

/** ComparisonInterval → 버킷 크기(ms). */
export function intervalToMs(interval: ComparisonInterval): number {
  switch (interval) {
    case '1m':
      return 60_000;
    case '5m':
      return 5 * 60_000;
    case '15m':
      return 15 * 60_000;
    case '1d':
      return DAY_MS;
    default:
      return 60_000;
  }
}

/** 버킷 정규화: floor(ts / intervalMs) * intervalMs. */
function toBucket(ts: number, intervalMs: number): number {
  return Math.floor(ts / intervalMs) * intervalMs;
}

/**
 * 버킷 시각(UTC epoch ms)이 KRX 정규장(평일 09:00–15:30 KST) 안인지 판정한다.
 * 한국은 DST가 없으므로 `Intl.DateTimeFormat`의 'Asia/Seoul' 타임존으로 안전하게
 * 요일/시·분을 계산한다(R8 timezone 정확성).
 *
 * marketOpen의 **보조** 판정(2차)으로만 쓰인다. 1차 기준은 주식 close 존재 여부다.
 */
export function isWithinKrxSession(timestampMs: number): boolean {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = fmt.formatToParts(new Date(timestampMs));
  let weekday = '';
  let hour = NaN;
  let minute = NaN;
  for (const part of parts) {
    if (part.type === 'weekday') weekday = part.value;
    else if (part.type === 'hour') hour = parseInt(part.value, 10);
    else if (part.type === 'minute') minute = parseInt(part.value, 10);
  }

  // 주말(토/일) 제외.
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  if (Number.isNaN(hour) || Number.isNaN(minute)) return false;

  // Intl hour12:false는 자정을 '24'로 줄 수 있으므로 0으로 보정.
  const normalizedHour = hour === 24 ? 0 : hour;
  const minuteOfDay = normalizedHour * 60 + minute;

  return minuteOfDay >= KRX_SESSION.openMin && minuteOfDay <= KRX_SESSION.closeMin;
}

/** 한 버킷에 모인 주식/perp close 값(둘 다 결측 가능). */
interface BucketSlot {
  stockClose: number | null;
  perpClose: number | null;
}

/**
 * 주식/perp 캔들을 공통 버킷 그리드로 병합하고, 환율 변환 및
 * marketOpen/stockGap을 도출한 `ComparisonPoint[]`를 반환한다.
 *
 * @param stockCandles 정규화된 주식 캔들(KRW). close가 null인 버킷은 결측으로 유지.
 * @param perpCandles  정규화된 perp 캔들(USD).
 * @param ratePoints   USD/KRW 환율 시계열(정렬 여부 무관). 빈 배열이면 환율 적용 불가.
 * @param intervalMs   버킷 크기(ms). 라우트가 resolved interval로부터 전달한다.
 * @returns timestamp 오름차순 정렬된 ComparisonPoint 배열
 */
export function mergeTimeline(
  stockCandles: readonly NormalizedCandle[],
  perpCandles: readonly NormalizedCandle[],
  ratePoints: Parameters<typeof buildRateLookup>[0],
  intervalMs: number,
): ComparisonPoint[] {
  const lookup = buildRateLookup(ratePoints);

  // 버킷 시각 → { stockClose, perpClose } 매핑.
  const buckets = new Map<number, BucketSlot>();

  const getSlot = (bucket: number): BucketSlot => {
    const existing = buckets.get(bucket);
    if (existing !== undefined) return existing;
    const created: BucketSlot = { stockClose: null, perpClose: null };
    buckets.set(bucket, created);
    return created;
  };

  // 주식 close 매핑(null close는 결측으로 유지, forward-fill 금지).
  for (const candle of stockCandles) {
    const bucket = toBucket(candle.timestamp, intervalMs);
    const slot = getSlot(bucket);
    if (candle.close !== null) {
      slot.stockClose = candle.close;
    }
  }

  // perp close 매핑.
  for (const candle of perpCandles) {
    const bucket = toBucket(candle.timestamp, intervalMs);
    const slot = getSlot(bucket);
    if (candle.close !== null) {
      slot.perpClose = candle.close;
    }
  }

  // 버킷을 timestamp 오름차순으로 정렬하여 순회하며 ComparisonPoint를 만든다.
  const sortedBuckets = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);

  const points: ComparisonPoint[] = [];
  // 직전 포인트가 "개장(혹은 주식 데이터 존재)"이었는지 추적(stockGap 시작점 판정용).
  let prevHadStock = false;

  for (const [timestamp, slot] of sortedBuckets) {
    const stockPrice = slot.stockClose;
    const perpPriceRaw = slot.perpClose;

    // 환율 적용(step 유지 lookup). 환율 없으면 null.
    const appliedRate = lookup(timestamp);
    const perpPrice =
      perpPriceRaw !== null && appliedRate !== null ? perpPriceRaw * appliedRate : null;

    // marketOpen: 1차는 주식 close 존재, 보조로 KRX 세션/요일.
    const hasStock = stockPrice !== null;
    const marketOpen = hasStock || isWithinKrxSession(timestamp);

    // stockGap: 직전이 주식 존재였는데 현재 버킷에 주식이 결측이면 갭 시작점.
    const stockGap = prevHadStock && !hasStock;

    points.push({
      timestamp,
      stockPrice,
      perpPrice,
      perpPriceRaw,
      appliedRate,
      marketOpen,
      stockGap,
    });

    prevHadStock = hasStock;
  }

  return points;
}
