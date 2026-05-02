import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  formatKRW,
  formatUSD,
  formatCurrency,
  formatPercent,
  formatCoinPrice,
  formatQuantity,
  formatCompactKRW,
  formatVolume,
} from './format';

describe('formatNumber', () => {
  it('정수에 천 단위 구분 기호를 적용한다', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(1000)).toBe('1,000');
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(0)).toBe('0');
  });

  it('소수점 자릿수를 지정할 수 있다', () => {
    expect(formatNumber(1234567.89, 2)).toBe('1,234,567.89');
    expect(formatNumber(1000, 3)).toBe('1,000.000');
    expect(formatNumber(0, 2)).toBe('0.00');
  });

  it('음수를 올바르게 처리한다', () => {
    expect(formatNumber(-1234567)).toBe('-1,234,567');
    expect(formatNumber(-1234.56, 2)).toBe('-1,234.56');
  });

  it('NaN, Infinity를 "0"으로 반환한다', () => {
    expect(formatNumber(NaN)).toBe('0');
    expect(formatNumber(Infinity)).toBe('0');
    expect(formatNumber(-Infinity)).toBe('0');
  });

  it('소수점 자릿수 0일 때 소수 부분이 없다', () => {
    expect(formatNumber(1234.56, 0)).toBe('1,235');
  });
});

describe('formatKRW', () => {
  it('KRW 통화 기호로 포맷팅한다', () => {
    expect(formatKRW(1234567)).toBe('₩1,234,567');
    expect(formatKRW(0)).toBe('₩0');
  });

  it('음수 금액을 올바르게 표시한다', () => {
    expect(formatKRW(-500000)).toBe('-₩500,000');
  });

  it('showSign 옵션으로 양수에 + 기호를 표시한다', () => {
    expect(formatKRW(1234567, { showSign: true })).toBe('+₩1,234,567');
    expect(formatKRW(-500000, { showSign: true })).toBe('-₩500,000');
    expect(formatKRW(0, { showSign: true })).toBe('₩0');
  });

  it('NaN, Infinity를 "₩0"으로 반환한다', () => {
    expect(formatKRW(NaN)).toBe('₩0');
    expect(formatKRW(Infinity)).toBe('₩0');
  });
});

describe('formatUSD', () => {
  it('USD 통화 기호로 포맷팅한다', () => {
    expect(formatUSD(1234.56)).toBe('$1,234.56');
    expect(formatUSD(0)).toBe('$0.00');
  });

  it('음수 금액을 올바르게 표시한다', () => {
    expect(formatUSD(-500.12)).toBe('-$500.12');
  });

  it('showSign 옵션으로 양수에 + 기호를 표시한다', () => {
    expect(formatUSD(1234.56, { showSign: true })).toBe('+$1,234.56');
    expect(formatUSD(-500.12, { showSign: true })).toBe('-$500.12');
    expect(formatUSD(0, { showSign: true })).toBe('$0.00');
  });

  it('NaN, Infinity를 "$0.00"으로 반환한다', () => {
    expect(formatUSD(NaN)).toBe('$0.00');
  });
});

describe('formatCurrency', () => {
  it('KRW 통화를 올바르게 포맷팅한다', () => {
    expect(formatCurrency(1234567, 'KRW')).toBe('₩1,234,567');
  });

  it('USD 통화를 올바르게 포맷팅한다', () => {
    expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56');
  });

  it('기본 통화는 KRW이다', () => {
    expect(formatCurrency(1234567)).toBe('₩1,234,567');
  });
});

describe('formatPercent', () => {
  it('양수 수익률에 + 기호를 붙인다', () => {
    expect(formatPercent(12.345)).toBe('+12.35%');
  });

  it('음수 수익률에 - 기호를 붙인다', () => {
    expect(formatPercent(-5.678)).toBe('-5.68%');
  });

  it('0%를 올바르게 표시한다', () => {
    expect(formatPercent(0)).toBe('0.00%');
  });

  it('소수점 자릿수를 지정할 수 있다', () => {
    expect(formatPercent(12.3456, { decimalPlaces: 3 })).toBe('+12.346%');
    expect(formatPercent(12.3, { decimalPlaces: 0 })).toBe('+12%');
  });

  it('showSign: false 옵션으로 + 기호를 생략한다', () => {
    expect(formatPercent(12.345, { showSign: false })).toBe('12.35%');
    expect(formatPercent(-5.678, { showSign: false })).toBe('-5.68%');
  });

  it('NaN, Infinity를 "0.00%"으로 반환한다', () => {
    expect(formatPercent(NaN)).toBe('0.00%');
    expect(formatPercent(Infinity)).toBe('0.00%');
  });
});

