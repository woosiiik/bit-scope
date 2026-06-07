/**
 * 대시보드 레이아웃
 *
 * 앱 전체의 공통 셸(사이드바, 헤더, 하단 탭) 레이아웃이다.
 * 지갑 연결 없이도 접근 가능한 공개 영역(시세, 김프, 뉴스 등)을 포함한
 * 모든 페이지가 이 레이아웃을 거친다.
 *
 * 지갑 연결이 필요한 개인 영역(포트폴리오, 알림, 설정 등)은
 * 하위의 (personal) 그룹 레이아웃에서 WalletGuard로 보호한다.
 *
 * @see 요구사항 9.1 (모바일 최적화 레이아웃)
 * @see 요구사항 9.2 (데스크톱 사이드바 + 다중 패널)
 */

import { AppShell } from '@/components/layout/app-shell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
