/**
 * 사이드바 네비게이션 컴포넌트 (데스크톱)
 *
 * 데스크톱 화면(1024px 이상)에서 좌측 사이드바를 렌더링한다.
 * 각 메뉴 항목은 아이콘과 텍스트를 포함하며,
 * 현재 경로에 따라 활성 상태를 시각적으로 구분한다.
 *
 * @see 요구사항 9.2 (데스크톱 사이드바 네비게이션)
 * @see 요구사항 NF4.1 (WCAG 2.1 AA 접근성)
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  TrendingUp,
  BarChart3,
  LineChart,
  Bell,
  FileText,
  Star,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** 네비게이션 메뉴 항목 정의 */
export interface NavItem {
  /** 메뉴 표시 텍스트 */
  label: string;
  /** 링크 경로 */
  href: string;
  /** 아이콘 컴포넌트 */
  icon: React.ComponentType<{ className?: string }>;
  /** 접근성 설명 */
  ariaLabel?: string;
}

/** 기본 네비게이션 메뉴 목록 */
export const navigationItems: NavItem[] = [
  {
    label: '대시보드',
    href: '/',
    icon: LayoutDashboard,
    ariaLabel: '포트폴리오 대시보드',
  },
  {
    label: '마켓',
    href: '/market',
    icon: TrendingUp,
    ariaLabel: '실시간 마켓 시세',
  },
  {
    label: '김치 프리미엄',
    href: '/premium',
    icon: BarChart3,
    ariaLabel: '거래소 간 김치 프리미엄 분석',
  },
  {
    label: '성과 분석',
    href: '/analytics',
    icon: LineChart,
    ariaLabel: '포트폴리오 성과 분석',
  },
  {
    label: '알림',
    href: '/alerts',
    icon: Bell,
    ariaLabel: '가격 알림 관리',
  },
  {
    label: '리포트',
    href: '/reports',
    icon: FileText,
    ariaLabel: '리포트 및 데이터 내보내기',
  },
  {
    label: '워치리스트',
    href: '/watchlist',
    icon: Star,
    ariaLabel: '관심 코인 목록',
  },
  {
    label: '설정',
    href: '/settings',
    icon: Settings,
    ariaLabel: 'API 키 관리 및 설정',
  },
];

/** SidebarNav Props */
interface SidebarNavProps {
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * 현재 경로가 메뉴 항목과 일치하는지 판단한다.
 *
 * 루트 경로('/')는 정확히 일치해야 하고,
 * 나머지 경로는 접두사 일치로 판단한다.
 *
 * @param pathname - 현재 브라우저 경로
 * @param href - 메뉴 항목의 링크 경로
 * @returns 활성 상태 여부
 */
export function isActiveRoute(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname.startsWith(href);
}

/**
 * 데스크톱 사이드바 네비게이션
 *
 * 1024px 이상에서만 표시되며, 좌측 고정 사이드바로 렌더링된다.
 * 각 메뉴는 키보드 네비게이션과 ARIA 레이블을 지원한다.
 */
export function SidebarNav({ className }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0',
        'border-r border-sidebar-border bg-sidebar',
        className,
      )}
      aria-label="메인 네비게이션"
    >
      {/* 로고/서비스명 영역 */}
      <div className="flex h-16 items-center gap-2 px-6 border-b border-sidebar-border">
        <BarChart3 className="h-6 w-6 text-sidebar-primary" aria-hidden="true" />
        <span className="text-lg font-bold text-sidebar-foreground">BitScope</span>
      </div>

      {/* 네비게이션 메뉴 목록 */}
      <nav className="flex-1 overflow-y-auto py-4" aria-label="사이드바 메뉴">
        <ul className="space-y-1 px-3" role="list">
          {navigationItems.map((item) => {
            const isActive = isActiveRoute(pathname, item.href);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-primary'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  )}
                  aria-label={item.ariaLabel || item.label}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
