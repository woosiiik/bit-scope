/**
 * normalizer 단위 테스트 (R2.2, R2.4, R3.2, R3.3, R5.1)
 *
 * 주식: timestamp ×1000, OHLCV null 값 보존(forward-fill 안 함), KRW/타임존/gmtoffset 기록
 * perp: 문자열 OHLCV → number, `t`(ms) 그대로 유지, USD 기록
 */

import { describe, expect, it } from 'vitest';
import {
  normalizeHyperliquidCandles,
  normalizeNaverCandles,
  normalizeFrankfurterRate,
} from '../normalizer';

// ===== 네이버 주식 캔들 =====

describe('normalizeNaverCandles — 분봉 (R2.2, R2.4, R5.1)', () => {
  it('localDateTime(KST)을 UTC ms로 변환하고 currentPrice를 close로 쓴다', () => {
    const raw = [
      {
        localDateTime: '20240529090000', // KST 09:00 = UTC 00:00
        openPrice: 81000,
        highPrice: 81200,
        lowPrice: 80900,
        currentPrice: 81100,
      },
      {
        localDateTime: '20240529090100', // KST 09:01 = UTC 00:01
        openPrice: 81100,
        highPrice: 81300,
        lowPrice: 81000,
        currentPrice: 81200,
      },
    ];

    const { candles } = normalizeNaverCandles(raw, '1m');

    expect(candles[0]!.timestamp).toBe(Date.UTC(2024, 4, 29, 0, 0, 0));
    expect(candles[0]!.close).toBe(81100);
    expect(candles[1]!.timestamp).toBe(Date.UTC(2024, 4, 29, 0, 1, 0));
    expect(candles[1]!.close).toBe(81200);
  });

  it('유한수가 아닌 OHLC는 null로 보존한다 (forward-fill 금지, R2.4)', () => {
    const raw = [
      {
        localDateTime: '20240529090000',
        openPrice: null,
        highPrice: null,
        lowPrice: null,
        currentPrice: null,
      },
    ];
    const { candles } = normalizeNaverCandles(raw, '1m');
    expect(candles[0]!.open).toBeNull();
    expect(candles[0]!.close).toBeNull();
  });
});

describe('normalizeNaverCandles — 일봉 (R5.1)', () => {
  it('localDate(KST 거래일)을 해당 날짜 UTC 자정으로 매핑하고 closePrice를 close로 쓴다', () => {
    const raw = [
      { localDate: '20240528', openPrice: 80000, highPrice: 81000, lowPrice: 79500, closePrice: 80500 },
      { localDate: '20240529', openPrice: 80500, highPrice: 82000, lowPrice: 80000, closePrice: 81100 },
    ];

    const { candles } = normalizeNaverCandles(raw, '1d');

    expect(candles[0]!.timestamp).toBe(Date.UTC(2024, 4, 28));
    expect(candles[0]!.close).toBe(80500);
    expect(candles[1]!.timestamp).toBe(Date.UTC(2024, 4, 29));
    expect(candles[1]!.close).toBe(81100);
  });
});

describe('normalizeNaverCandles — 메타/빈 입력', () => {
  it('메타는 KRW/Asia/Seoul/+9h 고정, regularMarketPrice는 최근 종가', () => {
    const raw = [
      { localDate: '20240528', closePrice: 80500 },
      { localDate: '20240529', closePrice: 81100 },
    ];
    const { meta } = normalizeNaverCandles(raw, '1d');
    expect(meta.currency).toBe('KRW');
    expect(meta.exchangeTimezoneName).toBe('Asia/Seoul');
    expect(meta.gmtoffset).toBe(32400);
    expect(meta.regularMarketPrice).toBe(81100);
  });

  it('빈/비배열 입력에 대해 빈 캔들과 기본 메타(regularMarketPrice=null)를 반환한다', () => {
    const r1 = normalizeNaverCandles([], '1m');
    expect(r1.candles).toEqual([]);
    expect(r1.meta.regularMarketPrice).toBeNull();
    expect(normalizeNaverCandles(null, '1d').candles).toEqual([]);
    expect(normalizeNaverCandles({}, '1m').candles).toEqual([]);
  });
});

// ===== frankfurter 환율 =====

describe('normalizeFrankfurterRate (R4.1)', () => {
  it('일별 rates를 RatePoint[](UTC 자정 ms)로 변환한다', () => {
    const raw = {
      amount: 1,
      base: 'USD',
      start_date: '2024-05-27',
      end_date: '2024-05-29',
      rates: {
        '2024-05-27': { KRW: 1383.2 },
        '2024-05-28': { KRW: 1384.0 },
        '2024-05-29': { KRW: 1384.1 },
      },
    };

    const points = normalizeFrankfurterRate(raw);

    expect(points).toHaveLength(3);
    expect(points).toContainEqual({ timestamp: Date.parse('2024-05-27T00:00:00Z'), rate: 1383.2 });
    expect(points).toContainEqual({ timestamp: Date.parse('2024-05-29T00:00:00Z'), rate: 1384.1 });
  });

  it('KRW 값이 없거나 유한수가 아닌 날짜는 건너뛴다', () => {
    const raw = {
      base: 'USD',
      rates: {
        '2024-05-27': { KRW: 1383.2 },
        '2024-05-28': {}, // KRW 누락
        '2024-05-29': { KRW: 1384.1 },
      },
    };

    const points = normalizeFrankfurterRate(raw);
    expect(points).toHaveLength(2);
  });

  it('빈/누락 응답에 대해 빈 배열을 반환한다', () => {
    expect(normalizeFrankfurterRate({})).toEqual([]);
    expect(normalizeFrankfurterRate({ rates: {} })).toEqual([]);
    expect(normalizeFrankfurterRate(null)).toEqual([]);
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
