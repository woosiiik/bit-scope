/**
 * 숫자/통화 포맷 유틸리티 함수
 *
 * 천 단위 구분, 소수점, KRW/USD 통화 포맷, 수익률 포맷 등을 제공한다.
 * 요구사항 9.7 (숫자 데이터 포맷), NF5.2 (통화 표시 확장성)에 대응한다.
 */

import {
  DEFAULT_DECIMAL_PLACES,
  RATE_DECIMAL_PLACES,
  QUANTITY_DECIMAL_PLACES,
  COIN_DECIMAL_PLACES,
} from '../constants/symbols';

/** 통화 유형 */
export type CurrencyCode = 'KRW' | 'USD';

/**
 * 숫자에 천 단위 구분 기호를 적용하여 포맷팅한다.
 *
 * @param value - 포맷할 숫자
 * @param decimalPlaces - 소수점 자릿수 (기본값: 0)
 * @returns 천 단위 구분이 적용된 문자열
 *
 * @example
 * formatNumber(1234567) // "1,234,567"
 * formatNumber(1234567.89, 2) // "1,234,567.89"
 * formatNumber(-1234567) // "-1,234,567"
 */
export function formatNumber(value: number, decimalPlaces: number = 0): string {
  if (!Number.isFinite(value)) {
    return '0';
  }

  const fixed = value.toFixed(decimalPlaces);
  const [integerPart, decimalPart] = fixed.split('.');

  // 음수 부호 분리 후 천 단위 구분 적용
  const isNegative = integerPart!.startsWith('-');
  const absInteger = isNegative ? integerPart!.slice(1) : integerPart!;
  const formatted = absInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const sign = isNegative ? '-' : '';
  if (decimalPart !== undefined) {
    return `${sign}${formatted}.${decimalPart}`;
  }
  return `${sign}${formatted}`;
}

/**
 * 금액을 KRW 통화 포맷으로 변환한다.
 *
 * @param value - 포맷할 금액
 * @param options - 포맷 옵션
 * @returns KRW 통화 포맷 문자열
 *
 * @example
 * formatKRW(1234567) // "₩1,234,567"
 * formatKRW(1234567, { showSign: true }) // "+₩1,234,567"
 * formatKRW(-500000) // "-₩500,000"
 */
export function formatKRW(
  value: number,
  options: { showSign?: boolean } = {},
): string {
  const { showSign = false } = options;

  if (!Number.isFinite(value)) {
    return '₩0';
  }

  const absValue = Math.abs(value);
  const formatted = formatNumber(absValue, 0);

  if (value < 0) {
    return `-₩${formatted}`;
  }
  if (value > 0 && showSign) {
    return `+₩${formatted}`;
  }
  return `₩${formatted}`;
}

/**
 * 금액을 USD 통화 포맷으로 변환한다.
 *
 * @param value - 포맷할 금액
 * @param options - 포맷 옵션
 * @returns USD 통화 포맷 문자열
 *
 * @example
 * formatUSD(1234.56) // "$1,234.56"
 * formatUSD(-500.12) // "-$500.12"
 */
export function formatUSD(
  value: number,
  options: { showSign?: boolean } = {},
): string {
  const { showSign = false } = options;

  if (!Number.isFinite(value)) {
    return '$0.00';
  }

  const absValue = Math.abs(value);
  const formatted = formatNumber(absValue, 2);

  if (value < 0) {
    return `-$${formatted}`;
  }
  if (value > 0 && showSign) {
    return `+$${formatted}`;
  }
  return `$${formatted}`;
}

/**
 * 통화 코드에 따라 금액을 포맷팅한다.
 *
 * @param value - 포맷할 금액
 * @param currency - 통화 코드
 * @param options - 포맷 옵션
 * @returns 통화 포맷 문자열
 */
export function formatCurrency(
  value: number,
  currency: CurrencyCode = 'KRW',
  options: { showSign?: boolean } = {},
): string {
  switch (currency) {
    case 'KRW':
      return formatKRW(value, options);
    case 'USD':
      return formatUSD(value, options);
    default:
      return formatNumber(value, DEFAULT_DECIMAL_PLACES);
  }
}

/**
 * 수익률(%)을 포맷팅한다.
 *
 * @param rate - 수익률 (%)
 * @param options - 포맷 옵션
 * @returns 수익률 포맷 문자열
 *
 * @example
 * formatPercent(12.345) // "+12.35%"
 * formatPercent(-5.678) // "-5.68%"
 * formatPercent(0) // "0.00%"
 */
export function formatPercent(
  rate: number,
  options: { decimalPlaces?: number; showSign?: boolean } = {},
): string {
  const { decimalPlaces = RATE_DECIMAL_PLACES, showSign = true } = options;

  if (!Number.isFinite(rate)) {
    return '0.00%';
  }

  const fixed = Math.abs(rate).toFixed(decimalPlaces);

  if (rate > 0 && showSign) {
    return `+${fixed}%`;
  }
  if (rate < 0) {
    return `-${fixed}%`;
  }
  return `${fixed}%`;
}

