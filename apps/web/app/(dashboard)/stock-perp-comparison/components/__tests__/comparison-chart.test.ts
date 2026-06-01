import { describe, it, expect } from 'vitest';
import type { ComparisonPoint } from '@bitscope/shared';
import {
  computeClosedRegions,
  downsamplePreservingBoundaries,
  toLineSeriesData,
  makeKstTickFormatter,
  findPointByTime,
} from '../../lib/chart-data';

/**
 * chart-data 순수 헬퍼 단위 테스트 (R3, R5, R6.2, R7.1, R8.3, R9.3)
 *
 * 헬퍼는 lightweight-charts 렌더와 무관한 모듈 수준 순수 함수이므로
 * 차트 렌더 없이 import만으로 테스트 가능하다.
 *
 * computeClosedRegions:
 * - 연속 휴장(marketOpen===false) 구간을 {x1,x2}로 묶음
 * - 단일 포인트 휴장(x1===x2)
 * - 휴장 없음 → 빈 배열
 * - 선두/말미 휴장 구간 처리
 *
 * downsamplePreservingBoundaries:
 * - 임계 이하 배열은 그대로 반환(동일 참조)
 * - 임계 초과 배열은 ~target 으로 다운샘플
 * - stockGap===true 포인트는 항상 보존
 * - marketOpen 전환 경계 보존
 * - 첫/마지막 보존, 순서 유지
 */

const MIN = 60_000;
const BASE = Date.UTC(2024, 4, 29, 0, 0, 0); // 기준 시각

/** ComparisonPoint 생성 헬퍼. 필요한 필드만 의미 있게 채우고 나머지는 기본값. */
function point(
  timestamp: number,
  marketOpen: boolean,
  opts: { stockGap?: boolean; stockPrice?: number | null; perpPrice?: number | null } = {},
): ComparisonPoint {
  return {
    timestamp,
    stockPrice: opts.stockPrice ?? (marketOpen ? 100 : null),
    perpPrice: opts.perpPrice ?? 200,
    perpPriceRaw: 0.15,
    appliedRate: 1380,
    marketOpen,
    stockGap: opts.stockGap ?? false,
  };
}

describe('computeClosedRegions', () => {
  it('연속된 휴장 구간을 하나의 {x1,x2}로 묶는다', () => {
    const points: ComparisonPoint[] = [
      point(BASE + 0 * MIN, true),
      point(BASE + 1 * MIN, false),
      point(BASE + 2 * MIN, false),
      point(BASE + 3 * MIN, false),
      point(BASE + 4 * MIN, true),
    ];
    const regions = computeClosedRegions(points);
    expect(regions).toHaveLength(1);
    expect(regions[0]!.x1).toBe(BASE + 1 * MIN);
    expect(regions[0]!.x2).toBe(BASE + 3 * MIN);
  });

  it('서로 떨어진 두 휴장 구간을 각각 묶는다', () => {
    const points: ComparisonPoint[] = [
      point(BASE + 0 * MIN, false),
      point(BASE + 1 * MIN, false),
      point(BASE + 2 * MIN, true),
      point(BASE + 3 * MIN, false),
      point(BASE + 4 * MIN, false),
      point(BASE + 5 * MIN, true),
    ];
    const regions = computeClosedRegions(points);
    expect(regions).toHaveLength(2);
    expect(regions[0]!.x1).toBe(BASE + 0 * MIN);
    expect(regions[0]!.x2).toBe(BASE + 1 * MIN);
    expect(regions[1]!.x1).toBe(BASE + 3 * MIN);
    expect(regions[1]!.x2).toBe(BASE + 4 * MIN);
  });

  it('단일 포인트 휴장은 x1===x2로 닫는다', () => {
    const points: ComparisonPoint[] = [
      point(BASE + 0 * MIN, true),
      point(BASE + 1 * MIN, false),
      point(BASE + 2 * MIN, true),
    ];
    const regions = computeClosedRegions(points);
    expect(regions).toHaveLength(1);
    expect(regions[0]!.x1).toBe(BASE + 1 * MIN);
    expect(regions[0]!.x2).toBe(BASE + 1 * MIN);
  });

  it('휴장 구간이 없으면 빈 배열을 반환한다', () => {
    const points: ComparisonPoint[] = [
      point(BASE + 0 * MIN, true),
      point(BASE + 1 * MIN, true),
      point(BASE + 2 * MIN, true),
    ];
    expect(computeClosedRegions(points)).toEqual([]);
  });

  it('빈 입력은 빈 배열을 반환한다', () => {
    expect(computeClosedRegions([])).toEqual([]);
  });

  it('선두 휴장 구간을 묶는다', () => {
    const points: ComparisonPoint[] = [
      point(BASE + 0 * MIN, false),
      point(BASE + 1 * MIN, false),
      point(BASE + 2 * MIN, true),
      point(BASE + 3 * MIN, true),
    ];
    const regions = computeClosedRegions(points);
    expect(regions).toHaveLength(1);
    expect(regions[0]!.x1).toBe(BASE + 0 * MIN);
    expect(regions[0]!.x2).toBe(BASE + 1 * MIN);
  });

  it('말미 휴장 구간을 배열 종료 시 닫는다', () => {
    const points: ComparisonPoint[] = [
      point(BASE + 0 * MIN, true),
      point(BASE + 1 * MIN, true),
      point(BASE + 2 * MIN, false),
      point(BASE + 3 * MIN, false),
    ];
    const regions = computeClosedRegions(points);
    expect(regions).toHaveLength(1);
    expect(regions[0]!.x1).toBe(BASE + 2 * MIN);
    expect(regions[0]!.x2).toBe(BASE + 3 * MIN);
  });
});

