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
 * SSR/CSR hydration 불일치 방지 가드
 *
 * 클라이언트 마운트 전까지 children을 숨겨서
 * wagmi/RainbowKit의 SSR 상태와 CSR 상태 차이로 인한
 * React #418 에러를 방지한다.
 */
function MountGuard({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div style={{ visibility: mounted ? 'visible' : 'hidden' }}>
      {children}
    </div>
  );
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
            <MountGuard>{children}</MountGuard>
          </I18nProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
