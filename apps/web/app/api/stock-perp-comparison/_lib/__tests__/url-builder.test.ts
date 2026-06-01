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
  buildYahooRateUrl,
  buildYahooStockUrl,
  getFallbackInterval,
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

  it('1d/5d는 1m 분봉을 사용한다 (분봉 기본 정책)', () => {
    expect(resolveIntervalPlan('1d').interval).toBe('1m');
    expect(resolveIntervalPlan('5d').interval).toBe('1m');
  });

  it('1mo는 5m, 6mo/1y는 1d로 거칠어진다', () => {
    expect(resolveIntervalPlan('1mo').interval).toBe('5m');
    expect(resolveIntervalPlan('6mo').interval).toBe('1d');
    expect(resolveIntervalPlan('1y').interval).toBe('1d');
  });
});

describe('getFallbackInterval — 폴백 interval 전환 (R2.5/R8.3)', () => {
  it('1m 분봉 range(1d/5d)는 5m으로 폴백한다', () => {
    expect(getFallbackInterval('1d')).toBe('5m');
    expect(getFallbackInterval('5d')).toBe('5m');
  });

  it('1mo(5m)는 1d로 폴백한다', () => {
    expect(getFallbackInterval('1mo')).toBe('1d');
  });

  it('이미 1d인 range(6mo/1y)는 더 이상 폴백하지 않는다(null)', () => {
    expect(getFallbackInterval('6mo')).toBeNull();
    expect(getFallbackInterval('1y')).toBeNull();
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

describe('buildYahooStockUrl — 주식 URL (R2.1)', () => {
  it('range/interval 쿼리를 포함한 chart/{pair} URL을 만든다', () => {
    expect(buildYahooStockUrl('005930.KS', '5d', '1m')).toBe(
      'https://query1.finance.yahoo.com/v8/finance/chart/005930.KS?range=5d&interval=1m',
    );
  });

  it('폴백 interval을 그대로 반영한다', () => {
    expect(buildYahooStockUrl('000660.KS', '1d', '5m')).toBe(
      'https://query1.finance.yahoo.com/v8/finance/chart/000660.KS?range=1d&interval=5m',
    );
  });
});

describe('buildYahooRateUrl — 환율 URL (R4.1)', () => {
  it('KRW=X 심볼을 인코딩하고 interval은 1h로 고정한다', () => {
    expect(buildYahooRateUrl('1mo')).toBe(
      'https://query1.finance.yahoo.com/v8/finance/chart/KRW%3DX?range=1mo&interval=1h',
    );
  });

  it('candle interval과 무관하게 항상 1h를 사용한다', () => {
    for (const range of ALL_RANGES) {
      expect(buildYahooRateUrl(range)).toContain('interval=1h');
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