describe('downsamplePreservingBoundaries', () => {
  it('임계 이하 배열은 그대로(동일 참조) 반환한다', () => {
    const points: ComparisonPoint[] = Array.from({ length: 50 }, (_, i) =>
      point(BASE + i * MIN, true),
    );
    const result = downsamplePreservingBoundaries(points, 100);
    expect(result).toBe(points);
  });

  it('임계와 같은 길이 배열도 그대로 반환한다', () => {
    const points: ComparisonPoint[] = Array.from({ length: 100 }, (_, i) =>
      point(BASE + i * MIN, true),
    );
    const result = downsamplePreservingBoundaries(points, 100);
    expect(result).toBe(points);
  });

  it('임계 초과 배열을 target 부근으로 다운샘플한다', () => {
    const points: ComparisonPoint[] = Array.from({ length: 1000 }, (_, i) =>
      point(BASE + i * MIN, true),
    );
    const result = downsamplePreservingBoundaries(points, 100);
    // 균등 step 샘플링이므로 원본보다 훨씬 적고 target 부근이어야 한다.
    expect(result.length).toBeLessThan(points.length);
    expect(result.length).toBeLessThanOrEqual(110);
    expect(result.length).toBeGreaterThanOrEqual(90);
  });

  it('첫 포인트와 마지막 포인트를 항상 보존한다', () => {
    const points: ComparisonPoint[] = Array.from({ length: 500 }, (_, i) =>
      point(BASE + i * MIN, true),
    );
    const result = downsamplePreservingBoundaries(points, 100);
    expect(result[0]!.timestamp).toBe(points[0]!.timestamp);
    expect(result[result.length - 1]!.timestamp).toBe(points[points.length - 1]!.timestamp);
  });

  it('stockGap===true 포인트는 균등 샘플링에서 누락되더라도 항상 보존한다', () => {
    const points: ComparisonPoint[] = Array.from({ length: 1000 }, (_, i) =>
      point(BASE + i * MIN, true),
    );
    // step 경계와 어긋나는 인덱스에 갭을 둔다(step=10이므로 7,13은 균등 샘플 밖).
    const gapIndices = [7, 13, 333, 777];
    for (const gi of gapIndices) {
      points[gi] = point(BASE + gi * MIN, false, { stockGap: true, stockPrice: null });
    }
    const result = downsamplePreservingBoundaries(points, 100);
    const resultTs = new Set(result.map((p) => p.timestamp));
    for (const gi of gapIndices) {
      expect(resultTs.has(BASE + gi * MIN)).toBe(true);
    }
  });

  it('marketOpen 전환 경계(양쪽)를 보존한다', () => {
    const points: ComparisonPoint[] = Array.from({ length: 1000 }, (_, i) =>
      point(BASE + i * MIN, true),
    );
    // 250~252를 휴장으로 → 249/250(개장→휴장) 및 252/253(휴장→개장) 경계 발생.
    for (let i = 250; i <= 252; i++) {
      points[i] = point(BASE + i * MIN, false, { stockPrice: null });
    }
    const result = downsamplePreservingBoundaries(points, 100);
    const resultTs = new Set(result.map((p) => p.timestamp));
    // 전환 경계 양쪽 인덱스가 모두 보존되어야 한다.
    expect(resultTs.has(BASE + 249 * MIN)).toBe(true);
    expect(resultTs.has(BASE + 250 * MIN)).toBe(true);
    expect(resultTs.has(BASE + 252 * MIN)).toBe(true);
    expect(resultTs.has(BASE + 253 * MIN)).toBe(true);
  });

  it('결과의 timestamp 오름차순(원본 순서)을 유지한다', () => {
    const points: ComparisonPoint[] = Array.from({ length: 600 }, (_, i) =>
      point(BASE + i * MIN, i % 50 < 10 ? false : true, {
        stockGap: i % 50 === 0,
      }),
    );
    const result = downsamplePreservingBoundaries(points, 100);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.timestamp).toBeGreaterThan(result[i - 1]!.timestamp);
    }
  });
});

