/**
 * useWalletAuth 훅 단위 테스트
 *
 * 지갑 연결 상태 관리, 계정 변경 감지, 메시지 서명,
 * MetaMask 설치 감지, 지갑 변경 시 처리 로직을 검증한다.
 *
 * @see 요구사항 8.1, 8.2, 8.3, 8.12, 8.13
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { isMetaMaskInstalled, isWeb3WalletAvailable } from '../useWalletAuth';

// wagmi 훅 모킹
const mockUseAccount = vi.fn();
const mockUseConnect = vi.fn();
const mockUseDisconnect = vi.fn();
const mockUseSignMessage = vi.fn();
const mockOpenConnectModal = vi.fn();

vi.mock('wagmi', () => ({
  useAccount: () => mockUseAccount(),
  useConnect: () => mockUseConnect(),
  useDisconnect: () => mockUseDisconnect(),
  useSignMessage: () => mockUseSignMessage(),
  WagmiProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@rainbow-me/rainbowkit', () => ({
  useConnectModal: () => ({ openConnectModal: mockOpenConnectModal }),
}));

// encryption-service 모킹
const mockClearCachedEncryptionKey = vi.fn();
const mockHasEncryptedKeys = vi.fn();

vi.mock('../../lib/crypto/encryption-service', () => ({
  clearCachedEncryptionKey: (...args: unknown[]) => mockClearCachedEncryptionKey(...args),
  hasEncryptedKeys: (...args: unknown[]) => mockHasEncryptedKeys(...args),
}));

// 동적 import를 사용하여 모킹 후 모듈 로드
const loadHook = async () => {
  const module = await import('../useWalletAuth');
  return module.useWalletAuth;
};

describe('isMetaMaskInstalled', () => {
  const originalWindow = global.window;

  afterEach(() => {
    // window.ethereum 정리
    if (typeof window !== 'undefined') {
      delete (window as unknown as Record<string, unknown>).ethereum;
    }
  });

  it('MetaMask가 설치된 경우 true를 반환한다', () => {
    (window as unknown as Record<string, unknown>).ethereum = { isMetaMask: true };
    expect(isMetaMaskInstalled()).toBe(true);
  });

  it('MetaMask가 아닌 지갑이 설치된 경우 false를 반환한다', () => {
    (window as unknown as Record<string, unknown>).ethereum = { isMetaMask: false };
    expect(isMetaMaskInstalled()).toBe(false);
  });

  it('window.ethereum이 없는 경우 false를 반환한다', () => {
    delete (window as unknown as Record<string, unknown>).ethereum;
    expect(isMetaMaskInstalled()).toBe(false);
  });
});

describe('isWeb3WalletAvailable', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).ethereum;
  });

  it('Web3 지갑이 설치된 경우 true를 반환한다', () => {
    (window as unknown as Record<string, unknown>).ethereum = {};
    expect(isWeb3WalletAvailable()).toBe(true);
  });

  it('Web3 지갑이 없는 경우 false를 반환한다', () => {
    delete (window as unknown as Record<string, unknown>).ethereum;
    expect(isWeb3WalletAvailable()).toBe(false);
  });
});

describe('useWalletAuth', () => {
  const mockDisconnect = vi.fn();
  const mockConnectAsync = vi.fn();
  const mockSignMessageAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // localStorage / sessionStorage 모킹
    const store: Record<string, string> = {};
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
      (key: string, value: string) => {
        store[key] = value;
      }
    );
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(
      (key: string) => store[key] ?? null
    );
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(
      (key: string) => {
        delete store[key];
      }
    );

    // encryption-service 기본 반환값
    mockHasEncryptedKeys.mockReturnValue(false);

    // 기본 모킹 값 설정
    mockUseAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      chainId: undefined,
      isConnecting: false,
    });
    mockUseConnect.mockReturnValue({
      connectAsync: mockConnectAsync,
      isPending: false,
    });
    mockUseDisconnect.mockReturnValue({
      disconnect: mockDisconnect,
    });
    mockUseSignMessage.mockReturnValue({
      signMessageAsync: mockSignMessageAsync,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('초기 상태에서 지갑이 연결되지 않은 상태를 반환한다', async () => {
    const useWalletAuth = await loadHook();
    const { result } = renderHook(() => useWalletAuth());

    expect(result.current.wallet.isConnected).toBe(false);
    expect(result.current.wallet.address).toBe('');
    expect(result.current.wallet.chainId).toBe(0);
    expect(result.current.isConnecting).toBe(false);
  });

  it('지갑이 연결된 상태를 올바르게 반환한다', async () => {
    const testAddress = '0x1234567890AbCdEf1234567890aBcDeF12345678';
    mockUseAccount.mockReturnValue({
      address: testAddress,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    const useWalletAuth = await loadHook();
    const { result } = renderHook(() => useWalletAuth());

    expect(result.current.wallet.isConnected).toBe(true);
    // 주소는 소문자로 정규화된다
    expect(result.current.wallet.address).toBe(testAddress.toLowerCase());
    expect(result.current.wallet.chainId).toBe(1);
  });

  it('connect 호출 시 RainbowKit ConnectModal을 연다', async () => {
    const useWalletAuth = await loadHook();
    const { result } = renderHook(() => useWalletAuth());

    act(() => {
      result.current.connect();
    });

    expect(mockOpenConnectModal).toHaveBeenCalledOnce();
  });

  it('disconnect 호출 시 wagmi disconnect를 호출한다', async () => {
    mockUseAccount.mockReturnValue({
      address: '0x1234',
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    const useWalletAuth = await loadHook();
    const { result } = renderHook(() => useWalletAuth());

    act(() => {
      result.current.disconnect();
    });

    expect(mockDisconnect).toHaveBeenCalledOnce();
  });

  it('signMessage 호출 시 지갑 서명을 요청한다', async () => {
    const testSignature = '0xabcdef1234567890';
    mockUseAccount.mockReturnValue({
      address: '0x1234567890AbCdEf1234567890aBcDeF12345678',
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });
    mockSignMessageAsync.mockResolvedValue(testSignature);

    const useWalletAuth = await loadHook();
    const { result } = renderHook(() => useWalletAuth());

    let signature: string = '';
    await act(async () => {
      signature = await result.current.signMessage('Test message');
    });

    expect(mockSignMessageAsync).toHaveBeenCalledWith({ message: 'Test message' });
    expect(signature).toBe(testSignature);
  });

  it('지갑 미연결 시 signMessage 호출하면 오류를 발생시킨다', async () => {
    mockUseAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      chainId: undefined,
      isConnecting: false,
    });

    const useWalletAuth = await loadHook();
    const { result } = renderHook(() => useWalletAuth());

    await expect(result.current.signMessage('Test message')).rejects.toThrow(
      '지갑이 연결되지 않았습니다'
    );
    expect(mockSignMessageAsync).not.toHaveBeenCalled();
  });

  it('지갑 연결 시 주소를 localStorage에 저장한다', async () => {
    const testAddress = '0xAbCd1234567890aBcDeF1234567890AbCdEf5678';
    mockUseAccount.mockReturnValue({
      address: testAddress,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    const useWalletAuth = await loadHook();
    renderHook(() => useWalletAuth());

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'bitscope:wallet:lastAddress',
      testAddress.toLowerCase()
    );
  });

  it('지갑 연결 해제 시 localStorage에서 주소를 삭제한다', async () => {
    // 처음에는 연결되지 않은 상태로 시작
    mockUseAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      chainId: undefined,
      isConnecting: false,
    });

    const useWalletAuth = await loadHook();
    renderHook(() => useWalletAuth());

    expect(localStorage.removeItem).toHaveBeenCalledWith('bitscope:wallet:lastAddress');
  });

  it('계정 변경 시 onAccountChanged 콜백이 호출된다', async () => {
    const firstAddress = '0x1111111111111111111111111111111111111111';
    const secondAddress = '0x2222222222222222222222222222222222222222';
    const onAccountChanged = vi.fn();

    mockUseAccount.mockReturnValue({
      address: firstAddress,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    const useWalletAuth = await loadHook();
    const { rerender } = renderHook(() => useWalletAuth(onAccountChanged));

    // 계정 변경 시뮬레이션
    mockUseAccount.mockReturnValue({
      address: secondAddress,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    rerender();

    expect(onAccountChanged).toHaveBeenCalledWith(secondAddress.toLowerCase());
  });

  it('동일한 주소로의 변경 시 콜백이 호출되지 않는다', async () => {
    const address = '0x1111111111111111111111111111111111111111';
    const onAccountChanged = vi.fn();

    mockUseAccount.mockReturnValue({
      address,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    const useWalletAuth = await loadHook();
    const { rerender } = renderHook(() => useWalletAuth(onAccountChanged));

    // 같은 주소로 리렌더
    rerender();

    expect(onAccountChanged).not.toHaveBeenCalled();
  });

  it('isConnecting 상태가 wagmi 연결 중일 때 true를 반환한다', async () => {
    mockUseAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      chainId: undefined,
      isConnecting: true,
    });

    const useWalletAuth = await loadHook();
    const { result } = renderHook(() => useWalletAuth());

    expect(result.current.isConnecting).toBe(true);
  });

  it('isConnecting 상태가 connect pending일 때 true를 반환한다', async () => {
    mockUseAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      chainId: undefined,
      isConnecting: false,
    });
    mockUseConnect.mockReturnValue({
      connectAsync: mockConnectAsync,
      isPending: true,
    });

    const useWalletAuth = await loadHook();
    const { result } = renderHook(() => useWalletAuth());

    expect(result.current.isConnecting).toBe(true);
  });

  it('MetaMask 설치 URL을 제공한다', async () => {
    const useWalletAuth = await loadHook();
    const { result } = renderHook(() => useWalletAuth());

    expect(result.current.metaMaskInstallUrl).toBe('https://metamask.io/download/');
  });

  it('지갑 주소를 항상 소문자로 정규화한다', async () => {
    const mixedCaseAddress = '0xAbCdEf1234567890aBcDeF1234567890AbCdEf12';
    mockUseAccount.mockReturnValue({
      address: mixedCaseAddress,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    const useWalletAuth = await loadHook();
    const { result } = renderHook(() => useWalletAuth());

    expect(result.current.wallet.address).toBe(mixedCaseAddress.toLowerCase());
  });
});

/**
 * 지갑 변경 시나리오 테스트
 *
 * 지갑 주소가 변경될 때의 처리 로직을 검증한다:
 * - sessionStorage 암호화 키 삭제
 * - 새 지갑 주소의 암호화 데이터 존재 여부 확인
 * - 사용자 안내 메시지 생성
 *
 * @see 요구사항 8.12, 8.13
 */
