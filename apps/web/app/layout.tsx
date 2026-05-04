/**
 * 루트 레이아웃
 *
 * HTML 기본 구조, 메타데이터, 폰트, 전역 Provider를 구성한다.
 * ThemeProvider를 통해 다크/라이트/시스템 테마를 지원하며,
 * 시스템 설정 감지가 기본으로 활성화되어 있다.
 *
 * @see 요구사항 9.3 (다크/라이트 모드 전환)
 * @see 요구사항 9.4 (시스템 설정 감지 → 다크 모드 기본값)
 * @see 요구사항 NF5.1 (한국어 기본 언어)
 */

// 루트 레이아웃 세그먼트를 동적 렌더링으로 강제 설정
// 이 설정은 하위 모든 라우트에 전파되어 빌드 시 SSG(정적 페이지 생성)를 방지한다.
// wagmi/RainbowKit이 빌드 시점에 Provider 컨텍스트 없이 실행되어
// WagmiProviderNotFoundError가 발생하는 것을 차단한다.
// 주의: layout.tsx는 서버 컴포넌트이므로 route segment config가 정상 동작한다.
// 'use client' 파일에서는 export const dynamic이 무시된다.
export const dynamic = 'force-dynamic';

import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Providers } from './providers';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

/** 기본 본문 폰트: Geist Sans */
const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
});

/** 코드/숫자 폰트: Geist Mono (고정폭) */
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

/** 페이지 메타데이터 */
export const metadata: Metadata = {
  title: {
    default: 'BitScope - 암호화폐 포트폴리오 통합 조회',
    template: '%s | BitScope',
  },
  description:
    '한국 3대 암호화폐 거래소(업비트, 빗썸, 코인원)의 포트폴리오를 하나의 대시보드에서 통합 조회하세요.',
  keywords: ['암호화폐', '포트폴리오', '업비트', '빗썸', '코인원', '비트코인', '대시보드'],
  authors: [{ name: 'BitScope' }],
};

/** 뷰포트 설정 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0e1a' },
  ],
};

/**
 * 루트 레이아웃 컴포넌트
 *
 * - ThemeProvider: 다크/라이트/시스템 테마 지원
 *   - attribute="class": .dark 클래스를 html 요소에 토글
 *   - defaultTheme="system": 시스템 설정을 기본값으로 사용
 *   - enableSystem: OS 다크 모드 감지 활성화
 * - Providers: wagmi, RainbowKit, TanStack Query Provider
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
