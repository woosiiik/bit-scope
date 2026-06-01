/**
 * normalizer 단위 테스트 (R2.2, R2.4, R3.2, R3.3, R5.1)
 *
 * 주식: timestamp ×1000, OHLCV null 값 보존(forward-fill 안 함), KRW/타임존/gmtoffset 기록
 * perp: 문자열 OHLCV → number, `t`(ms) 그대로 유지, USD 기록
 */

import { describe, expect, it } from 'vitest';
import {
  normalizeHyperliquidCandles,
  normalizeYahooCandles,
  normalizeYahooRate,
} from '../normalizer';

// ===== Yahoo 주식 캔들 =====

describe('normalizeYahooCandles (R2.2, R2.4, R5.1)', () => {
  function buildYahoo(opts: {
    timestamps: number[];
    open: Array<number | null>;
    high: Array<number | null>;
    low: Array<number | null>;
    close: Array<number | null>;
    meta?: Record<string, unknown>;
  }) {
    return {
      chart: {
        result: [
          {
            timestamp: opts.timestamps,
            indicators: {
              quote: [
                {
                  open: opts.open,
                  high: opts.high,
                  low: opts.low,
                  close: opts.close,
                },
              ],
            },
            meta: opts.meta ?? {
              currency: 'KRW',
              exchangeTimezoneName: 'Asia/Seoul',
              gmtoffset: 32400,
              regularMarketPrice: 81500,
            },
          },
        ],
      },
    };
  }

  it('timestamp를 epoch seconds에서 ms로 ×1000 변환한다', () => {
    const raw = buildYahoo({
      timestamps: [1716950400, 1716950460],
      open: [81000, 81100],
      high: [81200, 81300],
      low: [80900, 81000],
      close: [81100, 81200],
    });

    const { candles } = normalizeYahooCandles(raw);

    expect(candles[0]!.timestamp).toBe(1716950400 * 1000);
    expect(candles[1]!.timestamp).toBe(1716950460 * 1000);
  });

  it('OHLCV null 값을 보존하고 forward-fill 하지 않는다 (R2.4)', () => {
    const raw = buildYahoo({
      timestamps: [1716950400, 1716950460, 1716950520],
      // 가운데 캔들이 휴장/거래없음으로 전부 null
      open: [81000, null, 82000],
      high: [81200, null, 82200],
      low: [80900, null, 81900],
      close: [81100, null, 82100],
    });

    const { candles } = normalizeYahooCandles(raw);

    // 결측 지점은 직전 값(81100 등)으로 채우지 않고 null로 유지되어야 한다
    expect(candles[1]!.open).toBeNull();
    expect(candles[1]!.high).toBeNull();
    expect(candles[1]!.low).toBeNull();
    expect(candles[1]!.close).toBeNull();

    // 앞뒤 정상 값은 그대로
    expect(candles[0]!.close).toBe(81100);
    expect(candles[2]!.close).toBe(82100);
  });

  it('meta에 currency=KRW, timezone=Asia/Seoul, gmtoffset, regularMarketPrice를 기록한다 (R2.3)', () => {
    const raw = buildYahoo({
      timestamps: [1716950400],
      open: [81000],
      high: [81200],
      low: [80900],
      close: [81100],
      meta: {
        currency: 'KRW',
        exchangeTimezoneName: 'Asia/Seoul',
        gmtoffset: 32400,
        regularMarketPrice: 81500,
      },
    });

    const { meta } = normalizeYahooCandles(raw);

    expect(meta.currency).toBe('KRW');
    expect(meta.exchangeTimezoneName).toBe('Asia/Seoul');
    expect(meta.gmtoffset).toBe(32400);
    expect(meta.regularMarketPrice).toBe(81500);
  });

  it('빈/누락 응답에 대해 빈 캔들 배열과 기본 메타를 반환한다', () => {
    const { candles, meta } = normalizeYahooCandles({});
    expect(candles).toEqual([]);
    expect(meta.currency).toBe('KRW');
    expect(meta.exchangeTimezoneName).toBe('Asia/Seoul');
    expect(meta.regularMarketPrice).toBeNull();
  });
});

// ===== Yahoo 환율 =====

describe('normalizeYahooRate (R4.1)', () => {
  it('KRW=X 응답을 RatePoint[]로 변환하고 null close를 제거한다', () => {
    const raw = {
      chart: {
        result: [
          {
            timestamp: [1716950400, 1716954000, 1716957600],
            indicators: {
              quote: [{ close: [1383.2, null, 1384.1] }],
            },
            meta: { currency: 'KRW=X' },
          },
        ],
      },
    };

    const points = normalizeYahooRate(raw);

    // null close 포인트(가운데)는 제거
    expect(points).toHaveLength(2);
    expect(points[0]).toEqual({ timestamp: 1716950400 * 1000, rate: 1383.2 });
    expect(points[1]).toEqual({ timestamp: 1716957600 * 1000, rate: 1384.1 });
  });

  it('빈 응답에 대해 빈 배열을 반환한다', () => {
    expect(normalizeYahooRate({})).toEqual([]);
  });
});

// ===== Hyperliquid perp 캔들 =====

describe('normalizeHyperliquidCandles (R3.2, R3.3, R5.2)', () => {
  it('문자열 OHLCV를 number로 변환한다 (R3.2)', () => {
    const raw = [
      { t: 1716950400000, T: 1716950459999, s: 'xyz:SMSN', i: '1m', o: '58.7', c: '58.9', h: '59.0', l: '58.6', v: '120.5', n: 42 },
    ];

    const candles = normalizeHyperliquidCandles(raw);

    expect(candles[0]!.open).toBe(58.7);
    expect(candles[0]!.close).toBe(58.9);
    expect(candles[0]!.high).toBe(59.0);
    expect(candles[0]!.low).toBe(58.6);
    expect(typeof candles[0]!.open).toBe('number');
    expect(typeof candles[0]!.close).toBe('number');
  });

  it('`t`(epoch ms)를 변환 없이 그대로 유지한다 (R5.2)', () => {
    const raw = [
      { t: 1716950400000, o: '58.7', c: '58.9', h: '59.0', l: '58.6', v: '1', n: 1 },
      { t: 1716950460000, o: '58.9', c: '59.1', h: '59.2', l: '58.8', v: '1', n: 1 },
    ];

    const candles = normalizeHyperliquidCandles(raw);

    expect(candles[0]!.timestamp).toBe(1716950400000);
    expect(candles[1]!.timestamp).toBe(1716950460000);
  });

  it('배열이 아닌 입력에 대해 빈 배열을 반환한다', () => {
    expect(normalizeHyperliquidCandles(null)).toEqual([]);
    expect(normalizeHyperliquidCandles(undefined)).toEqual([]);
    expect(normalizeHyperliquidCandles({})).toEqual([]);
  });
});
