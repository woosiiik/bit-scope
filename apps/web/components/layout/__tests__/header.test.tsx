/**
 * Header 컴포넌트 단위 테스트
 *
 * 모바일 햄버거(MobileNavDrawer) 추가 후에도 헤더의 기존 우측 액션 영역
 * (언어 전환 / 테마 토글 / 지갑 버튼)이 유지되는지 회귀 검증한다.
 *
 * @see 요구사항 R1.1 (햄버거 진입점), R1.6 (우측 액션 유지), R6.1 (PC 무변경)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from '../header';
import ko from '@/lib/i18n/ko';

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

// next-themes 모킹
vi.mock('next-themes', () => ({
  useTheme: vi.fn(() => ({ theme: 'light', setTheme: vi.fn() })),
}));

// RainbowKit ConnectButton 모킹
vi.mock('@rainbow-me/rainbowkit', () => ({
  ConnectButton: ({ label }: { label?: string }) => (
    <button type="button" data-testid="wallet-button">{label ?? 'Connect Wallet'}</button>
  ),
}));

// useSignalAuth 모킹 (드로어 의존성)
vi.mock('@/hooks/useSignal', () => ({
  useSignalAuth: () => ({
    isAuthenticated: false,
    isReady: true,
    token: null,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

const nav = ko.nav as Record<string, string>;

describe('Header', () => {
  it('banner 랜드마크를 렌더링한다', () => {
    render(<Header />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('모바일 햄버거 트리거를 렌더링한다', () => {
    render(<Header />);
    expect(screen.getByRole('button', { name: nav.menuOpen })).toBeInTheDocument();
  });

  it('우측 액션 영역(언어 전환/테마 토글/지갑)을 유지한다', () => {
    render(<Header />);
    // 언어 전환 트리거
    expect(screen.getByRole('button', { name: ko.settings.language })).toBeInTheDocument();
    // 테마 토글 트리거
    expect(screen.getByRole('button', { name: '테마 변경' })).toBeInTheDocument();
    // 지갑 버튼
    expect(screen.getByTestId('wallet-button')).toBeInTheDocument();
  });

  it('초기 상태에서 드로어(dialog)는 마운트되지 않는다', () => {
    render(<Header />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
