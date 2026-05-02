/**
 * 지갑 연결 라우트 가드 컴포넌트
 *
 * 지갑이 연결되지 않은 상태에서 보호된 페이지에 접근하면
 * 지갑 연결 페이지(/connect)로 리다이렉트하거나,
 * 인라인 안내 메시지를 표시한다.
 *
 * 사용 방법:
 * 1. 레이아웃에서 래핑: 대시보드 레이아웃에서 WalletGuard로 children을 감싸기
 * 2. 개별 페이지에서 사용: 특정 페이지에서만 보호가 필요할 때
 *
 * @see 요구사항 8.1 (Web3 지갑 기반 인증)
 * @see 요구사항 8.2 (지갑 주소를 사용자 식별자로 사용)
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet } from 'lucide-react';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

/** WalletGuard Props */
interface WalletGuardProps {
  /** 보호할 하위 컴포넌트 */
  children: React.ReactNode;
  /**
   * 미인증 시 동작 모드
   * - 'redirect': /connect 페이지로 리다이렉트 (기본값)
   * - 'inline': 현재 위치에서 연결 안내 메시지 표시
   */
  mode?: 'redirect' | 'inline';
}

/**
 * 지갑 연결 라우트 가드
 *
 * 지갑이 연결된 경우에만 children을 렌더링한다.
 * 미연결 시에는 mode에 따라 리다이렉트 또는 인라인 안내를 표시한다.
 *
 * SSR 하이드레이션 불일치를 방지하기 위해
 * 클라이언트 마운트 이후에만 가드 로직을 실행한다.
 *
 * @example
 * ```tsx
 * // 레이아웃에서 리다이렉트 모드로 사용
 * export default function DashboardLayout({ children }) {
 *   return <WalletGuard mode="redirect">{children}</WalletGuard>;
 * }
 *
 * // 인라인 모드로 사용
 * <WalletGuard mode="inline">
 *   <SensitiveContent />
 * </WalletGuard>
 * ```
 */
export function WalletGuard({ children, mode = 'redirect' }: WalletGuardProps) {
  const router = useRouter();
  const { wallet, isConnecting } = useWalletAuth();
  const { t } = useTranslation();

  /**
   * 클라이언트 마운트 여부를 추적하여
   * SSR/하이드레이션 시 불일치를 방지한다.
   * 서버에서는 항상 로딩 상태를 렌더링하고,
   * 클라이언트 마운트 후에 실제 인증 상태를 확인한다.
   */
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  /**
   * 리다이렉트 모드: 지갑 미연결 시 /connect로 이동
   */
  useEffect(() => {
    if (isMounted && !isConnecting && !wallet.isConnected && mode === 'redirect') {
      router.replace('/connect');
    }
  }, [isMounted, isConnecting, wallet.isConnected, mode, router]);

  // 클라이언트 마운트 전 또는 연결 진행 중에는 로딩 표시
  if (!isMounted || isConnecting) {
    return (
      <div
        className="flex min-h-[50vh] items-center justify-center"
        role="status"
        aria-label={t.common.loading}
      >
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // 지갑이 연결되지 않은 경우
  if (!wallet.isConnected) {
    // 리다이렉트 모드: 리다이렉트 진행 중 로딩 표시
    if (mode === 'redirect') {
      return (
        <div
          className="flex min-h-[50vh] items-center justify-center"
          role="status"
          aria-label={t.common.loading}
        >
          <LoadingSpinner size="lg" />
        </div>
      );
    }

    // 인라인 모드: 지갑 연결 안내 메시지 표시
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Wallet className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground">
            {t.wallet.authRequired.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.wallet.authRequired.description}
          </p>
        </div>
        <Button
          onClick={() => router.push('/connect')}
          aria-label={t.wallet.authRequired.connectButton}
        >
          <Wallet className="h-4 w-4" aria-hidden="true" />
          {t.wallet.authRequired.connectButton}
        </Button>
      </div>
    );
  }

  // 지갑이 연결된 경우: children 렌더링
  return <>{children}</>;
}
