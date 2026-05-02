/**
 * 전역 Provider 래핑 컴포넌트
 *
 * wagmi(Web3 지갑), RainbowKit(지갑 UI), TanStack Query(서버 상태 관리)
 * Provider를 하위 컴포넌트에 제공한다.
 *
 * @see 요구사항 8.1, 8.2
 */

'use client';

import { type ReactNode, useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme, lightTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';

import { wagmiConfig } from '@/lib/wallet';

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

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          locale="ko"
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
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
