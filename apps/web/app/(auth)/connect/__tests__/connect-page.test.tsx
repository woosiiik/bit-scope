/**
 * 지갑 연결 페이지 단위 테스트
 *
 * 지갑 연결 페이지의 렌더링, MetaMask 미설치 안내,
 * 연결 완료 후 리다이렉트 등을 검증한다.
 *
 * @see 요구사항 8.1 (Web3 지갑 연결 인증)
 * @see 요구사항 8.2 (지갑 주소를 사용자 식별자로 사용)
 * @see 요구사항 8.3 (MetaMask 미설치 시 안내)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConnectPage from '../page';

// next/navigation 모킹
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
  }),
  usePathname: vi.fn(() => '/connect'),
}));

// next-themes 모킹
vi.mock('next-themes', () => ({
  useTheme: vi.fn(() => ({
    theme: 'light',
    setTheme: vi.fn(),
  })),
}));

// useWalletAuth 모킹 변수 (테스트별로 조정 가능)
const mockWallet = {
  address: '',
  chainId: 0,
  isConnected: false,
};
let mockIsWalletAvailable = true;
const mockConnect = vi.fn();

vi.mock('@/hooks/useWalletAuth', () => ({
  useWalletAuth: () => ({
    wallet: mockWallet,
    connect: mockConnect,
    disconnect: vi.fn(),
    signMessage: vi.fn(),
    isConnecting: false,
    isMetaMaskInstalled: mockIsWalletAvailable,
    isWalletAvailable: mockIsWalletAvailable,
    metaMaskInstallUrl: 'https://metamask.io/download/',
    walletChangeStatus: null,
    dismissWalletChange: vi.fn(),
  }),
}));

// @rainbow-me/rainbowkit 모킹
vi.mock('@rainbow-me/rainbowkit', () => ({
  ConnectButton: ({ label }: { label?: string }) => (
    <button type="button" data-testid="rainbowkit-connect">
      {label || 'Connect Wallet'}
    </button>
  ),
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

describe('ConnectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWallet.address = '';
    mockWallet.isConnected = false;
    mockIsWalletAvailable = true;
  });

  it('페이지 제목과 설명을 렌더링한다', () => {
    render(<ConnectPage />);

    expect(screen.getByText('지갑을 연결하세요')).toBeInTheDocument();
    expect(
      screen.getByText(
        /MetaMask 등 Web3 지갑을 연결하여 BitScope를 시작하세요/,
      ),
    ).toBeInTheDocument();
  });

  it('BitScope 로고와 서비스명을 표시한다', () => {
    render(<ConnectPage />);

    expect(screen.getByText('BitScope')).toBeInTheDocument();
  });

  it('Web3 지갑이 있을 때 RainbowKit ConnectButton을 표시한다', () => {
    mockIsWalletAvailable = true;

    render(<ConnectPage />);

    const connectButton = screen.getByTestId('rainbowkit-connect');
    expect(connectButton).toBeInTheDocument();
    expect(connectButton).toHaveTextContent('지갑 연결하기');
  });

  it('Web3 지갑이 없을 때 MetaMask 설치 안내를 표시한다', () => {
    mockIsWalletAvailable = false;

    render(<ConnectPage />);

    expect(screen.getByText('Web3 지갑이 필요합니다')).toBeInTheDocument();
    expect(
      screen.getByText(/MetaMask와 같은 Web3 지갑이 필요합니다/),
    ).toBeInTheDocument();

    const installLink = screen.getByRole('link', {
      name: 'MetaMask 설치하기',
    });
    expect(installLink).toBeInTheDocument();
    expect(installLink).toHaveAttribute(
      'href',
      'https://metamask.io/download/',
    );
    expect(installLink).toHaveAttribute('target', '_blank');
    expect(installLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('보안 안내를 표시한다', () => {
    mockIsWalletAvailable = true;

    render(<ConnectPage />);

    expect(screen.getByText('안전한 서비스')).toBeInTheDocument();
    expect(
      screen.getByText(
        /API Key는 브라우저에서 암호화되어 저장되며, 서버로 전송되지 않습니다/,
      ),
    ).toBeInTheDocument();
  });

  it('서비스 특징 카드(포트폴리오, 실시간, 보안)를 렌더링한다', () => {
    render(<ConnectPage />);

    expect(screen.getByText('통합 포트폴리오')).toBeInTheDocument();
    expect(
      screen.getByText(/업비트, 빗썸, 코인원의 자산을 한눈에 확인/),
    ).toBeInTheDocument();

    expect(screen.getByText('실시간 시세')).toBeInTheDocument();
    expect(
      screen.getByText(/거래소 실시간 시세와 김치 프리미엄을 모니터링/),
    ).toBeInTheDocument();

    expect(screen.getByText('안전한 보안')).toBeInTheDocument();
    expect(
      screen.getByText(/API Key가 서버에 전송되지 않는 Zero-Knowledge 구조/),
    ).toBeInTheDocument();
  });

  it('지갑 연결 완료 시 대시보드로 리다이렉트한다', () => {
    mockWallet.address = '0x1234abcd';
    mockWallet.isConnected = true;

    render(<ConnectPage />);

    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('지갑 미연결 시 리다이렉트하지 않는다', () => {
    mockWallet.address = '';
    mockWallet.isConnected = false;

    render(<ConnectPage />);

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('main 영역에 role="main"을 설정한다', () => {
    render(<ConnectPage />);

    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();
  });

  it('하단 푸터를 렌더링한다', () => {
    render(<ConnectPage />);

    expect(
      screen.getByText(
        /한국 암호화폐 거래소 포트폴리오 통합 조회 서비스/,
      ),
    ).toBeInTheDocument();
  });
});
