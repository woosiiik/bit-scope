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
  Newspaper,
  CirclePlay,
  Monitor,
  ChartCandlestick,
  Activity,
  Gauge,
  Calendar,
  Fish,
  FileText,
  Star,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/i18n-context';

/** 네비게이션 메뉴 항목 정의 */
export interface NavItem {
  /** i18n 키 (nav 섹션) */
  labelKey: string;
  /** 링크 경로 */
  href: string;
  /** 아이콘 컴포넌트 */
  icon: React.ComponentType<{ className?: string }>;
}

/** 네비게이션 메뉴 정의 (i18n 키 기반) */
const NAV_ITEMS: NavItem[] = [
  { labelKey: 'dashboard', href: '/', icon: LayoutDashboard },
  { labelKey: 'cryptoDesk', href: '/life', icon: Monitor },
  { labelKey: 'market', href: '/market', icon: TrendingUp },
  { labelKey: 'premium', href: '/premium', icon: BarChart3 },
  { labelKey: 'analytics', href: '/analytics', icon: LineChart },
  { labelKey: 'alerts', href: '/alerts', icon: Bell },
  { labelKey: 'futures', href: '/futures', icon: Activity },
  { labelKey: 'charts', href: '/charts', icon: ChartCandlestick },
  { labelKey: 'fearGreed', href: '/fear-greed', icon: Gauge },
  { labelKey: 'calendar', href: '/calendar', icon: Calendar },
  { labelKey: 'whale', href: '/whale', icon: Fish },
  { labelKey: 'news', href: '/news', icon: Newspaper },
  { labelKey: 'influencer', href: '/influencer', icon: CirclePlay },
  { labelKey: 'reports', href: '/reports', icon: FileText },
  { labelKey: 'watchlist', href: '/watchlist', icon: Star },
  { labelKey: 'settings', href: '/settings', icon: Settings },
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
  const { t } = useTranslation();
  const nav = t.nav as Record<string, string>;

  return (
    <aside
      className={cn(
        'hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 z-50',
        'border-r border-sidebar-border bg-sidebar',
        className,
      )}
      aria-label={t.common.appName}
    >
      {/* 로고/서비스명 영역 */}
      <div className="flex h-16 items-center gap-2 px-6 border-b border-sidebar-border">
        <BarChart3 className="h-6 w-6 text-sidebar-primary" aria-hidden="true" />
        <span className="text-lg font-bold text-sidebar-foreground">BitScope</span>
      </div>

      {/* 네비게이션 메뉴 목록 */}
      <nav className="flex-1 overflow-y-auto py-4" aria-label={t.common.appName}>
        <ul className="space-y-1 px-3" role="list">
          {NAV_ITEMS.map((item) => {
            const isActive = isActiveRoute(pathname, item.href);
            const Icon = item.icon;
            const label = nav[item.labelKey] ?? item.labelKey;

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
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* 빌드 버전 (배포 확인용) */}
      <div className="px-4 py-2 border-t border-sidebar-border">
        <span className="text-[10px] text-sidebar-foreground/40">
          v{process.env.NEXT_PUBLIC_BUILD_VERSION || 'dev'}
        </span>
      </div>
    </aside>
  );
}