describe('toLineSeriesData', () => {
  it('주식: null 가격은 whitespace(value 없음), 유효값은 LineData로 매핑한다', () => {
    const points: ComparisonPoint[] = [
      point(BASE + 0 * MIN, true, { stockPrice: 100 }),
      point(BASE + 1 * MIN, false, { stockPrice: null }),
      point(BASE + 2 * MIN, true, { stockPrice: 102 }),
    ];
    const data = toLineSeriesData(points, 'stockPrice');
    expect(data).toHaveLength(3);
    // 유효값
    expect(data[0]).toEqual({ time: Math.floor((BASE + 0 * MIN) / 1000), value: 100 });
    // 결측 → whitespace(value 키 없음)
    expect(data[1]).toEqual({ time: Math.floor((BASE + 1 * MIN) / 1000) });
    expect('value' in data[1]!).toBe(false);
    expect(data[2]).toEqual({ time: Math.floor((BASE + 2 * MIN) / 1000), value: 102 });
  });

  it('주식: time이 Math.floor(ts/1000) 초 단위로 변환된다(시프트 없음)', () => {
    const ts = BASE + 7 * MIN;
    const data = toLineSeriesData([point(ts, true, { stockPrice: 50 })], 'stockPrice');
    expect(data[0]!.time).toBe(Math.floor(ts / 1000));
  });

  it('perp: null 포인트는 배열에서 제외되어 연속 라인을 이룬다', () => {
    // point() 헬퍼는 `opts.perpPrice ?? 200`이라 null이 200으로 폴백되므로,
    // null 케이스는 포인트를 직접 구성한다.
    const mk = (ts: number, perpPrice: number | null): ComparisonPoint => ({
      timestamp: ts,
      stockPrice: 100,
      perpPrice,
      perpPriceRaw: 0.15,
      appliedRate: 1380,
      marketOpen: true,
      stockGap: false,
    });
    const points: ComparisonPoint[] = [
      mk(BASE + 0 * MIN, 200),
      mk(BASE + 1 * MIN, null),
      mk(BASE + 2 * MIN, 210),
    ];
    const data = toLineSeriesData(points, 'perpPrice');
    // null 포인트는 제외 → 2개만
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual({ time: Math.floor((BASE + 0 * MIN) / 1000), value: 200 });
    expect(data[1]).toEqual({ time: Math.floor((BASE + 2 * MIN) / 1000), value: 210 });
  });

  it('빈 입력은 빈 배열을 반환한다', () => {
    expect(toLineSeriesData([], 'stockPrice')).toEqual([]);
    expect(toLineSeriesData([], 'perpPrice')).toEqual([]);
  });
});

describe('makeKstTickFormatter', () => {
  // 2024-05-29 00:00 UTC = 2024-05-29 09:00 KST
  const sec = (Math.floor(BASE / 1000)) as never;

  it('48시간 미만이면 시:분(KST)으로 포맷한다', () => {
    const fmt = makeKstTickFormatter(3 * 3600 * 1000); // 3시간
    // 09:00 KST
    expect(fmt(sec)).toMatch(/09:00|9:00|오전/);
    // 콜론 포함(시:분) 확인
    expect(fmt(sec)).toContain(':');
  });

  it('48시간 이상 14일 미만이면 월/일 + 시로 포맷한다', () => {
    const fmt = makeKstTickFormatter(5 * 24 * 3600 * 1000); // 5일
    const out = fmt(sec);
    // 월/일 표기 포함(5월/29일 또는 5/29 형태)
    expect(out).toMatch(/5/);
    expect(out).toMatch(/29/);
  });

  it('14일 이상이면 월/일로 포맷한다(시 없음)', () => {
    const fmt = makeKstTickFormatter(30 * 24 * 3600 * 1000); // 30일
    const out = fmt(sec);
    expect(out).toMatch(/5/);
    expect(out).toMatch(/29/);
  });

  it('number가 아닌 time은 빈 문자열을 반환한다', () => {
    const fmt = makeKstTickFormatter(3 * 3600 * 1000);
    expect(fmt({ year: 2024, month: 5, day: 29 } as never)).toBe('');
  });
});

describe('findPointByTime', () => {
  const points: ComparisonPoint[] = [
    point(BASE + 0 * MIN, true),
    point(BASE + 1 * MIN, true),
    point(BASE + 2 * MIN, true),
  ];

  it('time(초)으로 원본 포인트를 역매핑한다', () => {
    const found = findPointByTime(points, Math.floor((BASE + 1 * MIN) / 1000));
    expect(found).not.toBeNull();
    expect(found!.timestamp).toBe(BASE + 1 * MIN);
  });

  it('존재하지 않는 time은 null을 반환한다', () => {
    expect(findPointByTime(points, Math.floor((BASE + 99 * MIN) / 1000))).toBeNull();
  });

  it('빈 입력은 null을 반환한다', () => {
    expect(findPointByTime([], 12345)).toBeNull();
  });
});
