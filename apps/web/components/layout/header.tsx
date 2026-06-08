/**
 * 헤더 컴포넌트
 *
 * 상단 고정 헤더로, 로고(모바일), 페이지 타이틀, 테마 토글,
 * 지갑 연결 버튼을 표시한다.
 *
 * 데스크톱에서는 사이드바 옆에, 모바일에서는 전체 너비로 렌더링된다.
 *
 * @see 요구사항 8.1 (Web3 지갑 연결 인증)
 * @see 요구사항 9.1 (모바일 최적화)
 * @see 요구사항 9.2 (데스크톱 다중 패널)
 */

'use client';

import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';
import { LanguageSwitcher } from '@/components/language-switcher';
import { WalletButton } from './wallet-button';
import { MobileNavDrawer } from './mobile-nav-drawer';

/** Header Props */
interface HeaderProps {
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * 앱 상단 헤더
 *
 * - 모바일: 로고 + 테마 토글 + 지갑 버튼
 * - 데스크톱: 사이드바 너비만큼 여백을 두고 렌더링
 */
export function Header({ className }: HeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-40 flex h-16 items-center justify-between',
        'border-b border-border bg-background/95 backdrop-blur-sm',
        'px-4 md:px-6 lg:pl-64',
        className,
      )}
      role="banner"
    >
      {/* 모바일 햄버거 + 로고 (사이드바가 없을 때) */}
      <div className="flex items-center gap-1 lg:hidden">
        <MobileNavDrawer />
        <div className="flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" aria-hidden="true" />
          <span className="text-lg font-bold">BitScope</span>
        </div>
      </div>

      {/* 데스크톱에서 좌측 여백 확보 */}
      <div className="hidden lg:block" />

      {/* 우측 액션 영역 */}
      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
        <WalletButton />
      </div>
    </header>
  );
}
