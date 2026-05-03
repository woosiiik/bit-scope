/**
 * 하단 탭 네비게이션 컴포넌트 (모바일)
 *
 * 모바일 화면(768px 이하)에서 하단 고정 탭 바를 렌더링한다.
 * 주요 메뉴만 아이콘 기반으로 표시하여 모바일에 최적화한다.
 *
 * @see 요구사항 9.1 (모바일 최적화 레이아웃)
 * @see 요구사항 NF4.1 (WCAG 2.1 AA 접근성)
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  TrendingUp,
  BarChart3,
  Bell,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { isActiveRoute, type NavItem } from './sidebar-nav';

/** 모바일 하단 탭에 표시할 메뉴 항목 (최대 5개, i18n 키 기반) */
const MOBILE_TAB_ITEMS: NavItem[] = [
  { labelKey: 'dashboard', href: '/', icon: LayoutDashboard },
  { labelKey: 'market', href: '/market', icon: TrendingUp },
  { labelKey: 'premium', href: '/premium', icon: BarChart3 },
  { labelKey: 'alerts', href: '/alerts', icon: Bell },
  { labelKey: 'settings', href: '/settings', icon: Settings },
];

/** BottomTabNav Props */
interface BottomTabNavProps {
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * 모바일 하단 탭 네비게이션
 *
 * 768px 이하에서만 표시되며, 하단 고정 바로 렌더링된다.
 * 각 탭은 아이콘과 짧은 텍스트를 포함하며,
 * 활성 상태를 시각적으로 구분한다.
 */
export function BottomTabNav({ className }: BottomTabNavProps) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const nav = t.nav as Record<string, string>;

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'flex md:hidden',
        'border-t border-border bg-background/95 backdrop-blur-sm',
        'safe-area-inset-bottom',
        className,
      )}
      aria-label={t.common.appName}
    >
      <ul className="flex w-full" role="list">
        {MOBILE_TAB_ITEMS.map((item) => {
          const isActive = isActiveRoute(pathname, item.href);
          const Icon = item.icon;
          const label = nav[item.labelKey] ?? item.labelKey;

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 py-2 px-1',
                  'text-xs font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon
                  className={cn('h-5 w-5', isActive && 'text-primary')}
                  aria-hidden="true"
                />
                <span className="truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
