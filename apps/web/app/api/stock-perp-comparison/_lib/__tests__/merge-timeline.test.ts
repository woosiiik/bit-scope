import { describe, it, expect } from 'vitest';
import type { NormalizedCandle, RatePoint } from '@bitscope/shared';
import { mergeTimeline, intervalToMs, isWithinKrxSession } from '../merge-timeline';

/**
 * merge-timeline 단위 테스트 (R4.2, R5.3, R5.5, R6.2, R7.1)
 *
 * 검증 케이스:
 * - 동일 버킷 매핑(같은 버킷의 주식/perp가 한 포인트로)
 * - 한쪽 결측 시 null 유지(forward-fill 금지)
 * - timestamp 오름차순 정렬
 * - marketOpen / stockGap 도출
 * - 통화 변환: perpKRW = perpUSD × rate
 * - 환율 결측 시 perpPrice null(perpPriceRaw는 보존)
 */

const MIN = 60_000;

// 버킷 정렬용 기준 시각. 2024-05-29(수) 02:00 UTC = 11:00 KST(정규장 내).
const BASE = Date.UTC(2024, 4, 29, 2, 0, 0); // 1716948000000

/** 단일 close 캔들 헬퍼. */
function candle(timestamp: number, close: number | null): NormalizedCandle {
  return { timestamp, open: close, high: close, low: close, close };
}

describe('intervalToMs', () => {
  it('각 interval을 ms로 변환한다', () => {
    expect(intervalToMs('1m')).toBe(60_000);
    expect(intervalToMs('5m')).toBe(5 * 60_000);
    expect(intervalToMs('15m')).toBe(15 * 60_000);
    expect(intervalToMs('1d')).toBe(86_400_000);
  });
});

describe('isWithinKrxSession', () => {
  it('평일 정규장(09:00–15:30 KST) 안이면 true', () => {
    // 02:00 UTC = 11:00 KST (수요일)
    expect(isWithinKrxSession(Date.UTC(2024, 4, 29, 2, 0, 0))).toBe(true);
    // 00:00 UTC = 09:00 KST (개장 경계)
    expect(isWithinKrxSession(Date.UTC(2024, 4, 29, 0, 0, 0))).toBe(true);
    // 06:30 UTC = 15:30 KST (마감 경계)
    expect(isWithinKrxSession(Date.UTC(2024, 4, 29, 6, 30, 0))).toBe(true);
  });

  it('평일이라도 장 시간 밖이면 false', () => {
    // 20:00 UTC = 익일 05:00 KST (개장 전)
    expect(isWithinKrxSession(Date.UTC(2024, 4, 29, 20, 0, 0))).toBe(false);
    // 07:00 UTC = 16:00 KST (마감 후)
    expect(isWithinKrxSession(Date.UTC(2024, 4, 29, 7, 0, 0))).toBe(false);
  });

  it('주말은 false', () => {
    // 2024-06-01(토) 02:00 UTC = 11:00 KST
    expect(isWithinKrxSession(Date.UTC(2024, 5, 1, 2, 0, 0))).toBe(false);
    // 2024-06-02(일) 02:00 UTC = 11:00 KST
    expect(isWithinKrxSession(Date.UTC(2024, 5, 2, 2, 0, 0))).toBe(false);
  });
});

