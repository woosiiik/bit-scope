/**
 * SidebarNav 컴포넌트 단위 테스트
 *
 * 사이드바 네비게이션의 렌더링, 활성 상태 판별,
 * 접근성(ARIA) 속성을 검증한다.
 *
 * @see 요구사항 9.2 (데스크톱 사이드바 네비게이션)
 * @see 요구사항 NF4.1 (WCAG 2.1 AA 접근성)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SidebarNav, navigationItems, isActiveRoute } from '../sidebar-nav';

// next/navigation 모킹
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
}));

// next/link 모킹
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe('isActiveRoute', () => {
  it('루트 경로는 정확히 "/" 일 때만 활성화된다', () => {
    expect(isActiveRoute('/', '/')).toBe(true);
    expect(isActiveRoute('/market', '/')).toBe(false);
    expect(isActiveRoute('/settings', '/')).toBe(false);
  });

  it('하위 경로를 포함하여 활성 상태를 판별한다', () => {
    expect(isActiveRoute('/market', '/market')).toBe(true);
    expect(isActiveRoute('/market/btc', '/market')).toBe(true);
    expect(isActiveRoute('/settings/api-keys', '/settings')).toBe(true);
  });

  it('관련 없는 경로는 비활성 상태이다', () => {
    expect(isActiveRoute('/market', '/alerts')).toBe(false);
    expect(isActiveRoute('/premium', '/analytics')).toBe(false);
  });
});

describe('navigationItems', () => {
  it('8개의 네비게이션 항목을 포함한다', () => {
    expect(navigationItems).toHaveLength(8);
  });

  it('모든 항목에 label, href, icon이 있다', () => {
    navigationItems.forEach((item) => {
      expect(item.label).toBeTruthy();
      expect(item.href).toBeTruthy();
      expect(item.icon).toBeTruthy();
    });
  });

  it('대시보드가 첫 번째 항목이다', () => {
    expect(navigationItems[0].label).toBe('대시보드');
    expect(navigationItems[0].href).toBe('/');
  });
});

describe('SidebarNav', () => {
  it('사이드바를 렌더링한다', () => {
    render(<SidebarNav />);
    const sidebar = screen.getByRole('complementary', { name: '메인 네비게이션' });
    expect(sidebar).toBeInTheDocument();
  });

  it('BitScope 로고를 표시한다', () => {
    render(<SidebarNav />);
    expect(screen.getByText('BitScope')).toBeInTheDocument();
  });

  it('모든 네비게이션 링크를 렌더링한다', () => {
    render(<SidebarNav />);
    navigationItems.forEach((item) => {
      const link = screen.getByRole('link', { name: item.ariaLabel || item.label });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', item.href);
    });
  });

  it('현재 경로에 해당하는 링크에 aria-current="page"를 설정한다', () => {
    render(<SidebarNav />);
    const dashboardLink = screen.getByRole('link', { name: '포트폴리오 대시보드' });
    expect(dashboardLink).toHaveAttribute('aria-current', 'page');
  });

  it('비활성 링크에는 aria-current가 없다', () => {
    render(<SidebarNav />);
    const marketLink = screen.getByRole('link', { name: '실시간 마켓 시세' });
    expect(marketLink).not.toHaveAttribute('aria-current');
  });

  it('nav 요소에 aria-label이 있다', () => {
    render(<SidebarNav />);
    const nav = screen.getByRole('navigation', { name: '사이드바 메뉴' });
    expect(nav).toBeInTheDocument();
  });
});
