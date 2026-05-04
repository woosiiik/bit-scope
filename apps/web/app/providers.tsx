/**
 * 전역 Provider 래핑 컴포넌트
 *
 * wagmi(Web3 지갑), RainbowKit(지갑 UI), TanStack Query(서버 상태 관리)
 * Provider를 하위 컴포넌트에 제공한다.
 *
 * @see 요구사항 8.1, 8.2
 */

'use client';

import { type ReactNode, useState, useEffect } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme, lightTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';

import { wagmiConfig } from '@/lib/wallet';
import { I18nProvider } from '@/lib/i18n/i18n-context';
import { useSettingsStore } from '@/store/settings-store';
import type { Locale } from '@/lib/i18n';

/** Providers 컴포넌트 Props */
interface ProvidersProps {
  children: ReactNode;
}

/**
 * 전역 Provider 컴포넌트
 *
 * 앱 전체에서 사용되는 Provider들을 래핑한다.
 * - WagmiProvider: Web3 지갑 연결 상태 관리
 * - QueryClientProvider: TanStack Query 서버 상태 캐싱
 * - RainbowKitProvider: 지갑 연결 UI 모달
 *
 * QueryClient는 컴포넌트 상태로 관리하여 SSR 시
 * 요청 간 데이터 격리를 보장한다.
 */
/**
 * 클라이언트 마운트 감지 가드
 *
 * SSR에서 wagmi/RainbowKit의 내부 상태(지갑 연결 상태 등)가
 * CSR 초기 상태와 달라 React hydration 불일치(#418)가 발생할 수 있다.
 *
 * force-dynamic으로 SSG는 방지되지만, SSR 시에도 서버는 지갑 상태를 알 수 없으므로
 * 클라이언트 마운트 전까지 빈 껍데기를 렌더링하여 hydration 충돌을 방지한다.
 *
 * aria-hidden으로 스크린 리더가 미완성 콘텐츠를 읽지 않도록 하고,
 * 마운트 후 즉시 실제 콘텐츠를 표시한다.
 *
 * SEO 영향: force-dynamic 환경에서 검색 크롤러는 서버 HTML을 수신하므로,
 * 메타데이터(layout.tsx의 metadata export)는 정상 제공된다.
 * 본문 콘텐츠의 빈 렌더링은 지갑 연결 필수 SPA 특성상 불가피하다.
 */
function ClientGate({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return <>{children}</>;
}

export function Providers({ children }: ProvidersProps) {
  /**
   * QueryClient를 useState로 생성하여 SSR 환경에서
   * 요청 간 캐시가 공유되지 않도록 한다.
   */
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            /** 페이지 포커스 시 자동 재조회 비활성화 (수동 제어) */
            refetchOnWindowFocus: false,
            /** 네트워크 재연결 시 자동 재조회 */
            refetchOnReconnect: true,
            /** 기본 재시도 1회 */
            retry: 1,
            /** 기본 stale 시간: 30초 (자동 갱신 주기와 일치) */
            staleTime: 30 * 1000,
          },
        },
      })
  );

  const language = useSettingsStore((s) => s.settings.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);

  return (
    <ClientGate>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider
            locale={language === 'en' ? 'en' : 'ko'}
            theme={{
              lightMode: lightTheme({
                accentColor: '#3B82F6',
                accentColorForeground: 'white',
                borderRadius: 'medium',
              }),
              darkMode: darkTheme({
                accentColor: '#3B82F6',
                accentColorForeground: 'white',
                borderRadius: 'medium',
              }),
            }}
          >
            <I18nProvider locale={language as Locale} onLocaleChange={(loc) => setLanguage(loc)}>
              {children}
            </I18nProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ClientGate>
  );
}
