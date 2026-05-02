/**
 * 국제화(i18n) 모듈 진입점
 *
 * 한국어/영어 텍스트 리소스를 관리하며,
 * 언어 전환 기능을 위한 타입과 유틸리티를 제공한다.
 *
 * @see 요구사항 9.9 (한국어, 영어 지원)
 * @see 요구사항 NF5.1 (한국어 기본 언어, 다국어 확장 가능)
 */

import ko, { type Messages } from './ko';
import en from './en';

/** 지원하는 로케일 타입 */
export type Locale = 'ko' | 'en';

/** 지원하는 로케일 목록 */
export const SUPPORTED_LOCALES: readonly Locale[] = ['ko', 'en'] as const;

/** 기본 로케일 (한국어) */
export const DEFAULT_LOCALE: Locale = 'ko';

/** 로케일별 표시 이름 */
export const LOCALE_NAMES: Record<Locale, string> = {
  ko: '한국어',
  en: 'English',
} as const;

/** 로케일별 메시지 맵 */
const messages: Record<Locale, Messages> = {
  ko,
  en,
} as const;

/**
 * 지정된 로케일의 메시지 객체를 반환한다.
 *
 * @param locale - 대상 로케일
 * @returns 해당 로케일의 메시지 객체
 */
export function getMessages(locale: Locale): Messages {
  return messages[locale] ?? messages[DEFAULT_LOCALE];
}

/**
 * 주어진 값이 유효한 로케일인지 검사한다.
 *
 * @param value - 검사할 값
 * @returns 유효한 Locale이면 true
 */
export function isValidLocale(value: unknown): value is Locale {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as Locale);
}

export type { Messages };
export { ko, en };
