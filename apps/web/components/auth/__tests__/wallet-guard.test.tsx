/**
 * WalletGuard 컴포넌트 단위 테스트
 *
 * 지갑 연결 상태에 따른 라우트 가드 동작을 검증한다.
 * - 연결 시: children 렌더링
 * - 미연결 + redirect 모드: /connect로 리다이렉트
 * - 미연결 + inline 모드: 안내 메시지 표시
 * - 연결 중: 로딩 스피너 표시
 *
 * @see 요구사항 8.1 (Web3 지갑 기반 인증)
 * @see 요구사항 8.2 (지갑 주소를 사용자 식별자로 사용)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WalletGuard } from '../wallet-guard';

// next/navigation 모킹
const mockReplace = vi.fn();
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
  }),
}));

// 모킹 상태 변수
let mockIsConnected = false;
let mockIsConnecting = false;
let mockAddress: string | undefined = undefined;

vi.mock('@/hooks/useWalletAuth', () => ({
  useWalletAuth: () => ({
    wallet: {
      address: mockAddress ?? '',
      chainId: mockIsConnected ? 1 : 0,
      isConnected: mockIsConnected,
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
    signMessage: vi.fn(),
    isConnecting: mockIsConnecting,
    isMetaMaskInstalled: true,
    isWalletAvailable: true,
    metaMaskInstallUrl: 'https://metamask.io/download/',
    walletChangeStatus: null,
    dismissWalletChange: vi.fn(),
  }),
}));

// @rainbow-me/rainbowkit 모킹
vi.mock('@rainbow-me/rainbowkit', () => ({
  ConnectButton: () => <button type="button">Connect</button>,
  useConnectModal: vi.fn(() => ({
    openConnectModal: vi.fn(),
  })),
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

describe('WalletGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConnected = false;
    mockIsConnecting = false;
    mockAddress = undefined;
  });

  describe('지갑이 연결된 경우', () => {
    beforeEach(() => {
      mockIsConnected = true;
      mockAddress = '0x1234abcd';
    });

    it('children을 렌더링한다', async () => {
      render(
        <WalletGuard>
          <div data-testid="protected-content">보호된 콘텐츠</div>
        </WalletGuard>,
      );

      // 클라이언트 마운트 후 children이 표시되어야 한다
      // useEffect가 실행되도록 기다린다
      await vi.waitFor(() => {
        expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      });
      expect(screen.getByText('보호된 콘텐츠')).toBeInTheDocument();
    });

    it('리다이렉트하지 않는다', async () => {
      render(
        <WalletGuard mode="redirect">
          <div>콘텐츠</div>
        </WalletGuard>,
      );

      await vi.waitFor(() => {
        expect(screen.getByText('콘텐츠')).toBeInTheDocument();
      });
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  describe('연결 진행 중인 경우', () => {
    beforeEach(() => {
      mockIsConnecting = true;
      mockIsConnected = false;
    });

    it('로딩 스피너를 표시한다', () => {
      render(
        <WalletGuard>
          <div data-testid="protected-content">보호된 콘텐츠</div>
        </WalletGuard>,
      );

      // 로딩 상태를 표시해야 한다
      const statusElements = screen.getAllByRole('status');
      expect(statusElements.length).toBeGreaterThan(0);
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });
  });

  describe('지갑 미연결 + redirect 모드', () => {
    beforeEach(() => {
      mockIsConnected = false;
      mockAddress = undefined;
    });

    it('/connect로 리다이렉트한다', async () => {
      render(
        <WalletGuard mode="redirect">
          <div data-testid="protected-content">보호된 콘텐츠</div>
        </WalletGuard>,
      );

      await vi.waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/connect');
      });
    });

    it('children을 렌더링하지 않는다', async () => {
      render(
        <WalletGuard mode="redirect">
          <div data-testid="protected-content">보호된 콘텐츠</div>
        </WalletGuard>,
      );

      // 리다이렉트 진행 중이므로 children이 표시되지 않아야 한다
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });
  });

  describe('지갑 미연결 + inline 모드', () => {
    beforeEach(() => {
      mockIsConnected = false;
      mockAddress = undefined;
    });

    it('인라인 안내 메시지를 표시한다', async () => {
      render(
        <WalletGuard mode="inline">
          <div data-testid="protected-content">보호된 콘텐츠</div>
        </WalletGuard>,
      );

      await vi.waitFor(() => {
        expect(
          screen.getByText('지갑 연결이 필요합니다'),
        ).toBeInTheDocument();
      });
      expect(
        screen.getByText(/이 페이지를 이용하려면 Web3 지갑을 연결해주세요/),
      ).toBeInTheDocument();
    });

    it('children을 렌더링하지 않는다', async () => {
      render(
        <WalletGuard mode="inline">
          <div data-testid="protected-content">보호된 콘텐츠</div>
        </WalletGuard>,
      );

      await vi.waitFor(() => {
        expect(
          screen.getByText('지갑 연결이 필요합니다'),
        ).toBeInTheDocument();
      });
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('지갑 연결 버튼을 표시하고 클릭 시 /connect로 이동한다', async () => {
      render(
        <WalletGuard mode="inline">
          <div data-testid="protected-content">보호된 콘텐츠</div>
        </WalletGuard>,
      );

      await vi.waitFor(() => {
        expect(
          screen.getByText('지갑 연결하러 가기'),
        ).toBeInTheDocument();
      });

      const connectButton = screen.getByRole('button', {
        name: '지갑 연결하러 가기',
      });
      fireEvent.click(connectButton);

      expect(mockPush).toHaveBeenCalledWith('/connect');
    });

    it('리다이렉트하지 않는다', async () => {
      render(
        <WalletGuard mode="inline">
          <div>콘텐츠</div>
        </WalletGuard>,
      );

      await vi.waitFor(() => {
        expect(
          screen.getByText('지갑 연결이 필요합니다'),
        ).toBeInTheDocument();
      });
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  describe('기본 모드', () => {
    it('mode 미지정 시 redirect 모드가 기본값이다', async () => {
      mockIsConnected = false;
      mockAddress = undefined;

      render(
        <WalletGuard>
          <div data-testid="protected-content">보호된 콘텐츠</div>
        </WalletGuard>,
      );

      await vi.waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/connect');
      });
    });
  });
});
