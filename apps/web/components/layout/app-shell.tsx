/**
 * 앱 셸 레이아웃 컴포넌트
 *
 * 사이드바(데스크톱), 헤더, 하단 탭(모바일)을 조합하여
 * 반응형 앱 레이아웃을 구성한다.
 *
 * - 모바일 (768px 이하): 헤더 + 컨텐츠 + 하단 탭
 * - 태블릿 (768px ~ 1024px): 헤더 + 컨텐츠
 * - 데스크톱 (1024px 이상): 사이드바 + 헤더 + 컨텐츠
 *
 * @see 요구사항 9.1 (모바일 최적화 레이아웃)
 * @see 요구사항 9.2 (데스크톱 사이드바 + 다중 패널)
 */

'use client';

import { cn } from '@/lib/utils';
import { SidebarNav } from './sidebar-nav';
import { BottomTabNav } from './bottom-tab-nav';
import { Header } from './header';

/** AppShell Props */
interface AppShellProps {
  /** 페이지 컨텐츠 */
  children: React.ReactNode;
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * 반응형 앱 셸 레이아웃
 *
 * 데스크톱에서는 좌측 사이드바와 함께,
 * 모바일에서는 하단 탭과 함께 페이지 컨텐츠를 렌더링한다.
 * 하단 탭이 컨텐츠를 가리지 않도록 하단 패딩을 적용한다.
 */
export function AppShell({ children, className }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* 데스크톱 사이드바 (1024px 이상) */}
      <SidebarNav />

      {/* 상단 헤더 */}
      <Header />

      {/* 메인 컨텐츠 영역 */}
      <main
        className={cn(
          'lg:pl-64',
          'pb-20 md:pb-6',
          'px-4 md:px-6 py-6',
          className,
        )}
        role="main"
        id="main-content"
      >
        {children}
      </main>

      {/* 모바일 하단 탭 (768px 이하) */}
      <BottomTabNav />
    </div>
  );
}
