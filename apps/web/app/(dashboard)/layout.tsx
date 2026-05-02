/**
 * 대시보드 레이아웃
 *
 * 지갑 연결이 필요한 보호된 영역의 공통 레이아웃이다.
 * AppShell(사이드바, 헤더, 하단 탭)과 WalletGuard(지갑 인증 가드)를 래핑한다.
 *
 * 지갑이 연결되지 않은 상태에서 접근하면 /connect 페이지로 리다이렉트된다.
 *
 * @see 요구사항 8.1 (Web3 지갑 기반 인증)
 * @see 요구사항 9.1 (모바일 최적화 레이아웃)
 * @see 요구사항 9.2 (데스크톱 사이드바 + 다중 패널)
 */

import { AppShell } from '@/components/layout/app-shell';
import { WalletGuard } from '@/components/auth/wallet-guard';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletGuard mode="redirect">
      <AppShell>{children}</AppShell>
    </WalletGuard>
  );
}
