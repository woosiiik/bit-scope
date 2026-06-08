/**
 * 모바일 네비게이션 드로어 컴포넌트
 *
 * lg(1024px) 미만에서 헤더 좌측 햄버거 버튼으로 좌측 슬라이드 드로어를 열어,
 * 데스크톱 사이드바(`SidebarNav`)와 동일한 섹션·항목·시그널 히든 메뉴 전체에 접근하게 한다.
 *
 * - lg 이상에서는 래퍼가 `lg:hidden`이라 트리거가 렌더되지 않으며, 기본 닫힘 상태이므로
 *   드로어 portal DOM도 생성되지 않는다(데스크톱 무영향).
 * - 메뉴 정의는 `sidebar-nav.tsx`의 `NAV_SECTIONS`를 공유해 사이드바와 항상 일치한다.
 * - 접근성(포커스 트랩, ESC, aria-modal, 포커스 복귀, 스크롤 락)은 Sheet(Radix Dialog)가 제공한다.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Menu, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { useSignalAuth } from '@/hooks/useSignal';
import { NAV_SECTIONS, isActiveRoute } from './sidebar-nav';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';

/** MobileNavDrawer Props */
interface MobileNavDrawerProps {
  /** 트리거 래퍼에 추가할 CSS 클래스 */
  className?: string;
}

/**
 * 모바일 햄버거 + 슬라이드 드로어 네비게이션.
 *
 * 햄버거 버튼은 lg 미만에서만 노출되며, 클릭 시 좌측 드로어로 전체 메뉴를 표시한다.
 * 라우트 변경 또는 메뉴 항목 선택 시 드로어가 닫힌다.
 */
export function MobileNavDrawer({ className }: MobileNavDrawerProps) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const nav = t.nav as Record<string, string>;
  const { isAuthenticated: isSignalAuth } = useSignalAuth();
  const [open, setOpen] = useState(false);

  // 라우트 변경 시 드로어 자동 닫힘
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // 메뉴 항목 링크 공통 클래스 (사이드바와 동일 토큰)
  const linkClass = (active: boolean) =>
    cn(
      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
      active
        ? 'bg-sidebar-accent text-sidebar-primary'
        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
    );

  return (
    <div className={cn('lg:hidden', className)}>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label={nav.menuOpen ?? '메뉴 열기'}
            aria-expanded={open}
            className={cn(
              'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md',
              'text-foreground transition-colors hover:bg-accent',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            <Menu className="h-6 w-6" aria-hidden="true" />
          </button>
        </SheetTrigger>

        <SheetContent
          side="left"
          closeLabel={nav.menuClose ?? '메뉴 닫기'}
          aria-describedby={undefined}
          className="p-0"
        >
          {/* 접근 가능한 이름 (시각적으로는 숨김) */}
          <SheetTitle className="sr-only">{nav.menuTitle ?? '주 메뉴'}</SheetTitle>

          {/* 로고 헤더 */}
          <div className="flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border px-6">
            <BarChart3 className="h-6 w-6 text-sidebar-primary" aria-hidden="true" />
            <span className="text-lg font-bold">BitScope</span>
          </div>

          {/* 섹션별 메뉴 */}
          <nav
            className="flex-1 overflow-y-auto py-3"
            aria-label={nav.mainNavigation ?? '메인 네비게이션'}
          >
            {NAV_SECTIONS.map((section, si) => (
              <div
                key={section.labelKey}
                className={cn(si > 0 && 'mt-3 pt-3 border-t border-sidebar-border mx-3')}
              >
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
                          onClick={() => setOpen(false)}
                          className={linkClass(isActive)}
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

            {/* 히든 메뉴 (시그널 인증 시에만 표시) */}
            {isSignalAuth && (
              <div className="mx-3 mt-1 pt-1 border-t border-sidebar-border">
                <ul className="space-y-0.5 px-3" role="list">
                  <li>
                    <Link
                      href="/signal"
                      onClick={() => setOpen(false)}
                      className={linkClass(isActiveRoute(pathname, '/signal'))}
                      aria-current={isActiveRoute(pathname, '/signal') ? 'page' : undefined}
                    >
                      <Lock className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
                      <span>{nav.signalMenu ?? '롱/숏 시그널'}</span>
                    </Link>
                  </li>
                </ul>
              </div>
            )}
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
}