describe('useWalletAuth - 지갑 변경 시 처리', () => {
  const mockDisconnect = vi.fn();
  const mockConnectAsync = vi.fn();
  const mockSignMessageAsync = vi.fn();

  const FIRST_ADDRESS = '0x1111111111111111111111111111111111111111';
  const SECOND_ADDRESS = '0x2222222222222222222222222222222222222222';

  beforeEach(() => {
    vi.clearAllMocks();

    // localStorage / sessionStorage 모킹
    const store: Record<string, string> = {};
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
      (key: string, value: string) => {
        store[key] = value;
      }
    );
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(
      (key: string) => store[key] ?? null
    );
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(
      (key: string) => {
        delete store[key];
      }
    );

    // encryption-service 기본 반환값
    mockHasEncryptedKeys.mockReturnValue(false);

    // 기본 모킹 값 설정
    mockUseAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      chainId: undefined,
      isConnecting: false,
    });
    mockUseConnect.mockReturnValue({
      connectAsync: mockConnectAsync,
      isPending: false,
    });
    mockUseDisconnect.mockReturnValue({
      disconnect: mockDisconnect,
    });
    mockUseSignMessage.mockReturnValue({
      signMessageAsync: mockSignMessageAsync,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('초기 상태에서 walletChangeStatus는 null이다', async () => {
    const useWalletAuth = await loadHook();
    const { result } = renderHook(() => useWalletAuth());

    expect(result.current.walletChangeStatus).toBeNull();
  });

  it('지갑이 변경되면 sessionStorage 암호화 키를 삭제한다', async () => {
    mockUseAccount.mockReturnValue({
      address: FIRST_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    const useWalletAuth = await loadHook();
    const { rerender } = renderHook(() => useWalletAuth());

    // clearCachedEncryptionKey 호출 횟수 초기화
    mockClearCachedEncryptionKey.mockClear();

    // 지갑 주소 변경
    mockUseAccount.mockReturnValue({
      address: SECOND_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    rerender();

    expect(mockClearCachedEncryptionKey).toHaveBeenCalled();
  });

  it('지갑 변경 시 새 지갑에 API Key가 없으면 재등록 필요 상태를 반환한다', async () => {
    mockHasEncryptedKeys.mockReturnValue(false);

    mockUseAccount.mockReturnValue({
      address: FIRST_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    const useWalletAuth = await loadHook();
    const { result, rerender } = renderHook(() => useWalletAuth());

    // 지갑 주소 변경
    mockUseAccount.mockReturnValue({
      address: SECOND_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    rerender();

    expect(result.current.walletChangeStatus).not.toBeNull();
    expect(result.current.walletChangeStatus!.hasChanged).toBe(true);
    expect(result.current.walletChangeStatus!.previousAddress).toBe(
      FIRST_ADDRESS.toLowerCase()
    );
    expect(result.current.walletChangeStatus!.hasExistingKeys).toBe(false);
    expect(result.current.walletChangeStatus!.requiresReRegistration).toBe(true);
    expect(result.current.walletChangeStatus!.message).toContain(
      'API 키를 다시 등록해주세요'
    );
  });

  it('지갑 변경 시 새 지갑에 API Key가 있으면 재서명 안내를 반환한다', async () => {
    mockUseAccount.mockReturnValue({
      address: FIRST_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    const useWalletAuth = await loadHook();
    const { result, rerender } = renderHook(() => useWalletAuth());

    // 새 지갑에 기존 API Key가 있는 경우를 시뮬레이션
    mockHasEncryptedKeys.mockReturnValue(true);

    // 지갑 주소 변경
    mockUseAccount.mockReturnValue({
      address: SECOND_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    rerender();

    expect(result.current.walletChangeStatus).not.toBeNull();
    expect(result.current.walletChangeStatus!.hasChanged).toBe(true);
    expect(result.current.walletChangeStatus!.hasExistingKeys).toBe(true);
    expect(result.current.walletChangeStatus!.requiresReRegistration).toBe(false);
    expect(result.current.walletChangeStatus!.message).toContain(
      '서명을 다시 진행해주세요'
    );
  });

  it('지갑 변경 시 hasEncryptedKeys를 새 지갑 주소로 호출한다', async () => {
    mockUseAccount.mockReturnValue({
      address: FIRST_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    const useWalletAuth = await loadHook();
    const { rerender } = renderHook(() => useWalletAuth());

    mockHasEncryptedKeys.mockClear();

    // 지갑 주소 변경
    mockUseAccount.mockReturnValue({
      address: SECOND_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    rerender();

    expect(mockHasEncryptedKeys).toHaveBeenCalledWith(SECOND_ADDRESS.toLowerCase());
  });

  it('지갑이 변경되지 않으면 walletChangeStatus가 null을 유지한다', async () => {
    mockUseAccount.mockReturnValue({
      address: FIRST_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    const useWalletAuth = await loadHook();
    const { result, rerender } = renderHook(() => useWalletAuth());

    // 같은 주소로 리렌더
    rerender();

    expect(result.current.walletChangeStatus).toBeNull();
  });

  it('dismissWalletChange 호출 시 walletChangeStatus가 null로 초기화된다', async () => {
    mockUseAccount.mockReturnValue({
      address: FIRST_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    const useWalletAuth = await loadHook();
    const { result, rerender } = renderHook(() => useWalletAuth());

    // 지갑 주소 변경
    mockUseAccount.mockReturnValue({
      address: SECOND_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    rerender();

    // walletChangeStatus가 설정되었는지 확인
    expect(result.current.walletChangeStatus).not.toBeNull();

    // dismiss 호출
    act(() => {
      result.current.dismissWalletChange();
    });

    expect(result.current.walletChangeStatus).toBeNull();
  });

  it('지갑 연결 해제 시 sessionStorage 암호화 키를 삭제한다', async () => {
    mockUseAccount.mockReturnValue({
      address: FIRST_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    const useWalletAuth = await loadHook();
    const { result, rerender } = renderHook(() => useWalletAuth());

    mockClearCachedEncryptionKey.mockClear();

    // 지갑 연결 해제
    mockUseAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      chainId: undefined,
      isConnecting: false,
    });

    rerender();

    expect(mockClearCachedEncryptionKey).toHaveBeenCalled();
  });

  it('지갑 연결 해제 시 walletChangeStatus가 null로 초기화된다', async () => {
    mockUseAccount.mockReturnValue({
      address: FIRST_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    const useWalletAuth = await loadHook();
    const { result, rerender } = renderHook(() => useWalletAuth());

    // 지갑 변경하여 walletChangeStatus 설정
    mockUseAccount.mockReturnValue({
      address: SECOND_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });
    rerender();
    expect(result.current.walletChangeStatus).not.toBeNull();

    // 지갑 연결 해제
    mockUseAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      chainId: undefined,
      isConnecting: false,
    });
    rerender();

    expect(result.current.walletChangeStatus).toBeNull();
  });

  it('disconnect 함수 호출 시 sessionStorage 암호화 키를 삭제한다', async () => {
    mockUseAccount.mockReturnValue({
      address: FIRST_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    const useWalletAuth = await loadHook();
    const { result } = renderHook(() => useWalletAuth());

    mockClearCachedEncryptionKey.mockClear();

    act(() => {
      result.current.disconnect();
    });

    expect(mockClearCachedEncryptionKey).toHaveBeenCalled();
  });

  it('disconnect 함수 호출 시 walletChangeStatus가 null로 초기화된다', async () => {
    mockUseAccount.mockReturnValue({
      address: FIRST_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    const useWalletAuth = await loadHook();
    const { result, rerender } = renderHook(() => useWalletAuth());

    // 지갑 변경으로 walletChangeStatus 설정
    mockUseAccount.mockReturnValue({
      address: SECOND_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });
    rerender();
    expect(result.current.walletChangeStatus).not.toBeNull();

    // disconnect 호출
    act(() => {
      result.current.disconnect();
    });

    expect(result.current.walletChangeStatus).toBeNull();
  });

  it('여러 번 지갑을 변경해도 최신 상태를 반영한다', async () => {
    const thirdAddress = '0x3333333333333333333333333333333333333333';

    mockUseAccount.mockReturnValue({
      address: FIRST_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    const useWalletAuth = await loadHook();
    const { result, rerender } = renderHook(() => useWalletAuth());

    // 첫 번째 변경: API Key 없음
    mockHasEncryptedKeys.mockReturnValue(false);
    mockUseAccount.mockReturnValue({
      address: SECOND_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });
    rerender();

    expect(result.current.walletChangeStatus!.previousAddress).toBe(
      FIRST_ADDRESS.toLowerCase()
    );
    expect(result.current.walletChangeStatus!.requiresReRegistration).toBe(true);

    // 두 번째 변경: API Key 있음
    mockHasEncryptedKeys.mockReturnValue(true);
    mockUseAccount.mockReturnValue({
      address: thirdAddress,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });
    rerender();

    expect(result.current.walletChangeStatus!.previousAddress).toBe(
      SECOND_ADDRESS.toLowerCase()
    );
    expect(result.current.walletChangeStatus!.requiresReRegistration).toBe(false);
    expect(result.current.walletChangeStatus!.hasExistingKeys).toBe(true);
  });

  it('지갑 변경 시 onAccountChanged 콜백도 함께 호출된다', async () => {
    const onAccountChanged = vi.fn();

    mockUseAccount.mockReturnValue({
      address: FIRST_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    const useWalletAuth = await loadHook();
    const { result, rerender } = renderHook(() => useWalletAuth(onAccountChanged));

    // 지갑 주소 변경
    mockUseAccount.mockReturnValue({
      address: SECOND_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });
    rerender();

    // walletChangeStatus가 설정되고 콜백도 호출되었는지 확인
    expect(result.current.walletChangeStatus).not.toBeNull();
    expect(onAccountChanged).toHaveBeenCalledWith(SECOND_ADDRESS.toLowerCase());
  });

  it('walletChangeStatus의 message에 사용자 안내 문구가 포함된다 (재등록 필요)', async () => {
    mockHasEncryptedKeys.mockReturnValue(false);

    mockUseAccount.mockReturnValue({
      address: FIRST_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    const useWalletAuth = await loadHook();
    const { result, rerender } = renderHook(() => useWalletAuth());

    mockUseAccount.mockReturnValue({
      address: SECOND_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });
    rerender();

    const message = result.current.walletChangeStatus!.message;
    expect(message).toContain('지갑이 변경되었습니다');
    expect(message).toContain('API 키를 다시 등록해주세요');
  });

  it('walletChangeStatus의 message에 사용자 안내 문구가 포함된다 (재서명 필요)', async () => {
    mockUseAccount.mockReturnValue({
      address: FIRST_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });

    const useWalletAuth = await loadHook();
    const { result, rerender } = renderHook(() => useWalletAuth());

    mockHasEncryptedKeys.mockReturnValue(true);

    mockUseAccount.mockReturnValue({
      address: SECOND_ADDRESS,
      isConnected: true,
      chainId: 1,
      isConnecting: false,
    });
    rerender();

    const message = result.current.walletChangeStatus!.message;
    expect(message).toContain('지갑이 변경되었습니다');
    expect(message).toContain('서명을 다시 진행해주세요');
  });
});
