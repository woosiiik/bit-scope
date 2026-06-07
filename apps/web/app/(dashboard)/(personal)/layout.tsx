/**
 * 개인 영역 레이아웃
 *
 * 지갑 주소/서명에 의존하는 개인화된 페이지들의 공통 레이아웃이다.
 * - 포트폴리오 대시보드 (/)
 * - 알림 (/alerts)
 * - 분석 (/analytics)
 * - 보고서 (/reports)
 * - 설정 (/settings)
 * - 관심 목록 (/watchlist)
 *
 * 지갑 미연결 시 리다이렉트하지 않고 현재 위치에서 연결 안내를
 * 표시한다(mode="inline"). 공개 페이지(시세, 김프, 뉴스 등)는 이 그룹
 * 밖에 있으므로 지갑 없이도 자유롭게 탐색할 수 있다.
 *
 * @see 요구사항 8.1 (Web3 지갑 기반 인증)
 * @see 요구사항 8.2 (지갑 주소를 사용자 식별자로 사용)
 */

import { WalletGuard } from '@/components/auth/wallet-guard';

export default function PersonalLayout({ children }: { children: React.ReactNode }) {
  return <WalletGuard mode="inline">{children}</WalletGuard>;
}
