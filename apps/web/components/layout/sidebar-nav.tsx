/**
 * 사이드바 네비게이션 컴포넌트 (데스크톱)
 *
 * 개인/마켓/뉴스&인텔 섹션으로 그룹화된 메뉴를 제공한다.
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
  ArrowUpDown,
  Gauge,
  Calendar,
  Fish,
  Send,
  Zap,
  FileText,
  Star,
  Settings,
  Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { HiddenMenuTrigger } from '@/components/signal/hidden-menu-trigger';
import { useSignalAuth } from '@/hooks/useSignal';

/** 네비게이션 메뉴 항목 */
export interface NavItem {
  labelKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** 네비게이션 섹션 */
interface NavSection {
  labelKey: string;
  items: NavItem[];
}

/** 섹션별 메뉴 구성 */
const NAV_SECTIONS: NavSection[] = [
  {
    labelKey: 'sectionPersonal',
    items: [
      { labelKey: 'dashboard', href: '/', icon: LayoutDashboard },
      { labelKey: 'analytics', href: '/analytics', icon: LineChart },
      { labelKey: 'alerts', href: '/alerts', icon: Bell },
      { labelKey: 'watchlist', href: '/watchlist', icon: Star },
      { labelKey: 'reports', href: '/reports', icon: FileText },
      { labelKey: 'settings', href: '/settings', icon: Settings },
    ],
  },
  {
    labelKey: 'sectionMarket',
    items: [
      { labelKey: 'cryptoDesk', href: '/life', icon: Monitor },
      { labelKey: 'market', href: '/market', icon: TrendingUp },
      { labelKey: 'premium', href: '/premium', icon: BarChart3 },
      { labelKey: 'marketScreener', href: '/market-screener', icon: BarChart3 },
      { labelKey: 'futuresDashboard', href: '/futures-dashboard', icon: BarChart3 },
      { labelKey: 'stockPerpComparison', href: '/stock-perp-comparison', icon: ChartCandlestick },
      { labelKey: 'futuresMarketData', href: '/futures', icon: Activity },
      { labelKey: 'futuresTrading', href: '/futures-trading', icon: ArrowUpDown },
      { labelKey: 'charts', href: '/charts', icon: ChartCandlestick },
    ],
  },
  {
    labelKey: 'sectionIntel',
    items: [
      { labelKey: 'fearGreed', href: '/fear-greed', icon: Gauge },
      { labelKey: 'calendar', href: '/calendar', icon: Calendar },
      { labelKey: 'whale', href: '/whale', icon: Fish },
      { labelKey: 'news', href: '/news', icon: Newspaper },
      { labelKey: 'breakingNews', href: '/breaking-news', icon: Zap },
      { labelKey: 'influencer', href: '/influencer', icon: CirclePlay },
      { labelKey: 'telegramFeed', href: '/telegram-feed', icon: Send },
    ],
  },
];

/** 전체 NAV_ITEMS (하단탭 등에서 사용) */
export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

export function isActiveRoute(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname.startsWith(href);
}

export function SidebarNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const nav = t.nav as Record<string, string>;
  const { isAuthenticated: isSignalAuth } = useSignalAuth();

  return (
    <aside
      className={cn(
        'hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 z-50',
        'border-r border-sidebar-border bg-sidebar',
        className,
      )}
      aria-label={t.common.appName}
    >
      {/* 로고 */}
      <div className="flex h-16 items-center gap-2 px-6 border-b border-sidebar-border">
        <BarChart3 className="h-6 w-6 text-sidebar-primary" aria-hidden="true" />
        <span className="text-lg font-bold text-sidebar-foreground">BitScope</span>
      </div>

      {/* 섹션별 메뉴 */}
      <nav className="flex-1 overflow-y-auto py-3" aria-label={t.common.appName}>
        {NAV_SECTIONS.map((section, si) => (
          <div key={section.labelKey} className={cn(si > 0 && 'mt-3 pt-3 border-t border-sidebar-border mx-3')}>
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              {nav[section.labelKey] ?? section.labelKey}
            </p>
            <ul className="space-y-0.5 px-3" role="list">
              {section.items.map((item) => {
                const isActive = isActiveRoute(pathname, item.href);
                const Icon = item.icon;
                const label = nav[item.labelKey] ?? item.labelKey;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-primary'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      )}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <Icon className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
                      <span>{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* 히든 메뉴 (인증 시에만 표시) */}
      {isSignalAuth && (
        <div className="mx-3 mt-1 pt-1 border-t border-sidebar-border">
          <ul className="space-y-0.5 px-3" role="list">
            <li>
              <Link
                href="/signal"
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                  isActiveRoute(pathname, '/signal')
                    ? 'bg-sidebar-accent text-sidebar-primary'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
                aria-current={isActiveRoute(pathname, '/signal') ? 'page' : undefined}
              >
                <Lock className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
                <span>{nav.signalMenu ?? '롱/숏 시그널'}</span>
              </Link>
            </li>
          </ul>
        </div>
      )}

      {/* 빌드 버전 */}
      <div className="px-4 py-2 border-t border-sidebar-border">
        <HiddenMenuTrigger versionText={`v${process.env.NEXT_PUBLIC_BUILD_VERSION || 'dev'}`} />
      </div>
    </aside>
  );
}
