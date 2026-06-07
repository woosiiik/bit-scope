/**
 * 지갑 연결 라우트 가드 컴포넌트
 *
 * 지갑이 연결되지 않은 상태에서 개인화된 페이지(포트폴리오, 알림 등)에
 * 접근하면 현재 위치에서 연결 안내 메시지를 표시한다.
 * 안내의 연결 버튼은 헤더 우상단의 지갑 연결 버튼과 동일하게
 * RainbowKit 연결 모달을 연다(별도 /connect 페이지로 이동하지 않음).
 *
 * 사용 방법: 보호할 영역의 레이아웃/페이지에서 WalletGuard로 children을 감싼다.
 *
 * @see 요구사항 8.1 (Web3 지갑 기반 인증)
 * @see 요구사항 8.2 (지갑 주소를 사용자 식별자로 사용)
 */

'use client';

import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

/** WalletGuard Props */
interface WalletGuardProps {
  /** 보호할 하위 컴포넌트 */
  children: React.ReactNode;
}

/**
 * 지갑 연결 라우트 가드
 *
 * 지갑이 연결된 경우에만 children을 렌더링한다.
 * 미연결 시에는 현재 위치에서 연결 안내 메시지를 표시한다.
 *
 * SSR 하이드레이션 불일치를 방지하기 위해
 * 클라이언트 마운트 이후에만 가드 로직을 실행한다.
 *
 * @example
 * ```tsx
 * export default function PersonalLayout({ children }) {
 *   return <WalletGuard>{children}</WalletGuard>;
 * }
 * ```
 */
export function WalletGuard({ children }: WalletGuardProps) {
  const { wallet, isConnecting } = useWalletAuth();
  const { openConnectModal } = useConnectModal();
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

  // 지갑이 연결되지 않은 경우: 연결 안내 메시지 표시
  if (!wallet.isConnected) {
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
          onClick={() => openConnectModal?.()}
          disabled={!openConnectModal}
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
