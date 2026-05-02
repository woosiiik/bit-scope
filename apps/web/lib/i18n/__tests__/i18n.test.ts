/**
 * 국제화(i18n) 모듈 단위 테스트
 *
 * 로케일 메시지의 키 일관성, 유효성 검증, 메시지 조회 로직을 검증한다.
 *
 * @see 요구사항 9.9 (한국어/영어 지원)
 * @see 요구사항 NF5.1 (한국어 기본 언어)
 */

import { describe, it, expect } from 'vitest';
import ko from '../ko';
import en from '../en';
import {
  getMessages,
  isValidLocale,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  LOCALE_NAMES,
} from '../index';

describe('i18n 모듈', () => {
  describe('로케일 메시지 키 일관성', () => {
    /**
     * 두 객체의 키 구조가 동일한지 재귀적으로 검사한다.
     * 함수 타입의 값은 키 존재만 확인하고 하위 탐색하지 않는다.
     */
    function getKeyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
      const keys: string[] = [];
      for (const key of Object.keys(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        const value = obj[key];
        if (typeof value === 'object' && value !== null && typeof value !== 'function') {
          keys.push(...getKeyPaths(value as Record<string, unknown>, fullKey));
        } else {
          keys.push(fullKey);
        }
      }
      return keys.sort();
    }

    it('한국어와 영어 메시지의 키 구조가 동일해야 한다', () => {
      const koKeys = getKeyPaths(ko as unknown as Record<string, unknown>);
      const enKeys = getKeyPaths(en as unknown as Record<string, unknown>);

      expect(koKeys).toEqual(enKeys);
    });

    it('한국어 메시지의 모든 문자열 값이 비어 있지 않아야 한다', () => {
      function checkNonEmpty(obj: Record<string, unknown>, path = '') {
        for (const key of Object.keys(obj)) {
          const value = obj[key];
          const fullPath = path ? `${path}.${key}` : key;

          if (typeof value === 'string') {
            expect(value.trim().length, `ko.${fullPath}이(가) 비어 있음`).toBeGreaterThan(0);
          } else if (typeof value === 'object' && value !== null) {
            checkNonEmpty(value as Record<string, unknown>, fullPath);
          }
        }
      }

      checkNonEmpty(ko as unknown as Record<string, unknown>);
    });

    it('영어 메시지의 모든 문자열 값이 비어 있지 않아야 한다', () => {
      function checkNonEmpty(obj: Record<string, unknown>, path = '') {
        for (const key of Object.keys(obj)) {
          const value = obj[key];
          const fullPath = path ? `${path}.${key}` : key;

          if (typeof value === 'string') {
            expect(value.trim().length, `en.${fullPath}이(가) 비어 있음`).toBeGreaterThan(0);
          } else if (typeof value === 'object' && value !== null) {
            checkNonEmpty(value as Record<string, unknown>, fullPath);
          }
        }
      }

      checkNonEmpty(en as unknown as Record<string, unknown>);
    });
  });

  describe('getMessages', () => {
    it('한국어 로케일로 한국어 메시지를 반환해야 한다', () => {
      const messages = getMessages('ko');
      expect(messages.common.appName).toBe('BitScope');
      expect(messages.nav.dashboard).toBe('대시보드');
    });

    it('영어 로케일로 영어 메시지를 반환해야 한다', () => {
      const messages = getMessages('en');
      expect(messages.common.appName).toBe('BitScope');
      expect(messages.nav.dashboard).toBe('Dashboard');
    });

    it('알 수 없는 로케일에 대해 기본 로케일 메시지를 반환해야 한다', () => {
      // @ts-expect-error -- 테스트를 위해 잘못된 로케일 전달
      const messages = getMessages('fr');
      expect(messages).toBe(getMessages(DEFAULT_LOCALE));
    });
  });

  describe('isValidLocale', () => {
    it('유효한 로케일 문자열에 대해 true를 반환해야 한다', () => {
      expect(isValidLocale('ko')).toBe(true);
      expect(isValidLocale('en')).toBe(true);
    });

    it('유효하지 않은 로케일에 대해 false를 반환해야 한다', () => {
      expect(isValidLocale('fr')).toBe(false);
      expect(isValidLocale('')).toBe(false);
      expect(isValidLocale(null)).toBe(false);
      expect(isValidLocale(undefined)).toBe(false);
      expect(isValidLocale(123)).toBe(false);
    });
  });

  describe('상수 정의', () => {
    it('기본 로케일이 한국어(ko)여야 한다', () => {
      expect(DEFAULT_LOCALE).toBe('ko');
    });

    it('지원 로케일에 한국어와 영어가 포함되어야 한다', () => {
      expect(SUPPORTED_LOCALES).toContain('ko');
      expect(SUPPORTED_LOCALES).toContain('en');
    });

    it('모든 지원 로케일에 표시 이름이 있어야 한다', () => {
      for (const locale of SUPPORTED_LOCALES) {
        expect(LOCALE_NAMES[locale]).toBeDefined();
        expect(LOCALE_NAMES[locale].length).toBeGreaterThan(0);
      }
    });
  });

  describe('동적 메시지 함수', () => {
    it('한국어 exchangeDataDelayed 함수가 올바른 문자열을 반환해야 한다', () => {
      const result = ko.errors.exchangeDataDelayed('업비트', '14:30');
      expect(result).toBe('업비트 데이터 지연 중. 마지막 업데이트: 14:30');
    });

    it('영어 exchangeDataDelayed 함수가 올바른 문자열을 반환해야 한다', () => {
      const result = en.errors.exchangeDataDelayed('Upbit', '14:30');
      expect(result).toBe('Upbit data delayed. Last update: 14:30');
    });
  });
});
