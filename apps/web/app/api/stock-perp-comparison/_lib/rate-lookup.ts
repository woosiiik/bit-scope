import type { RatePoint } from '@bitscope/shared';

/**
 * 환율 시계열 정렬 + 최근접 직전(nearest-prior) lookup (R4.3, R4.4)
 *
 * 환율 시계열은 캔들보다 거칠다(hourly vs 1m). 따라서 선형 보간 대신
 * step(계단식) 유지를 적용한다 — 어떤 캔들 시각 `candleTs`에 대해
 * `timestamp <= candleTs`인 가장 큰(직전) 환율 포인트의 값을 그대로 사용한다.
 *
 * 설계: 빌더(`buildRateLookup`)가 입력 배열을 한 번 오름차순 정렬한 뒤,
 * 정렬 비용 없이 반복 호출 가능한 lookup 함수를 반환한다.
 */

/** 캔들 timestamp(UTC epoch ms)에 적용할 환율을 반환한다. 적용 불가 시 null. */
export type RateLookupFn = (candleTs: number) => number | null;

/**
 * `RatePoint[]`를 timestamp 오름차순으로 정렬한 뒤, 최근접 직전 환율을
 * 반환하는 lookup 함수를 만든다.
 *
 * 동작 규칙:
 * - 배열이 비어 있으면 lookup은 항상 `null`을 반환한다(경계 처리, R9.4).
 * - `candleTs`가 첫 포인트의 timestamp 이전이면 첫 포인트의 rate를 사용한다(경계 처리).
 * - 그 외에는 `timestamp <= candleTs`인 가장 큰 인덱스의 rate를 binary search로 찾는다.
 * - 보간하지 않는다(step 유지): 다음 환율 포인트 전까지 직전 값을 그대로 사용한다.
 *
 * 입력 배열은 변형하지 않는다(방어적 복사 후 정렬).
 *
 * @param points 환율 시계열(정렬 여부 무관)
 * @returns 캔들 timestamp → 적용 환율(number) 또는 null 매핑 함수
 */
export function buildRateLookup(points: readonly RatePoint[]): RateLookupFn {
  // 입력 변형 방지를 위한 복사 후 timestamp 오름차순 정렬.
  const sorted: RatePoint[] = [...points].sort((a, b) => a.timestamp - b.timestamp);

  return (candleTs: number): number | null => lookupRate(sorted, candleTs);
}

/**
 * 이미 timestamp 오름차순으로 정렬된 `RatePoint[]`에서 `candleTs`에 적용할
 * 최근접 직전 환율을 binary search로 찾는다.
 *
 * 호출 측이 정렬을 보장해야 한다(정렬되지 않은 입력을 다룬다면 `buildRateLookup` 사용).
 *
 * @param sorted timestamp 오름차순으로 정렬된 환율 시계열
 * @param candleTs 캔들 timestamp (UTC epoch ms)
 * @returns 적용 환율, 적용 불가(빈 배열) 시 null
 */
export function lookupRate(sorted: readonly RatePoint[], candleTs: number): number | null {
  const first = sorted[0];
  if (first === undefined) {
    return null;
  }

  // candleTs가 첫 포인트 이전이면 첫 rate 사용(경계 처리).
  if (candleTs < first.timestamp) {
    return first.rate;
  }

  // binary search: timestamp <= candleTs 인 가장 큰 인덱스를 찾는다.
  let lo = 0;
  let hi = sorted.length - 1;
  let result = 0; // 첫 포인트 이전 케이스는 위에서 처리됨 → 최소 0번 인덱스는 후보.

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const point = sorted[mid];
    if (point !== undefined && point.timestamp <= candleTs) {
      result = mid; // 후보 갱신 후 더 큰 인덱스 탐색.
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return sorted[result]?.rate ?? null;
}