describe('formatCoinPrice', () => {
  it('BTC 가격을 소수점 없이 표시한다', () => {
    expect(formatCoinPrice(98765432, 'BTC')).toBe('98,765,432');
  });

  it('XRP 가격을 소수점 2자리로 표시한다', () => {
    expect(formatCoinPrice(3.45, 'XRP')).toBe('3.45');
  });

  it('알 수 없는 코인에 기본 소수점을 적용한다', () => {
    expect(formatCoinPrice(123.456, 'UNKNOWN')).toBe('123.46');
  });

  it('심볼을 지정하지 않으면 기본 소수점을 적용한다', () => {
    expect(formatCoinPrice(123.456)).toBe('123.46');
  });
});

describe('formatQuantity', () => {
  it('소수점 이하가 있는 수량을 표시한다', () => {
    expect(formatQuantity(1.23456789)).toBe('1.23456789');
  });

  it('후행 0을 제거한다', () => {
    expect(formatQuantity(100)).toBe('100');
    expect(formatQuantity(1.5)).toBe('1.5');
  });

  it('작은 수량을 올바르게 표시한다', () => {
    expect(formatQuantity(0.001)).toBe('0.001');
    expect(formatQuantity(0.00000001)).toBe('0.00000001');
  });

  it('큰 정수에 천 단위 구분을 적용한다', () => {
    expect(formatQuantity(1234)).toBe('1,234');
  });

  it('NaN, Infinity를 "0"으로 반환한다', () => {
    expect(formatQuantity(NaN)).toBe('0');
    expect(formatQuantity(Infinity)).toBe('0');
  });
});

describe('formatCompactKRW', () => {
  it('조 단위를 축약한다', () => {
    expect(formatCompactKRW(1_500_000_000_000)).toBe('1.50조');
    expect(formatCompactKRW(15_000_000_000_000)).toBe('15.0조');
  });

  it('억 단위를 축약한다', () => {
    expect(formatCompactKRW(123_456_789)).toBe('1.23억');
    expect(formatCompactKRW(12_345_678_900)).toBe('123.5억');
  });

  it('만 단위를 축약한다', () => {
    expect(formatCompactKRW(5_000_000)).toBe('500만');
    expect(formatCompactKRW(50_000)).toBe('5만');
  });

  it('만 미만은 일반 포맷을 사용한다', () => {
    expect(formatCompactKRW(9999)).toBe('9,999');
    expect(formatCompactKRW(0)).toBe('0');
  });

  it('음수를 올바르게 처리한다', () => {
    expect(formatCompactKRW(-123_456_789)).toBe('-1.23억');
    expect(formatCompactKRW(-5_000_000)).toBe('-500만');
  });

  it('NaN을 "0"으로 반환한다', () => {
    expect(formatCompactKRW(NaN)).toBe('0');
  });
});

describe('formatVolume', () => {
  it('B(Billion) 단위를 축약한다', () => {
    expect(formatVolume(1_234_567_890)).toBe('1.23B');
  });

  it('M(Million) 단위를 축약한다', () => {
    expect(formatVolume(1_234_567)).toBe('1.23M');
  });

  it('K(Thousand) 단위를 축약한다', () => {
    expect(formatVolume(1_234)).toBe('1.23K');
  });

  it('1000 미만은 소수점 2자리로 표시한다', () => {
    expect(formatVolume(123)).toBe('123.00');
    expect(formatVolume(0)).toBe('0.00');
  });

  it('NaN을 "0"으로 반환한다', () => {
    expect(formatVolume(NaN)).toBe('0');
  });

  it('음수를 올바르게 처리한다', () => {
    expect(formatVolume(-1_234_567)).toBe('-1.23M');
  });
});
