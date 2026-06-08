/**
 * MobileNavDrawer 컴포넌트 단위 테스트
 *
 * 모바일 햄버거 버튼과 슬라이드 드로어의 렌더링, 전체 메뉴 노출,
 * 활성 상태, 시그널 히든 메뉴, 닫기 동작, 접근성(ARIA)을 검증한다.
 *
 * @see 요구사항 R1 (햄버거 진입점), R2 (드로어 전체 메뉴), R3 (닫기), R4 (접근성)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileNavDrawer } from '../mobile-nav-drawer';
import { NAV_ITEMS } from '../sidebar-nav';
import ko from '@/lib/i18n/ko';

// next/navigation 모킹
const usePathnameMock = vi.fn(() => '/market');
vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
}));

// next/link 모킹 (onClick 등 props 전달)
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// useSignalAuth 모킹 (기본: 비인증)
const useSignalAuthMock = vi.fn(() => ({
  isAuthenticated: false,
  isReady: true,
  token: null,
  login: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('@/hooks/useSignal', () => ({
  useSignalAuth: () => useSignalAuthMock(),
}));

const nav = ko.nav as Record<string, string>;

/** 햄버거 버튼을 클릭해 드로어를 연다 */
function openDrawer() {
  fireEvent.click(screen.getByRole('button', { name: nav.menuOpen }));
}

beforeEach(() => {
  usePathnameMock.mockReturnValue('/market');
  useSignalAuthMock.mockReturnValue({
    isAuthenticated: false,
    isReady: true,
    token: null,
    login: vi.fn(),
    logout: vi.fn(),
  });
});

describe('MobileNavDrawer - 햄버거 트리거 (R1)', () => {
  it('햄버거 버튼이 aria-label과 초기 aria-expanded="false"를 가진다', () => {
    render(<MobileNavDrawer />);
    const trigger = screen.getByRole('button', { name: nav.menuOpen });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('초기 상태에서는 드로어(dialog)가 마운트되지 않는다', () => {
    render(<MobileNavDrawer />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('MobileNavDrawer - 드로어 열기 및 메뉴 (R2, R4)', () => {
  it('햄버거 클릭 시 드로어가 열리고 dialog 역할과 접근 가능한 이름을 가진다', () => {
    render(<MobileNavDrawer />);
    openDrawer();
    const dialog = screen.getByRole('dialog', { name: nav.menuTitle });
    expect(dialog).toBeInTheDocument();
    // 드로어가 열리면 배경(트리거 포함)이 inert 처리되므로 hidden 요소까지 조회한다(R4.7)
    expect(screen.getByRole('button', { name: nav.menuOpen, hidden: true })).toHaveAttribute('aria-expanded', 'true');
  });

  it('NAV_ITEMS 전 항목 링크를 드로어에 렌더링한다', () => {
    render(<MobileNavDrawer />);
    openDrawer();
    NAV_ITEMS.forEach((item) => {
      const link = screen.getByRole('link', { name: nav[item.labelKey] });
      expect(link).toHaveAttribute('href', item.href);
    });
    // 비인증 상태이므로 시그널 링크는 없고 NAV_ITEMS 수와 일치
    expect(screen.getAllByRole('link')).toHaveLength(NAV_ITEMS.length);
  });

  it('현재 경로(/market)에 해당하는 항목에 aria-current="page"를 부여한다', () => {
    render(<MobileNavDrawer />);
    openDrawer();
    expect(screen.getByRole('link', { name: nav.market })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: nav.news })).not.toHaveAttribute('aria-current');
  });
});

describe('MobileNavDrawer - 시그널 히든 메뉴 (R2.3)', () => {
  it('시그널 인증 시 /signal 링크를 노출한다', () => {
    useSignalAuthMock.mockReturnValue({
      isAuthenticated: true,
      isReady: true,
      token: 'tok',
      login: vi.fn(),
      logout: vi.fn(),
    });
    render(<MobileNavDrawer />);
    openDrawer();
    const signalLink = screen.getByRole('link', { name: nav.signalMenu });
    expect(signalLink).toHaveAttribute('href', '/signal');
    expect(screen.getAllByRole('link')).toHaveLength(NAV_ITEMS.length + 1);
  });

  it('비인증 시 /signal 링크를 노출하지 않는다', () => {
    render(<MobileNavDrawer />);
    openDrawer();
    expect(screen.queryByRole('link', { name: nav.signalMenu })).not.toBeInTheDocument();
  });
});

describe('MobileNavDrawer - 닫기 동작 (R3)', () => {
  it('메뉴 링크 선택 시 드로어가 닫힌다', () => {
    render(<MobileNavDrawer />);
    openDrawer();
    fireEvent.click(screen.getByRole('link', { name: nav.news }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('닫기(X) 버튼으로 드로어를 닫는다', () => {
    render(<MobileNavDrawer />);
    openDrawer();
    fireEvent.click(screen.getByRole('button', { name: nav.menuClose }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ESC 키로 드로어를 닫는다', () => {
    render(<MobileNavDrawer />);
    openDrawer();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
