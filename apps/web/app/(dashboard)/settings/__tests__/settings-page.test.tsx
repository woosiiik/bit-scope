/**
 * API Key 등록/관리 페이지 (Settings) 단위 테스트
 *
 * API Key 등록 폼, 유효성 검증, 암호화 저장,
 * 등록된 키 목록 조회, 삭제, 가이드 표시 등
 * 전체 설정 페이지의 기능을 검증한다.
 *
 * @see 요구사항 1.1 ~ 1.9 (거래소 API 키 관리)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsPage from '../page';

// next/navigation 모킹
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
  }),
  usePathname: vi.fn(() => '/settings'),
}));

// next-themes 모킹
vi.mock('next-themes', () => ({
  useTheme: vi.fn(() => ({
    theme: 'light',
    setTheme: vi.fn(),
  })),
}));

// useWalletAuth 모킹 변수
const mockWallet = {
  address: '0xabcdef1234567890abcdef1234567890abcdef12',
  chainId: 1,
  isConnected: true,
};
const mockSignMessage = vi.fn().mockResolvedValue('0xmocksignature');

vi.mock('@/hooks/useWalletAuth', () => ({
  useWalletAuth: () => ({
    wallet: mockWallet,
    connect: vi.fn(),
    disconnect: vi.fn(),
    signMessage: mockSignMessage,
    isConnecting: false,
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
    address: '0xabcdef1234567890abcdef1234567890abcdef12',
    isConnected: true,
    chainId: 1,
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
    signMessageAsync: mockSignMessage,
  })),
}));

// encryption-service 모킹 변수
const mockGetRegisteredExchanges = vi.fn().mockReturnValue([]);
const mockLoadEncryptedKey = vi.fn().mockReturnValue(null);
const mockGetCachedEncryptionKey = vi.fn().mockReturnValue('mockencryptionkey1234567890abcdef1234567890abcdef1234567890abcdef12');
const mockCacheEncryptionKey = vi.fn();
const mockEncryptApiKey = vi.fn().mockReturnValue({
  encryptedAccessKey: 'encrypted_access',
  encryptedSecretKey: 'encrypted_secret',
  iv: 'mock_iv',
});
const mockDecryptApiKey = vi.fn().mockReturnValue({
  accessKey: 'test-access-key-12345678',
  secretKey: 'test-secret-key-abcdefgh',
});
const mockStoreEncryptedKey = vi.fn();
const mockRemoveEncryptedKey = vi.fn();

vi.mock('@/lib/crypto/encryption-service', () => ({
  getRegisteredExchanges: (...args: unknown[]) => mockGetRegisteredExchanges(...args),
  loadEncryptedKey: (...args: unknown[]) => mockLoadEncryptedKey(...args),
  getCachedEncryptionKey: (...args: unknown[]) => mockGetCachedEncryptionKey(...args),
  cacheEncryptionKey: (...args: unknown[]) => mockCacheEncryptionKey(...args),
  encryptApiKey: (...args: unknown[]) => mockEncryptApiKey(...args),
  decryptApiKey: (...args: unknown[]) => mockDecryptApiKey(...args),
  storeEncryptedKey: (...args: unknown[]) => mockStoreEncryptedKey(...args),
  removeEncryptedKey: (...args: unknown[]) => mockRemoveEncryptedKey(...args),
}));

// key-derivation 모킹
const mockDeriveEncryptionKey = vi.fn().mockResolvedValue({
  walletAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
  nonce: 'mock-nonce-uuid',
  signatureMessage: 'BitScope:encrypt:0xabcdef...:mock-nonce-uuid',
  signature: '0xmocksignature',
  derivedKey: 'mockencryptionkey1234567890abcdef1234567890abcdef1234567890abcdef12',
});

vi.mock('@/lib/crypto/key-derivation', () => ({
  deriveEncryptionKey: (...args: unknown[]) => mockDeriveEncryptionKey(...args),
}));

// signer-factory 모킹
const mockValidateApiKey = vi.fn().mockResolvedValue({
  isValid: true,
  isReadOnly: true,
  errorMessage: undefined,
});

const mockCreateSigner = vi.fn().mockReturnValue({
  signRequest: vi.fn(),
  validateApiKey: mockValidateApiKey,
  getExchangeType: vi.fn().mockReturnValue('upbit'),
});

vi.mock('@/lib/exchange/signer-factory', () => ({
  createSigner: (...args: unknown[]) => mockCreateSigner(...args),
}));

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRegisteredExchanges.mockReturnValue([]);
    mockLoadEncryptedKey.mockReturnValue(null);
    mockGetCachedEncryptionKey.mockReturnValue('mockencryptionkey1234567890abcdef1234567890abcdef1234567890abcdef12');
    mockValidateApiKey.mockResolvedValue({
      isValid: true,
      isReadOnly: true,
      errorMessage: undefined,
    });
    // deriveEncryptionKey의 기본 구현을 매 테스트마다 복원
    mockDeriveEncryptionKey.mockResolvedValue({
      walletAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
      nonce: 'mock-nonce-uuid',
      signatureMessage: 'BitScope:encrypt:0xabcdef...:mock-nonce-uuid',
      signature: '0xmocksignature',
      derivedKey: 'mockencryptionkey1234567890abcdef1234567890abcdef1234567890abcdef12',
    });
  });

  // ============================================================
  // 기본 렌더링 테스트
  // ============================================================

  it('페이지 제목과 설명을 렌더링한다', () => {
    render(<SettingsPage />);

    expect(screen.getByText('API 키 관리')).toBeInTheDocument();
    expect(
      screen.getByText(/거래소 API 키를 등록하고 관리합니다/),
    ).toBeInTheDocument();
  });

  it('보안 안내를 표시한다', () => {
    render(<SettingsPage />);

    expect(screen.getByText('보안 안내')).toBeInTheDocument();
    expect(
      screen.getByText(/API 키는 브라우저에서 암호화되어 저장되며, 서버로 전송되지 않습니다/),
    ).toBeInTheDocument();
  });

  it('등록된 키가 없을 때 빈 상태 메시지를 표시한다', () => {
    render(<SettingsPage />);

    expect(screen.getByText('등록된 API 키가 없습니다.')).toBeInTheDocument();
    expect(
      screen.getByText(/거래소 API 키를 등록하면 포트폴리오를 조회/),
    ).toBeInTheDocument();
  });

  it('API 키 발급 가이드 섹션을 표시한다', () => {
    render(<SettingsPage />);

    expect(screen.getByText('API 키 발급 방법')).toBeInTheDocument();
    expect(
      screen.getByText(/각 거래소의 API 키 발급 방법을 확인/),
    ).toBeInTheDocument();
  });

  // ============================================================
  // API Key 등록 폼 테스트 (요구사항 1.1)
  // ============================================================

  it('새 API 키 등록 버튼을 클릭하면 등록 폼을 표시한다', () => {
    render(<SettingsPage />);

    // 빈 상태에서의 등록 버튼 클릭
    const registerButtons = screen.getAllByText('새 API 키 등록');
    fireEvent.click(registerButtons[registerButtons.length - 1]);

    // 거래소 선택 섹션
    expect(screen.getByText('거래소 선택')).toBeInTheDocument();
    // 업비트/빗썸/코인원 선택 버튼
    expect(screen.getByRole('radio', { name: '업비트' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '빗썸' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '코인원' })).toBeInTheDocument();

    // Access Key / Secret Key 입력 필드
    expect(screen.getByLabelText('Access Key')).toBeInTheDocument();
    expect(screen.getByLabelText('Secret Key')).toBeInTheDocument();
  });

  it('3개 거래소(업비트, 빗썸, 코인원) API 키 입력 폼을 제공한다', () => {
    render(<SettingsPage />);

    const registerButtons = screen.getAllByText('새 API 키 등록');
    fireEvent.click(registerButtons[registerButtons.length - 1]);

    // 3개 거래소가 모두 선택 가능한지 확인
    const radioGroup = screen.getByRole('radiogroup');
    expect(radioGroup).toBeInTheDocument();

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
  });

  it('거래소 선택 후 선택 상태가 반영된다', () => {
    render(<SettingsPage />);

    const registerButtons = screen.getAllByText('새 API 키 등록');
    fireEvent.click(registerButtons[registerButtons.length - 1]);

    const upbitRadio = screen.getByRole('radio', { name: '업비트' });
    fireEvent.click(upbitRadio);

    expect(upbitRadio).toHaveAttribute('aria-checked', 'true');
  });

  it('등록 버튼은 모든 필드가 입력되기 전에는 비활성 상태이다', () => {
    render(<SettingsPage />);

    const registerButtons = screen.getAllByText('새 API 키 등록');
    fireEvent.click(registerButtons[registerButtons.length - 1]);

    const submitButton = screen.getByRole('button', { name: '등록' });
    expect(submitButton).toBeDisabled();
  });

  it('모든 필드 입력 후 등록 버튼이 활성화된다', () => {
    render(<SettingsPage />);

    const registerButtons = screen.getAllByText('새 API 키 등록');
    fireEvent.click(registerButtons[registerButtons.length - 1]);

    // 거래소 선택
    fireEvent.click(screen.getByRole('radio', { name: '업비트' }));

    // Access Key 입력
    const accessKeyInput = screen.getByLabelText('Access Key');
    fireEvent.change(accessKeyInput, { target: { value: 'test-access-key' } });

    // Secret Key 입력
    const secretKeyInput = screen.getByLabelText('Secret Key');
    fireEvent.change(secretKeyInput, { target: { value: 'test-secret-key' } });

    const submitButton = screen.getByRole('button', { name: '등록' });
    expect(submitButton).toBeEnabled();
  });

  it('취소 버튼을 클릭하면 등록 폼이 닫힌다', () => {
    render(<SettingsPage />);

    const registerButtons = screen.getAllByText('새 API 키 등록');
    fireEvent.click(registerButtons[registerButtons.length - 1]);

    // 폼이 열려 있는지 확인
    expect(screen.getByLabelText('Access Key')).toBeInTheDocument();

    // 취소 클릭
    const cancelButton = screen.getByRole('button', { name: '취소' });
    fireEvent.click(cancelButton);

    // 폼이 닫혔는지 확인
    expect(screen.queryByLabelText('Access Key')).not.toBeInTheDocument();
  });

  // ============================================================
  // Secret Key 마스킹 테스트 (요구사항 1.6)
  // ============================================================

  it('Secret Key 입력 필드는 기본적으로 password 타입이다', () => {
    render(<SettingsPage />);

    const registerButtons = screen.getAllByText('새 API 키 등록');
    fireEvent.click(registerButtons[registerButtons.length - 1]);

    const secretKeyInput = screen.getByLabelText('Secret Key');
    expect(secretKeyInput).toHaveAttribute('type', 'password');
  });

  it('눈 아이콘 클릭으로 Secret Key 표시/숨김을 토글한다', () => {
    render(<SettingsPage />);

    const registerButtons = screen.getAllByText('새 API 키 등록');
    fireEvent.click(registerButtons[registerButtons.length - 1]);

    const secretKeyInput = screen.getByLabelText('Secret Key');
    expect(secretKeyInput).toHaveAttribute('type', 'password');

    // 눈 아이콘 클릭 (Secret Key 보기)
    const toggleButton = screen.getByLabelText('Secret Key 보기');
    fireEvent.click(toggleButton);

    expect(secretKeyInput).toHaveAttribute('type', 'text');
  });

  // ============================================================
  // API Key 유효성 검증 및 등록 흐름 테스트 (요구사항 1.2, 1.4)
  // ============================================================

  it('API Key 등록 시 유효성 검증과 암호화 저장이 순서대로 수행된다', async () => {
    render(<SettingsPage />);

    // 등록 폼 열기
    const registerButtons = screen.getAllByText('새 API 키 등록');
    fireEvent.click(registerButtons[registerButtons.length - 1]);

    // 폼 입력
    fireEvent.click(screen.getByRole('radio', { name: '업비트' }));
    fireEvent.change(screen.getByLabelText('Access Key'), { target: { value: 'my-access-key' } });
    fireEvent.change(screen.getByLabelText('Secret Key'), { target: { value: 'my-secret-key' } });

    // 등록 버튼 클릭
    const submitButton = screen.getByRole('button', { name: '등록' });
    fireEvent.click(submitButton);

    // 유효성 검증이 수행되었는지 확인
    await waitFor(() => {
      expect(mockCreateSigner).toHaveBeenCalledWith('upbit');
      expect(mockValidateApiKey).toHaveBeenCalledWith({
        accessKey: 'my-access-key',
        secretKey: 'my-secret-key',
      });
    });

    // 암호화 키가 확보되었는지 확인
    await waitFor(() => {
      expect(mockGetCachedEncryptionKey).toHaveBeenCalled();
    });

    // 암호화 후 localStorage에 저장되었는지 확인
    await waitFor(() => {
      expect(mockEncryptApiKey).toHaveBeenCalled();
      expect(mockStoreEncryptedKey).toHaveBeenCalled();
    });
  });

  it('검증 성공 시 성공 알림을 표시한다', async () => {
    render(<SettingsPage />);

    // 등록 폼 열기
    const registerButtons = screen.getAllByText('새 API 키 등록');
    fireEvent.click(registerButtons[registerButtons.length - 1]);

    // 폼 입력
    fireEvent.click(screen.getByRole('radio', { name: '업비트' }));
    fireEvent.change(screen.getByLabelText('Access Key'), { target: { value: 'valid-access' } });
    fireEvent.change(screen.getByLabelText('Secret Key'), { target: { value: 'valid-secret' } });

    // 등록
    fireEvent.click(screen.getByRole('button', { name: '등록' }));

    await waitFor(() => {
      expect(screen.getByText('API 키가 성공적으로 등록되었습니다.')).toBeInTheDocument();
    });
  });

  // ============================================================
  // 유효성 검증 실패 테스트 (요구사항 1.3)
  // ============================================================

  it('API Key 검증 실패 시 오류 메시지를 표시한다', async () => {
    mockValidateApiKey.mockResolvedValue({
      isValid: false,
      isReadOnly: false,
      errorMessage: '잘못된 API 키입니다. 키를 확인해주세요.',
    });

    render(<SettingsPage />);

    const registerButtons = screen.getAllByText('새 API 키 등록');
    fireEvent.click(registerButtons[registerButtons.length - 1]);

    fireEvent.click(screen.getByRole('radio', { name: '업비트' }));
    fireEvent.change(screen.getByLabelText('Access Key'), { target: { value: 'invalid-key' } });
    fireEvent.change(screen.getByLabelText('Secret Key'), { target: { value: 'invalid-secret' } });

    fireEvent.click(screen.getByRole('button', { name: '등록' }));

    // 오류 메시지가 알림 배너와 폼 내 유효성 결과에 표시될 수 있으므로 getAllByText 사용
    await waitFor(() => {
      const errorMessages = screen.getAllByText('잘못된 API 키입니다. 키를 확인해주세요.');
      expect(errorMessages.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================
  // Read-Only 경고 테스트 (요구사항 1.7)
  // ============================================================

  it('Read-Only 권한이 아닌 키 등록 시 보안 경고를 표시한다', async () => {
    mockValidateApiKey.mockResolvedValue({
      isValid: true,
      isReadOnly: false,
      errorMessage: undefined,
    });

    // 암호화 키 확보를 지연시켜 Read-Only 경고가 표시되는 동안 폼이 유지되도록 한다
    mockGetCachedEncryptionKey.mockReturnValue(null);
    let resolveDerivation: ((value: unknown) => void) | undefined;
    mockDeriveEncryptionKey.mockImplementation(() => new Promise((resolve) => {
      resolveDerivation = resolve;
    }));

    render(<SettingsPage />);

    const registerButtons = screen.getAllByText('새 API 키 등록');
    fireEvent.click(registerButtons[registerButtons.length - 1]);

    fireEvent.click(screen.getByRole('radio', { name: '빗썸' }));
    fireEvent.change(screen.getByLabelText('Access Key'), { target: { value: 'full-access' } });
    fireEvent.change(screen.getByLabelText('Secret Key'), { target: { value: 'full-secret' } });

    fireEvent.click(screen.getByRole('button', { name: '등록' }));

    // 검증은 완료되었지만 암호화 키 도출 대기 중이므로 폼이 열려 있고 경고가 보임
    await waitFor(() => {
      expect(
        screen.getByText(/Read-Only 권한이 아닌 API 키가 감지되었습니다/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Read-Only\(조회 전용\) 권한의 API 키로 재발급하는 것을 강력히 권장/),
      ).toBeInTheDocument();
    });

    // 테스트 정리: 중단된 Promise를 해결하여 누수 방지
    if (resolveDerivation) {
      resolveDerivation({
        walletAddress: '0xabcdef',
        nonce: 'mock-nonce',
        signatureMessage: 'msg',
        signature: '0xsig',
        derivedKey: 'key123',
      });
    }
  });

  // ============================================================
  // 등록된 API Key 목록 테스트 (요구사항 1.9)
  // ============================================================

  it('등록된 API Key 목록을 거래소명, 등록일과 함께 표시한다', () => {
    mockGetRegisteredExchanges.mockReturnValue(['upbit']);
    mockLoadEncryptedKey.mockReturnValue({
      encryptedAccessKey: 'enc_access',
      encryptedSecretKey: 'enc_secret',
      iv: 'mock_iv',
      nonce: 'mock_nonce',
      registeredAt: '2025-01-15T09:00:00.000Z',
    });

    render(<SettingsPage />);

    // 거래소명 표시
    expect(screen.getByText('업비트')).toBeInTheDocument();
    // 등록일 표시 (날짜 포맷은 한국어)
    expect(screen.getByText(/2025년/)).toBeInTheDocument();
  });

  it('등록된 키의 마스킹된 Access Key와 Secret Key를 표시한다', () => {
    mockGetRegisteredExchanges.mockReturnValue(['upbit']);
    mockLoadEncryptedKey.mockReturnValue({
      encryptedAccessKey: 'enc_access',
      encryptedSecretKey: 'enc_secret',
      iv: 'mock_iv',
      nonce: 'mock_nonce',
      registeredAt: '2025-01-15T09:00:00.000Z',
    });
    // decryptApiKey는 마스킹용으로 호출됨
    mockDecryptApiKey.mockReturnValue({
      accessKey: 'test-access-key-12345678',
      secretKey: 'test-secret-key-abcdefgh',
    });

    render(<SettingsPage />);

    // 마스킹된 키 표시 확인 (마지막 4자만 노출)
    expect(screen.getByText(/\*\*\*\*5678/)).toBeInTheDocument();
    expect(screen.getByText(/\*\*\*\*efgh/)).toBeInTheDocument();
  });

  it('여러 거래소가 등록된 경우 모두 목록에 표시한다', () => {
    mockGetRegisteredExchanges.mockReturnValue(['upbit', 'bithumb']);
    mockLoadEncryptedKey.mockReturnValue({
      encryptedAccessKey: 'enc_access',
      encryptedSecretKey: 'enc_secret',
      iv: 'mock_iv',
      nonce: 'mock_nonce',
      registeredAt: '2025-01-15T09:00:00.000Z',
    });

    render(<SettingsPage />);

    expect(screen.getByText('업비트')).toBeInTheDocument();
    expect(screen.getByText('빗썸')).toBeInTheDocument();
  });

  // ============================================================
  // API Key 삭제 테스트 (요구사항 1.5)
  // ============================================================

  it('삭제 버튼 클릭 시 확인 다이얼로그를 표시한다', () => {
    mockGetRegisteredExchanges.mockReturnValue(['upbit']);
    mockLoadEncryptedKey.mockReturnValue({
      encryptedAccessKey: 'enc_access',
      encryptedSecretKey: 'enc_secret',
      iv: 'mock_iv',
      nonce: 'mock_nonce',
      registeredAt: '2025-01-15T09:00:00.000Z',
    });

    render(<SettingsPage />);

    // 삭제 버튼 클릭
    const deleteButton = screen.getByLabelText(/업비트.*삭제/);
    fireEvent.click(deleteButton);

    // 확인 다이얼로그 표시
    expect(screen.getByText('정말 삭제하시겠습니까?')).toBeInTheDocument();
    expect(
      screen.getByText(/이 API 키와 관련된 모든 데이터가 즉시 삭제/),
    ).toBeInTheDocument();
  });

  it('삭제 확인 시 해당 거래소의 API Key와 관련 데이터를 즉시 삭제한다', async () => {
    mockGetRegisteredExchanges.mockReturnValue(['upbit']);
    mockLoadEncryptedKey.mockReturnValue({
      encryptedAccessKey: 'enc_access',
      encryptedSecretKey: 'enc_secret',
      iv: 'mock_iv',
      nonce: 'mock_nonce',
      registeredAt: '2025-01-15T09:00:00.000Z',
    });

    render(<SettingsPage />);

    // 삭제 버튼 클릭
    const deleteButton = screen.getByLabelText(/업비트.*삭제/);
    fireEvent.click(deleteButton);

    // 삭제 확인 버튼 (destructive variant) 찾기
    // 삭제 확인 상태에서 "삭제" 텍스트가 있는 버튼은 두 개: 취소와 삭제
    const allButtons = screen.getAllByRole('button');
    const confirmButton = allButtons.find(
      (btn) => {
        const text = btn.textContent || '';
        return text.includes('삭제') && !text.includes('취소');
      }
    );
    expect(confirmButton).toBeDefined();
    fireEvent.click(confirmButton!);

    // removeEncryptedKey가 호출되었는지 확인
    await waitFor(() => {
      expect(mockRemoveEncryptedKey).toHaveBeenCalledWith(
        mockWallet.address,
        'upbit',
      );
    });
  });

  it('삭제 취소 시 다이얼로그를 닫고 키를 유지한다', () => {
    mockGetRegisteredExchanges.mockReturnValue(['upbit']);
    mockLoadEncryptedKey.mockReturnValue({
      encryptedAccessKey: 'enc_access',
      encryptedSecretKey: 'enc_secret',
      iv: 'mock_iv',
      nonce: 'mock_nonce',
      registeredAt: '2025-01-15T09:00:00.000Z',
    });

    render(<SettingsPage />);

    // 삭제 버튼 클릭
    const deleteButton = screen.getByLabelText(/업비트.*삭제/);
    fireEvent.click(deleteButton);

    // 취소 클릭
    const cancelButton = screen.getByRole('button', { name: '취소' });
    fireEvent.click(cancelButton);

    // 삭제되지 않음
    expect(mockRemoveEncryptedKey).not.toHaveBeenCalled();
    // 거래소 카드가 여전히 존재
    expect(screen.getByText('업비트')).toBeInTheDocument();
  });

  // ============================================================
  // 거래소별 API 키 발급 가이드 테스트 (요구사항 1.8)
  // ============================================================

  it('가이드 섹션 펼침/접기가 동작한다', () => {
    render(<SettingsPage />);

    const guideButton = screen.getByRole('button', {
      name: /API 키 발급 방법/,
    });
    expect(guideButton).toHaveAttribute('aria-expanded', 'false');

    // 펼치기
    fireEvent.click(guideButton);

    expect(guideButton).toHaveAttribute('aria-expanded', 'true');
    // 가이드 콘텐츠가 표시됨
    expect(screen.getByText(/업비트 > 마이페이지/)).toBeInTheDocument();
    expect(screen.getByText(/빗썸 > 고객센터/)).toBeInTheDocument();
    expect(screen.getByText(/코인원 > 개발자 센터/)).toBeInTheDocument();
  });

  it('각 거래소별 API 키 발급 가이드 링크를 제공한다', () => {
    render(<SettingsPage />);

    // 가이드 펼치기
    const guideButton = screen.getByRole('button', {
      name: /API 키 발급 방법/,
    });
    fireEvent.click(guideButton);

    // 업비트 가이드 링크
    const upbitLink = screen.getByRole('link', { name: /업비트.*API 키 발급 가이드/ });
    expect(upbitLink).toHaveAttribute('href', 'https://upbit.com/mypage/open_api_management');
    expect(upbitLink).toHaveAttribute('target', '_blank');
    expect(upbitLink).toHaveAttribute('rel', 'noopener noreferrer');

    // 빗썸 가이드 링크
    const bithumbLink = screen.getByRole('link', { name: /빗썸.*API 키 발급 가이드/ });
    expect(bithumbLink).toHaveAttribute('href', 'https://www.bithumb.com/api_support/management_api');

    // 코인원 가이드 링크
    const coinoneLink = screen.getByRole('link', { name: /코인원.*API 키 발급 가이드/ });
    expect(coinoneLink).toHaveAttribute('href', 'https://coinone.co.kr/developer/app');
  });

  // ============================================================
  // 이미 등록된 거래소 필터링 테스트
  // ============================================================

  it('이미 등록된 거래소는 등록 폼의 선택 목록에서 제외된다', () => {
    mockGetRegisteredExchanges.mockReturnValue(['upbit']);
    mockLoadEncryptedKey.mockReturnValue({
      encryptedAccessKey: 'enc_access',
      encryptedSecretKey: 'enc_secret',
      iv: 'mock_iv',
      nonce: 'mock_nonce',
      registeredAt: '2025-01-15T09:00:00.000Z',
    });

    render(<SettingsPage />);

    // 새 등록 버튼 클릭
    const registerNewButton = screen.getByRole('button', { name: '새 API 키 등록' });
    fireEvent.click(registerNewButton);

    // 업비트는 이미 등록되어 있으므로 선택 불가
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2); // 빗썸, 코인원만 표시
    expect(screen.queryByRole('radio', { name: '업비트' })).not.toBeInTheDocument();
  });

  // ============================================================
  // 암호화 키 캐싱 (세션 복원) 테스트
  // ============================================================

  it('sessionStorage에 캐싱된 암호화 키가 있으면 서명 없이 등록이 진행된다', async () => {
    mockGetCachedEncryptionKey.mockReturnValue('cached-key-12345');

    render(<SettingsPage />);

    const registerButtons = screen.getAllByText('새 API 키 등록');
    fireEvent.click(registerButtons[registerButtons.length - 1]);

    fireEvent.click(screen.getByRole('radio', { name: '코인원' }));
    fireEvent.change(screen.getByLabelText('Access Key'), { target: { value: 'cached-access' } });
    fireEvent.change(screen.getByLabelText('Secret Key'), { target: { value: 'cached-secret' } });

    fireEvent.click(screen.getByRole('button', { name: '등록' }));

    await waitFor(() => {
      // getCachedEncryptionKey가 캐시된 키를 반환하므로 deriveEncryptionKey는 호출되지 않음
      expect(mockDeriveEncryptionKey).not.toHaveBeenCalled();
    });
  });

  it('sessionStorage에 캐싱된 키가 없으면 지갑 서명을 요청한다', async () => {
    mockGetCachedEncryptionKey.mockReturnValue(null);

    render(<SettingsPage />);

    const registerButtons = screen.getAllByText('새 API 키 등록');
    fireEvent.click(registerButtons[registerButtons.length - 1]);

    fireEvent.click(screen.getByRole('radio', { name: '업비트' }));
    fireEvent.change(screen.getByLabelText('Access Key'), { target: { value: 'new-access' } });
    fireEvent.change(screen.getByLabelText('Secret Key'), { target: { value: 'new-secret' } });

    fireEvent.click(screen.getByRole('button', { name: '등록' }));

    await waitFor(() => {
      // 캐시가 없으므로 지갑 서명을 통해 키를 도출
      expect(mockDeriveEncryptionKey).toHaveBeenCalled();
      expect(mockCacheEncryptionKey).toHaveBeenCalled();
    });
  });

  // ============================================================
  // 접근성 테스트
  // ============================================================

  it('가이드 펼침 버튼에 aria-expanded 속성이 있다', () => {
    render(<SettingsPage />);

    const guideButton = screen.getByRole('button', {
      name: /API 키 발급 방법/,
    });
    expect(guideButton).toHaveAttribute('aria-expanded');
  });

  it('가이드 콘텐츠 영역에 id가 설정되고 aria-controls로 연결된다', () => {
    render(<SettingsPage />);

    const guideButton = screen.getByRole('button', {
      name: /API 키 발급 방법/,
    });
    expect(guideButton).toHaveAttribute('aria-controls', 'api-key-guide');

    // 가이드 펼치기
    fireEvent.click(guideButton);

    const guideContent = document.getElementById('api-key-guide');
    expect(guideContent).toBeInTheDocument();
  });
});
