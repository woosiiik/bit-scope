/**
 * 국제화(i18n) Context 및 Provider
 *
 * React Context를 통해 현재 로케일과 메시지 객체를 하위 컴포넌트에 전달한다.
 * useTranslation 훅을 통해 컴포넌트에서 번역된 텍스트에 접근할 수 있다.
 *
 * @see 요구사항 9.9 (한국어/영어 언어 전환)
 * @see 요구사항 NF5.1 (한국어 기본 언어, 다국어 확장 가능)
 */

'use client';

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import {
  type Locale,
  type Messages,
  DEFAULT_LOCALE,
  getMessages,
  LOCALE_NAMES,
  SUPPORTED_LOCALES,
} from './index';

/** I18nContext가 하위에 전달하는 값 */
interface I18nContextValue {
  /** 현재 활성 로케일 */
  locale: Locale;
  /** 현재 로케일의 메시지 객체 */
  messages: Messages;
  /** 로케일 변경 함수 */
  setLocale: (locale: Locale) => void;
  /** 지원하는 로케일 목록 */
  supportedLocales: readonly Locale[];
  /** 로케일별 표시 이름 */
  localeNames: Record<Locale, string>;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/** I18nProvider Props */
interface I18nProviderProps {
  /** 하위 컴포넌트 */
  children: ReactNode;
  /** 현재 로케일 */
  locale: Locale;
  /** 로케일 변경 콜백 */
  onLocaleChange: (locale: Locale) => void;
}

/**
 * 국제화 Provider 컴포넌트
 *
 * 현재 로케일에 해당하는 메시지 객체를 Context로 전달한다.
 * settings-store의 언어 설정과 연동하여 사용한다.
 *
 * @example
 * ```tsx
 * <I18nProvider locale={locale} onLocaleChange={setLocale}>
 *   <App />
 * </I18nProvider>
 * ```
 */
export function I18nProvider({ children, locale, onLocaleChange }: I18nProviderProps) {
  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      messages: getMessages(locale),
      setLocale: onLocaleChange,
      supportedLocales: SUPPORTED_LOCALES,
      localeNames: LOCALE_NAMES,
    }),
    [locale, onLocaleChange],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * 번역 메시지에 접근하는 훅
 *
 * I18nProvider 하위에서 사용해야 하며,
 * 현재 로케일의 메시지 객체와 로케일 변경 함수를 반환한다.
 *
 * @returns 현재 로케일, 메시지 객체, 로케일 변경 함수
 * @throws I18nProvider 외부에서 호출 시 오류
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { t, locale, setLocale } = useTranslation();
 *   return <h1>{t.common.appName}</h1>;
 * }
 * ```
 */
export function useTranslation() {
  const context = useContext(I18nContext);

  if (!context) {
    // Provider가 없는 경우 기본 로케일로 폴백
    return {
      t: getMessages(DEFAULT_LOCALE),
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      supportedLocales: SUPPORTED_LOCALES,
      localeNames: LOCALE_NAMES,
    };
  }

  return {
    /** 현재 로케일의 메시지 객체 (번역 텍스트 접근용) */
    t: context.messages,
    /** 현재 활성 로케일 */
    locale: context.locale,
    /** 로케일 변경 함수 */
    setLocale: context.setLocale,
    /** 지원하는 로케일 목록 */
    supportedLocales: context.supportedLocales,
    /** 로케일별 표시 이름 */
    localeNames: context.localeNames,
  };
}
