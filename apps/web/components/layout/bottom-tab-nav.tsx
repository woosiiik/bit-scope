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
  ChartCandlestick,
  BarChart3,
  Newspaper,
  Zap,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { isActiveRoute, type NavItem } from './sidebar-nav';

/**
 * 모바일 하단 탭에 표시할 메뉴 항목 (i18n 키 기반).
 *
 * 전체 메뉴는 헤더 햄버거 드로어(MobileNavDrawer)에서 접근 가능하며,
 * 하단 탭은 자주 쓰는 항목만 노출한다.
 * TODO: 추후 사용자가 하단 탭 항목을 직접 선택할 수 있도록 한다.
 */
const MOBILE_TAB_ITEMS: NavItem[] = [
  { labelKey: 'stockPerpComparison', href: '/stock-perp-comparison', icon: ChartCandlestick },
  { labelKey: 'futuresDashboard', href: '/futures-dashboard', icon: BarChart3 },
  { labelKey: 'marketScreener', href: '/market-screener', icon: BarChart3 },
  { labelKey: 'news', href: '/news', icon: Newspaper },
  { labelKey: 'breakingNews', href: '/breaking-news', icon: Zap },
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
      aria-label={nav.mobileNavigation ?? t.common.appName}
    >
      <ul className="flex w-full" role="list">
        {MOBILE_TAB_ITEMS.map((item) => {
          const isActive = isActiveRoute(pathname, item.href);
          const Icon = item.icon;
          const label = nav[item.labelKey] ?? item.labelKey;

          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                className={cn(
                  'flex h-full flex-col items-center justify-start gap-1 px-0.5 py-2',
                  'font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon
                  className={cn('h-5 w-5 shrink-0', isActive && 'text-primary')}
                  aria-hidden="true"
                />
                <span className="line-clamp-2 w-full text-center text-[10px] leading-tight break-keep">
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
