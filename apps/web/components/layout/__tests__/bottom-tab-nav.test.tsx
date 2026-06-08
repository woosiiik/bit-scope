/**
 * BottomTabNav 컴포넌트 단위 테스트
 *
 * 모바일 하단 탭 네비게이션의 렌더링, 활성 상태,
 * 접근성(ARIA) 속성을 검증한다.
 *
 * @see 요구사항 9.1 (모바일 최적화 레이아웃)
 * @see 요구사항 NF4.1 (WCAG 2.1 AA 접근성)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BottomTabNav } from '../bottom-tab-nav';
import ko from '@/lib/i18n/ko';

// next/navigation 모킹 (현재 경로: /market)
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/market'),
}));

// next/link 모킹
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const nav = ko.nav as Record<string, string>;

describe('BottomTabNav', () => {
  it('모바일 네비게이션 랜드마크를 렌더링한다', () => {
    render(<BottomTabNav />);
    const navEl = screen.getByRole('navigation', { name: nav.mobileNavigation });
    expect(navEl).toBeInTheDocument();
  });

  it('5개의 탭 링크를 렌더링한다', () => {
    render(<BottomTabNav />);
    expect(screen.getAllByRole('link')).toHaveLength(5);
  });

  it('현재 경로(/market)에 해당하는 탭에 aria-current="page"를 설정한다', () => {
    render(<BottomTabNav />);
    const marketLink = screen.getByRole('link', { name: nav.market });
    expect(marketLink).toHaveAttribute('aria-current', 'page');
  });

  it('비활성 탭에는 aria-current가 없다', () => {
    render(<BottomTabNav />);
    const dashboardLink = screen.getByRole('link', { name: nav.dashboard });
    expect(dashboardLink).not.toHaveAttribute('aria-current');
  });

  it('주요 탭(마켓/포트폴리오/설정)의 텍스트 레이블을 표시한다', () => {
    render(<BottomTabNav />);
    expect(screen.getByText(nav.market)).toBeInTheDocument();
    expect(screen.getByText(nav.dashboard)).toBeInTheDocument();
    expect(screen.getByText(nav.settings)).toBeInTheDocument();
  });
});
