/**
 * url-builder 단위 테스트 (R2.5, R8.2, R8.3, R8.4)
 *
 * range별 interval 선택, perp lookback(startTime/endTime) 계산,
 * 폴백 interval 전환 케이스를 검증한다.
 */

import { describe, expect, it } from 'vitest';
import { RANGE_TO_INTERVAL } from '@bitscope/shared';
import type { ComparisonRange } from '@bitscope/shared';
import {
  buildHyperliquidBody,
  buildHyperliquidUrl,
  buildFrankfurterRateUrl,
  buildNaverStockUrl,
  resolveIntervalPlan,
  resolvePerpWindow,
} from '../url-builder';

const ALL_RANGES: ComparisonRange[] = ['1d', '5d', '1mo', '6mo', '1y'];
const DAY_MS = 864e5;
const FIXED_NOW = 1_716_950_400_000; // 2024-05-29T00:00:00Z

describe('resolveIntervalPlan — range별 interval 선택 (R8.2/R8.4)', () => {
  it('각 range는 RANGE_TO_INTERVAL 매핑과 동일한 interval/fallback/lookback을 반환한다', () => {
    for (const range of ALL_RANGES) {
      const plan = resolveIntervalPlan(range);
      expect(plan).toEqual(RANGE_TO_INTERVAL[range]);
    }
  });

  it('1d/5d는 1m 분봉을 사용한다 (네이버 분봉)', () => {
    expect(resolveIntervalPlan('1d').interval).toBe('1m');
    expect(resolveIntervalPlan('5d').interval).toBe('1m');
  });

  it('1mo/6mo/1y는 일봉을 사용한다 (네이버는 5분봉 없음 → 일봉)', () => {
    expect(resolveIntervalPlan('1mo').interval).toBe('1d');
    expect(resolveIntervalPlan('6mo').interval).toBe('1d');
    expect(resolveIntervalPlan('1y').interval).toBe('1d');
  });

  it('네이버는 interval 폴백이 없으므로 fallbackInterval은 모두 null이다', () => {
    for (const range of ALL_RANGES) {
      expect(resolveIntervalPlan(range).fallbackInterval).toBeNull();
    }
  });
});

describe('resolvePerpWindow — perp lookback(startTime/endTime) 계산', () => {
  it('endTime은 now, startTime은 now - perpLookbackMs이다', () => {
    for (const range of ALL_RANGES) {
      const { startTime, endTime } = resolvePerpWindow(range, FIXED_NOW);
      expect(endTime).toBe(FIXED_NOW);
      expect(startTime).toBe(FIXED_NOW - RANGE_TO_INTERVAL[range].perpLookbackMs);
    }
  });

  it('range별 lookback 일수가 정확하다 (1d=1일 … 1y=365일)', () => {
    const expectedDays: Record<ComparisonRange, number> = {
      '1d': 1,
      '5d': 5,
      '1mo': 30,
      '6mo': 180,
      '1y': 365,
    };
    for (const range of ALL_RANGES) {
      const { startTime, endTime } = resolvePerpWindow(range, FIXED_NOW);
      expect(endTime - startTime).toBe(expectedDays[range] * DAY_MS);
    }
  });

  it('now 미주입 시 현재 시각 기준으로 window를 계산한다', () => {
    const before = Date.now();
    const { startTime, endTime } = resolvePerpWindow('5d');
    const after = Date.now();
    expect(endTime).toBeGreaterThanOrEqual(before);
    expect(endTime).toBeLessThanOrEqual(after);
    expect(endTime - startTime).toBe(5 * DAY_MS);
  });
});

