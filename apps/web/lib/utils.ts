/**
 * UI 유틸리티 함수
 *
 * shadcn/ui 컴포넌트에서 사용하는 className 병합 유틸리티이다.
 * clsx로 조건부 클래스를 구성하고, tailwind-merge로 충돌을 해결한다.
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Tailwind CSS 클래스를 안전하게 병합한다.
 *
 * clsx로 조건부 클래스를 결합한 뒤, tailwind-merge를 통해
 * 충돌하는 Tailwind 유틸리티 클래스를 올바르게 처리한다.
 *
 * @param inputs - 병합할 클래스 값들
 * @returns 병합된 className 문자열
 *
 * @example
 * cn('px-2 py-1', 'px-4') // "px-4 py-1"
 * cn('bg-red-500', condition && 'bg-blue-500') // 조건에 따라 결정
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