describe('mergeTimeline', () => {
  const rate: RatePoint[] = [{ timestamp: 0, rate: 1000 }];

  it('같은 버킷의 주식/perp를 한 포인트로 매핑한다', () => {
    const stock: NormalizedCandle[] = [candle(BASE + 10_000, 81500)];
    const perp: NormalizedCandle[] = [candle(BASE + 50_000, 58)];

    const points = mergeTimeline(stock, perp, rate, MIN);
    expect(points).toHaveLength(1);
    const p = points[0];
    expect(p?.timestamp).toBe(BASE);
    expect(p?.stockPrice).toBe(81500);
    expect(p?.perpPriceRaw).toBe(58);
  });

  it('한쪽이 결측인 버킷은 null로 유지한다(forward-fill 금지)', () => {
    // 버킷0: 주식만, 버킷1: perp만.
    const stock: NormalizedCandle[] = [candle(BASE, 81500)];
    const perp: NormalizedCandle[] = [candle(BASE + MIN, 58)];

    const points = mergeTimeline(stock, perp, rate, MIN);
    expect(points).toHaveLength(2);

    const b0 = points[0];
    expect(b0?.stockPrice).toBe(81500);
    expect(b0?.perpPriceRaw).toBeNull();
    expect(b0?.perpPrice).toBeNull();

    const b1 = points[1];
    expect(b1?.stockPrice).toBeNull();
    expect(b1?.perpPriceRaw).toBe(58);
  });

  it('null close 캔들은 채워 넣지 않는다', () => {
    const stock: NormalizedCandle[] = [candle(BASE, null)];
    const perp: NormalizedCandle[] = [candle(BASE, 58)];

    const points = mergeTimeline(stock, perp, rate, MIN);
    expect(points).toHaveLength(1);
    expect(points[0]?.stockPrice).toBeNull();
    expect(points[0]?.perpPriceRaw).toBe(58);
  });

  it('timestamp 오름차순으로 정렬한다', () => {
    const stock: NormalizedCandle[] = [
      candle(BASE + 3 * MIN, 3),
      candle(BASE, 1),
      candle(BASE + 2 * MIN, 2),
    ];
    const points = mergeTimeline(stock, [], rate, MIN);
    const timestamps = points.map((p) => p.timestamp);
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
    expect(timestamps).toEqual([BASE, BASE + 2 * MIN, BASE + 3 * MIN]);
  });

  it('통화 변환: perpPrice = perpPriceRaw × rate (baseCurrency=KRW)', () => {
    const perp: NormalizedCandle[] = [candle(BASE, 58)];
    const rates: RatePoint[] = [{ timestamp: 0, rate: 1383.2 }];

    const points = mergeTimeline([], perp, rates, MIN);
    expect(points[0]?.appliedRate).toBe(1383.2);
    expect(points[0]?.perpPrice).toBeCloseTo(58 * 1383.2, 6);
    expect(points[0]?.perpPriceRaw).toBe(58);
  });

  it('환율이 없으면 appliedRate/perpPrice는 null이고 perpPriceRaw는 보존된다', () => {
    const perp: NormalizedCandle[] = [candle(BASE, 58)];
    const points = mergeTimeline([], perp, [], MIN);
    expect(points[0]?.appliedRate).toBeNull();
    expect(points[0]?.perpPrice).toBeNull();
    expect(points[0]?.perpPriceRaw).toBe(58); // raw는 유지
  });

  it('marketOpen: 주식 close 존재 시 true', () => {
    // 야간 시각(KRX 세션 밖)이라도 주식 데이터가 있으면 개장으로 본다.
    const night = Date.UTC(2024, 4, 29, 20, 0, 0); // 05:00 KST
    const stock: NormalizedCandle[] = [candle(night, 81500)];
    const points = mergeTimeline(stock, [], rate, MIN);
    expect(points[0]?.marketOpen).toBe(true);
  });

  it('marketOpen: 주식 결측이라도 KRX 세션 안이면 보조 판정으로 true', () => {
    // perp만 있고 주식은 결측이지만 11:00 KST(세션 내).
    const perp: NormalizedCandle[] = [candle(BASE, 58)];
    const points = mergeTimeline([], perp, rate, MIN);
    expect(points[0]?.marketOpen).toBe(true);
  });

  it('marketOpen: 주식 결측 + 세션 밖이면 false', () => {
    const night = Date.UTC(2024, 4, 29, 20, 0, 0); // 05:00 KST
    const perp: NormalizedCandle[] = [candle(night, 58)];
    const points = mergeTimeline([], perp, rate, MIN);
    expect(points[0]?.marketOpen).toBe(false);
  });

  it('stockGap: 직전 버킷에 주식 존재 → 현재 버킷 주식 결측이면 갭 시작점 true', () => {
    // 버킷0: 주식+perp, 버킷1: perp만(주식 결측 시작) → stockGap=true.
    const stock: NormalizedCandle[] = [candle(BASE, 81500)];
    const perp: NormalizedCandle[] = [candle(BASE, 58), candle(BASE + MIN, 59)];

    const points = mergeTimeline(stock, perp, rate, MIN);
    expect(points).toHaveLength(2);
    expect(points[0]?.stockGap).toBe(false); // 첫 포인트는 갭 시작 아님
    expect(points[1]?.stockGap).toBe(true); // 주식 결측 시작점
  });

  it('stockGap: 연속 결측 버킷에서 첫 버킷만 갭 시작점', () => {
    const stock: NormalizedCandle[] = [candle(BASE, 81500)];
    const perp: NormalizedCandle[] = [
      candle(BASE, 58),
      candle(BASE + MIN, 59),
      candle(BASE + 2 * MIN, 60),
    ];
    const points = mergeTimeline(stock, perp, rate, MIN);
    expect(points[1]?.stockGap).toBe(true); // 결측 시작
    expect(points[2]?.stockGap).toBe(false); // 이미 결측 중 → 시작점 아님
  });
});