describe('buildNaverStockUrl — 주식 URL (R2.1)', () => {
  it('1m이면 minute 엔드포인트 + KST startDateTime/endDateTime을 만든다', () => {
    // FIXED_NOW = 2024-05-29T02:40:00Z = KST 2024-05-29 11:40, 5d 전 = 2024-05-24 11:40 KST
    expect(buildNaverStockUrl('005930.KS', '1m', '5d', FIXED_NOW)).toBe(
      'https://api.stock.naver.com/chart/domestic/item/005930/minute?startDateTime=20240524114000&endDateTime=20240529114000',
    );
  });

  it("1d이면 day 엔드포인트를 사용하고 '.KS' 접미사를 제거한다", () => {
    const url = buildNaverStockUrl('000660.KS', '1d', '1mo', FIXED_NOW);
    expect(url).toContain('/chart/domestic/item/000660/day?');
    expect(url).toContain('startDateTime=');
    expect(url).toContain('endDateTime=20240529114000');
  });

  it('조회 구간은 range의 perpLookbackMs와 동일하다', () => {
    // 1y → 365일 전. 2024-05-29 - 365일 = 2023-05-30 (KST 09:00)
    const url = buildNaverStockUrl('005380.KS', '1d', '1y', FIXED_NOW);
    const expectedStart = new Date(FIXED_NOW - 365 * DAY_MS + 9 * 3600 * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    const stamp =
      `${expectedStart.getUTCFullYear()}${p(expectedStart.getUTCMonth() + 1)}${p(expectedStart.getUTCDate())}` +
      `${p(expectedStart.getUTCHours())}${p(expectedStart.getUTCMinutes())}${p(expectedStart.getUTCSeconds())}`;
    expect(url).toContain(`startDateTime=${stamp}`);
  });
});

describe('buildFrankfurterRateUrl — 환율 URL (R4.1)', () => {
  // range별 환율 조회 일수 (url-builder의 RANGE_TO_RATE_DAYS와 동일)
  const RATE_DAYS: Record<ComparisonRange, number> = {
    '1d': 7,
    '5d': 10,
    '1mo': 40,
    '6mo': 200,
    '1y': 380,
  };

  it('start..end 구간의 USD→KRW 일별 환율 URL을 만든다', () => {
    // FIXED_NOW = 2024-05-29T00:00:00Z, 1mo → 40일 전 = 2024-04-19
    expect(buildFrankfurterRateUrl('1mo', FIXED_NOW)).toBe(
      'https://api.frankfurter.dev/v1/2024-04-19..2024-05-29?base=USD&symbols=KRW',
    );
  });

  it('항상 base=USD&symbols=KRW를 포함한다', () => {
    for (const range of ALL_RANGES) {
      expect(buildFrankfurterRateUrl(range, FIXED_NOW)).toContain('base=USD&symbols=KRW');
    }
  });

  it('range별 조회 시작일이 RATE_DAYS만큼 과거이다', () => {
    for (const range of ALL_RANGES) {
      const url = buildFrankfurterRateUrl(range, FIXED_NOW);
      const expectedStart = new Date(FIXED_NOW - RATE_DAYS[range] * DAY_MS)
        .toISOString()
        .slice(0, 10);
      expect(url).toContain(`/v1/${expectedStart}..2024-05-29`);
    }
  });
});

describe('buildHyperliquidUrl — perp 엔드포인트 (R3.1)', () => {
  it('HYPERLIQUID_CONFIG.restBaseUrl + /info 를 사용한다', () => {
    expect(buildHyperliquidUrl()).toBe('https://api.hyperliquid.xyz/info');
  });
});

describe('buildHyperliquidBody — candleSnapshot body (R3.1/R3.4/R3.5)', () => {
  it('type/req(coin,interval,startTime,endTime)을 담는다', () => {
    const body = JSON.parse(buildHyperliquidBody('xyz:SMSN', '1m', '5d', FIXED_NOW));
    expect(body).toEqual({
      type: 'candleSnapshot',
      req: {
        coin: 'xyz:SMSN',
        interval: '1m',
        startTime: FIXED_NOW - 5 * DAY_MS,
        endTime: FIXED_NOW,
      },
    });
  });

  it('coin에 xyz: 접두사를 유지하고 dex 파라미터는 추가하지 않는다 (R3.4)', () => {
    const body = JSON.parse(buildHyperliquidBody('xyz:HYUNDAI', '1d', '1y', FIXED_NOW));
    expect(body.req.coin).toBe('xyz:HYUNDAI');
    expect(body.req).not.toHaveProperty('dex');
    expect(body).not.toHaveProperty('dex');
  });

  it('interval은 주식과 동일하게 정렬되어 전달된다 (R3.5)', () => {
    const body = JSON.parse(buildHyperliquidBody('xyz:SKHX', '5m', '1mo', FIXED_NOW));
    expect(body.req.interval).toBe('5m');
  });

  it('startTime은 range의 perpLookbackMs를 반영한다', () => {
    const body = JSON.parse(buildHyperliquidBody('xyz:SMSN', '1d', '1d', FIXED_NOW));
    expect(body.req.startTime).toBe(FIXED_NOW - 1 * DAY_MS);
    expect(body.req.endTime).toBe(FIXED_NOW);
  });
});
