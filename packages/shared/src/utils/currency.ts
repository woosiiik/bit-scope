/**
 * 알림 통화 결정 및 포맷 유틸리티
 *
 * 거래소 식별자로부터 알림 통화 단위를 결정하고,
 * 통화별 가격 포맷팅을 제공한다.
 * 프론트엔드와 백엔드에서 동일한 로직을 사용한다.
 */

import type { ExchangeType } from '../types/exchange';
import { DOMESTIC_EXCHANGES } from '../constants/exchanges';

/** 알림에서 사용하는 통화 단위 */
export type AlertCurrency = 'KRW' | 'USD';

/** 거래소별 통화 매핑 (읽기 전용) */
export const EXCHANGE_CURRENCY_MAP: Readonly<Record<ExchangeType, AlertCurrency>> = {
  upbit: 'KRW',
  bithumb: 'KRW',
  coinone: 'KRW',
  binance: 'USD',
  bybit: 'USD',
  okx: 'USD',
  gate: 'USD',
  bitget: 'USD',
  hyperliquid: 'USD',
  lbank: 'USD',
} as const;

/**
 * 거래소 식별자로부터 알림 통화 단위를 결정한다.
 *
 * @param exchange - 거래소 식별자
 * @returns 'KRW' 또는 'USD'
 */
export function getCurrencyForExchange(exchange: ExchangeType): AlertCurrency {
  return EXCHANGE_CURRENCY_MAP[exchange] ?? 'USD';
}

/**
 * 국내 거래소인지 여부를 반환한다.
 *
 * @param exchange - 거래소 식별자
 * @returns true이면 국내 거래소
 */
export function isDomesticExchange(exchange: ExchangeType): boolean {
  return (DOMESTIC_EXCHANGES as readonly string[]).includes(exchange);
}

/**
 * 알림 가격을 통화에 맞게 포맷팅한다.
 *
 * - KRW: "50,000,000원" (정수, 원 접미사)
 * - USD: "$50,000.00" (소수점 2자리, $ 접두사)
 * - 프리미엄: "5.20%" (김프 알림용)
 *
 * @param value - 가격 또는 프리미엄 비율
 * @param currency - 통화 단위 (김프 알림이면 undefined)
 * @param isPremium - 김프 알림 여부
 * @returns 포맷된 문자열
 */
export function formatAlertPrice(
  value: number | string,
  currency?: AlertCurrency,
  isPremium?: boolean,
): string {
  // TypeORM decimal 컬럼이 문자열로 반환될 수 있으므로 Number 변환
  const num = Number(value);

  if (isPremium) {
    return `${num.toFixed(2)}%`;
  }

  if (currency === 'KRW') {
    // KRW: 정수, 콤마 구분 (소수점 없음)
    return `${Math.round(num).toLocaleString('ko-KR')}원`;
  }

  // USD: 소수점 최소 2자리, 최대 10자리 (SHIB 등 소액 코인 대응)
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 10 })}`;
}

/**
 * 통화에 따른 가격 입력 step 값을 반환한다.
 *
 * - KRW: '1' (정수 입력)
 * - USD: '0.0000000001' (소수점 10자리까지 입력 가능 — SHIB 등 소액 코인 대응)
 *
 * @param currency - 통화 단위
 * @returns step 문자열
 */
export function getInputStepForCurrency(currency: AlertCurrency): string {
  return currency === 'KRW' ? '1' : '0.0000000001';
}

/**
 * 통화에 따른 접두사/접미사를 반환한다.
 *
 * - KRW: { prefix: '', suffix: '원' }
 * - USD: { prefix: '$', suffix: '' }
 *
 * @param currency - 통화 단위
 * @returns { prefix, suffix }
 */
export function getCurrencyDisplay(currency: AlertCurrency): {
  prefix: string;
  suffix: string;
} {
  if (currency === 'KRW') {
    return { prefix: '', suffix: '원' };
  }
  return { prefix: '$', suffix: '' };
}