/**
 * 코인 가격을 적절한 소수점으로 포맷팅한다.
 *
 * 코인별로 정의된 소수점 자릿수(COIN_DECIMAL_PLACES)를 사용하거나,
 * 정의되지 않은 경우 기본값(DEFAULT_DECIMAL_PLACES)을 사용한다.
 *
 * @param price - 가격
 * @param symbol - 코인 심볼 (예: "BTC")
 * @returns 포맷된 가격 문자열
 *
 * @example
 * formatCoinPrice(98765432, "BTC") // "98,765,432"
 * formatCoinPrice(3.45, "XRP") // "3.45"
 */
export function formatCoinPrice(price: number, symbol?: string): string {
  // 코인별 명시 설정이 있으면 우선 사용.
  if (symbol && symbol in COIN_DECIMAL_PLACES) {
    return formatNumber(price, COIN_DECIMAL_PLACES[symbol]!);
  }

  // 명시 설정이 없으면 가격 크기에 따라 소수점 자릿수를 적응적으로 결정한다.
  // 1원 미만 코인(SHIB·PEPE 등 밈코인)이 "0.00"으로 뭉개지지 않도록 하기 위함이며,
  // 1 이상 값은 기존과 동일하게 DEFAULT_DECIMAL_PLACES(2)를 유지한다.
  return formatNumber(price, adaptiveDecimalPlaces(price));
}

/**
 * 명시적 소수점 설정이 없는 코인의 가격 크기별 소수점 자릿수를 결정한다.
 *
 * 1 이상이면 기본 자릿수(2)를 유지하고, 1 미만일수록 자릿수를 늘려
 * 작은 단가의 코인이 0으로 반올림되지 않게 한다.
 */
function adaptiveDecimalPlaces(price: number): number {
  const abs = Math.abs(price);
  if (abs === 0 || abs >= 1) return DEFAULT_DECIMAL_PLACES;
  if (abs >= 0.01) return 4;
  if (abs >= 0.0001) return 6;
  return 8;
}

/**
 * 코인 수량을 포맷팅한다.
 *
 * 불필요한 후행 0을 제거하여 표시한다.
 *
 * @param quantity - 보유 수량
 * @returns 포맷된 수량 문자열
 *
 * @example
 * formatQuantity(1.23456789) // "1.23456789"
 * formatQuantity(100) // "100"
 * formatQuantity(0.001) // "0.001"
 */
export function formatQuantity(quantity: number): string {
  if (!Number.isFinite(quantity)) {
    return '0';
  }

  // 최대 소수점 자릿수로 고정 후 후행 0 제거
  const fixed = quantity.toFixed(QUANTITY_DECIMAL_PLACES);
  const trimmed = fixed.replace(/\.?0+$/, '');

  // 정수부에 천 단위 구분 적용
  const [integerPart, decimalPart] = trimmed.split('.');
  const formatted = integerPart!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  if (decimalPart !== undefined) {
    return `${formatted}.${decimalPart}`;
  }
  return formatted;
}

/**
 * 큰 금액을 축약하여 표시한다 (예: 1.2억, 3.5조).
 *
 * @param value - 금액 (KRW)
 * @returns 축약된 금액 문자열
 *
 * @example
 * formatCompactKRW(1500000000000) // "1.5조"
 * formatCompactKRW(123456789) // "1.23억"
 * formatCompactKRW(5000000) // "500만"
 * formatCompactKRW(12345) // "12,345"
 */
export function formatCompactKRW(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }

  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1_000_000_000_000) {
    // 조 단위
    const v = absValue / 1_000_000_000_000;
    return `${sign}${v.toFixed(v >= 10 ? 1 : 2)}조`;
  }
  if (absValue >= 100_000_000) {
    // 억 단위
    const v = absValue / 100_000_000;
    return `${sign}${v.toFixed(v >= 10 ? 1 : 2)}억`;
  }
  if (absValue >= 10_000) {
    // 만 단위
    const v = absValue / 10_000;
    return `${sign}${formatNumber(Math.round(v))}만`;
  }

  return `${sign}${formatNumber(absValue)}`;
}

/**
 * 거래량을 축약하여 표시한다.
 *
 * @param volume - 거래량
 * @returns 축약된 거래량 문자열
 *
 * @example
 * formatVolume(1234567) // "1.23M"
 * formatVolume(1234) // "1.23K"
 * formatVolume(123) // "123"
 */
export function formatVolume(volume: number): string {
  if (!Number.isFinite(volume)) {
    return '0';
  }

  const absVolume = Math.abs(volume);
  const sign = volume < 0 ? '-' : '';

  if (absVolume >= 1_000_000_000) {
    return `${sign}${(absVolume / 1_000_000_000).toFixed(2)}B`;
  }
  if (absVolume >= 1_000_000) {
    return `${sign}${(absVolume / 1_000_000).toFixed(2)}M`;
  }
  if (absVolume >= 1_000) {
    return `${sign}${(absVolume / 1_000).toFixed(2)}K`;
  }

  return `${sign}${formatNumber(absVolume, 2)}`;
}
