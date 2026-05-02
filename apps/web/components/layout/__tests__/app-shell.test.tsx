/**
 * AppShell 컴포넌트 단위 테스트
 *
 * 반응형 앱 셸의 구조(사이드바, 헤더, 하단 탭)와
 * 접근성 속성을 검증한다.
 *
 * @see 요구사항 9.1 (모바일 최적화)
 * @see 요구사항 9.2 (데스크톱 다중 패널)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppShell } from '../app-shell';

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
  useTheme: vi.fn(() => ({
    theme: 'light',
    setTheme: vi.fn(),
  })),
}));

// @rainbow-me/rainbowkit 모킹 (ESM/CJS 호환성 문제 방지)
vi.mock('@rainbow-me/rainbowkit', () => ({
  ConnectButton: ({ label }: { label?: string }) => (
    <button type="button">{label || 'Connect Wallet'}</button>
  ),
}));

// wagmi 모킹
vi.mock('wagmi', () => ({
  useAccount: vi.fn(() => ({
    address: undefined,
    isConnected: false,
    chainId: undefined,
    isConnecting: false,
  })),
  useConnect: vi.fn(() => ({
    connectAsync: vi.fn(),
    isPending: false,
  })),
  useDisconnect: vi.fn(() => ({
    disconnect: vi.fn(),
  })),
  useSignMessage: vi.fn(() => ({
    signMessageAsync: vi.fn(),
  })),
}));

// @rainbow-me/rainbowkit useConnectModal 모킹
vi.mock('@rainbow-me/rainbowkit', async () => ({
  ConnectButton: ({ label }: { label?: string }) => (
    <button type="button">{label || 'Connect Wallet'}</button>
  ),
  useConnectModal: vi.fn(() => ({
    openConnectModal: vi.fn(),
  })),
}));

describe('AppShell', () => {
  it('자식 컨텐츠를 렌더링한다', () => {
    render(
      <AppShell>
        <div data-testid="test-content">테스트 컨텐츠</div>
      </AppShell>,
    );
    expect(screen.getByTestId('test-content')).toBeInTheDocument();
    expect(screen.getByText('테스트 컨텐츠')).toBeInTheDocument();
  });

  it('메인 컨텐츠 영역에 role="main"을 설정한다', () => {
    render(
      <AppShell>
        <div>컨텐츠</div>
      </AppShell>,
    );
    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();
  });

  it('메인 컨텐츠에 id="main-content"를 설정한다', () => {
    render(
      <AppShell>
        <div>컨텐츠</div>
      </AppShell>,
    );
    const main = document.getElementById('main-content');
    expect(main).toBeInTheDocument();
  });

  it('사이드바를 렌더링한다', () => {
    render(
      <AppShell>
        <div>컨텐츠</div>
      </AppShell>,
    );
    const sidebar = screen.getByRole('complementary', { name: '메인 네비게이션' });
    expect(sidebar).toBeInTheDocument();
  });

  it('헤더를 렌더링한다', () => {
    render(
      <AppShell>
        <div>컨텐츠</div>
      </AppShell>,
    );
    const header = screen.getByRole('banner');
    expect(header).toBeInTheDocument();
  });

  it('모바일 하단 탭을 렌더링한다', () => {
    render(
      <AppShell>
        <div>컨텐츠</div>
      </AppShell>,
    );
    const nav = screen.getByRole('navigation', { name: '모바일 네비게이션' });
    expect(nav).toBeInTheDocument();
  });
});
