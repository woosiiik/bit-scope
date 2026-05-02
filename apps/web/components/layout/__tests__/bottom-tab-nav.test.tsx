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
import { BottomTabNav, mobileTabItems } from '../bottom-tab-nav';

// next/navigation 모킹
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/market'),
}));

// next/link 모킹
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe('mobileTabItems', () => {
  it('5개의 탭 항목을 포함한다', () => {
    expect(mobileTabItems).toHaveLength(5);
  });

  it('모든 항목에 label, href, icon이 있다', () => {
    mobileTabItems.forEach((item) => {
      expect(item.label).toBeTruthy();
      expect(item.href).toBeTruthy();
      expect(item.icon).toBeTruthy();
    });
  });
});

describe('BottomTabNav', () => {
  it('모바일 네비게이션을 렌더링한다', () => {
    render(<BottomTabNav />);
    const nav = screen.getByRole('navigation', { name: '모바일 네비게이션' });
    expect(nav).toBeInTheDocument();
  });

  it('모든 탭 링크를 렌더링한다', () => {
    render(<BottomTabNav />);
    mobileTabItems.forEach((item) => {
      const link = screen.getByRole('link', { name: item.ariaLabel || item.label });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', item.href);
    });
  });

  it('현재 경로에 해당하는 탭에 aria-current="page"를 설정한다', () => {
    render(<BottomTabNav />);
    // pathname이 '/market'으로 모킹되어 있음
    const marketLink = screen.getByRole('link', { name: '실시간 마켓 시세' });
    expect(marketLink).toHaveAttribute('aria-current', 'page');
  });

  it('비활성 탭에는 aria-current가 없다', () => {
    render(<BottomTabNav />);
    const dashboardLink = screen.getByRole('link', { name: '포트폴리오 대시보드' });
    expect(dashboardLink).not.toHaveAttribute('aria-current');
  });

  it('각 탭에 텍스트 레이블을 표시한다', () => {
    render(<BottomTabNav />);
    mobileTabItems.forEach((item) => {
      expect(screen.getByText(item.label)).toBeInTheDocument();
    });
  });
});
