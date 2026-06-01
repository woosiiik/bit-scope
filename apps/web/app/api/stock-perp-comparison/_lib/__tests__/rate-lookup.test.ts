import { describe, it, expect } from 'vitest';
import type { RatePoint } from '@bitscope/shared';
import { buildRateLookup, lookupRate } from '../rate-lookup';

/**
 * rate-lookup 단위 테스트 (R4.3, R4.4)
 *
 * 검증 케이스:
 * - 정확 일치(exact match)
 * - 직전 값(nearest-prior)
 * - 첫 포인트 이전 경계(before-first-point)
 * - 빈 배열(empty)
 * - step 유지(보간 안 함, no interpolation)
 */
describe('rate-lookup', () => {
  // 의도적으로 정렬되지 않은 시계열(빌더가 정렬해야 함).
  const points: RatePoint[] = [
    { timestamp: 3000, rate: 1380 },
    { timestamp: 1000, rate: 1360 },
    { timestamp: 2000, rate: 1370 },
  ];

  describe('buildRateLookup', () => {
    it('정확히 일치하는 timestamp는 해당 포인트의 rate를 반환한다', () => {
      const lookup = buildRateLookup(points);
      expect(lookup(1000)).toBe(1360);
      expect(lookup(2000)).toBe(1370);
      expect(lookup(3000)).toBe(1380);
    });

    it('정확히 일치하는 포인트가 없으면 직전(nearest-prior) 값을 사용한다', () => {
      const lookup = buildRateLookup(points);
      // 1500 → 직전 포인트 1000 (1360)
      expect(lookup(1500)).toBe(1360);
      // 2999 → 직전 포인트 2000 (1370)
      expect(lookup(2999)).toBe(1370);
      // 마지막 포인트 이후 → 마지막 포인트 유지
      expect(lookup(9999)).toBe(1380);
    });

    it('첫 포인트 이전 timestamp는 첫 rate를 사용한다(경계 처리)', () => {
      const lookup = buildRateLookup(points);
      // 500 < 1000 → 첫 포인트 rate
      expect(lookup(500)).toBe(1360);
      expect(lookup(0)).toBe(1360);
      expect(lookup(999)).toBe(1360);
    });

    it('빈 배열이면 항상 null을 반환한다', () => {
      const lookup = buildRateLookup([]);
      expect(lookup(1000)).toBeNull();
      expect(lookup(0)).toBeNull();
      expect(lookup(Number.MAX_SAFE_INTEGER)).toBeNull();
    });

    it('보간하지 않고 직전 값을 step(계단식)으로 유지한다', () => {
      // 두 포인트 사이의 여러 시각에서 항상 직전 값이어야 한다(보간 금지).
      const lookup = buildRateLookup([
        { timestamp: 1000, rate: 1000 },
        { timestamp: 2000, rate: 2000 },
      ]);
      // 1000~1999 구간은 전부 1000(보간이라면 1500은 1500이 되어야 함).
      expect(lookup(1000)).toBe(1000);
      expect(lookup(1250)).toBe(1000);
      expect(lookup(1500)).toBe(1000);
      expect(lookup(1750)).toBe(1000);
      expect(lookup(1999)).toBe(1000);
      // 2000에서 비로소 다음 값으로 점프.
      expect(lookup(2000)).toBe(2000);
    });

    it('입력 배열을 변형하지 않는다', () => {
      const input: RatePoint[] = [
        { timestamp: 3000, rate: 1380 },
        { timestamp: 1000, rate: 1360 },
      ];
      const snapshot = input.map((p) => ({ ...p }));
      buildRateLookup(input);
      expect(input).toEqual(snapshot);
    });

    it('단일 포인트 배열은 모든 시각에 그 rate를 반환한다', () => {
      const lookup = buildRateLookup([{ timestamp: 5000, rate: 1400 }]);
      expect(lookup(1)).toBe(1400); // 이전 → 첫(유일) rate
      expect(lookup(5000)).toBe(1400); // 일치
      expect(lookup(9999)).toBe(1400); // 이후 → 유지
    });
  });

  describe('lookupRate (사전 정렬된 입력)', () => {
    const sorted: RatePoint[] = [
      { timestamp: 1000, rate: 1360 },
      { timestamp: 2000, rate: 1370 },
      { timestamp: 3000, rate: 1380 },
    ];

    it('정확 일치 / 직전 값 / 첫 포인트 이전 / 빈 배열을 처리한다', () => {
      expect(lookupRate(sorted, 2000)).toBe(1370); // 정확 일치
      expect(lookupRate(sorted, 2500)).toBe(1370); // 직전 값
      expect(lookupRate(sorted, 500)).toBe(1360); // 첫 포인트 이전
      expect(lookupRate([], 2000)).toBeNull(); // 빈 배열
    });
  });
});
