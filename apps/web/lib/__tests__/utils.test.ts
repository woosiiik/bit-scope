/**
 * cn 유틸리티 함수 단위 테스트
 *
 * Tailwind CSS 클래스 병합이 올바르게 동작하는지 검증한다.
 */

import { describe, it, expect } from 'vitest';
import { cn } from '../utils';

describe('cn', () => {
  it('여러 클래스를 병합한다', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
  });

  it('충돌하는 Tailwind 클래스를 올바르게 처리한다', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('조건부 클래스를 처리한다', () => {
    const isActive = true;
    expect(cn('base', isActive && 'active')).toBe('base active');
  });

  it('falsy 값을 무시한다', () => {
    expect(cn('base', false, null, undefined, 0, '')).toBe('base');
  });

  it('빈 입력에 대해 빈 문자열을 반환한다', () => {
    expect(cn()).toBe('');
  });

  it('배경색 충돌을 해결한다', () => {
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
  });

  it('객체 형태의 조건부 클래스를 처리한다', () => {
    expect(cn({ 'text-red-500': true, 'text-blue-500': false })).toBe('text-red-500');
  });
});
