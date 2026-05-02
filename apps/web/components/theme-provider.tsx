/**
 * 테마 Provider 컴포넌트
 *
 * next-themes를 래핑하여 다크/라이트/시스템 테마 전환을 제공한다.
 * 시스템 설정을 감지하여 기본 테마를 적용하며,
 * 사용자가 수동으로 전환할 수도 있다.
 *
 * @see 요구사항 9.3 (다크/라이트 모드 전환)
 * @see 요구사항 9.4 (시스템 설정 감지)
 */

'use client';

import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from 'next-themes';

/**
 * BitScope 테마 Provider
 *
 * next-themes의 ThemeProvider를 래핑한다.
 * - attribute="class": HTML 요소에 dark 클래스를 토글
 * - defaultTheme="system": 시스템 설정을 기본값으로 사용
 * - enableSystem: 시스템 다크/라이트 모드 감지 활성화
 *
 * @param props - ThemeProvider props
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
