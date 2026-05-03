/**
 * Web3 지갑 인증 관리 커스텀 훅
 *
 * wagmi/RainbowKit 기반의 지갑 연결/해제, 주소 조회,
 * 계정 변경 이벤트 처리, 메시지 서명 기능을 제공한다.
 *
 * MetaMask 미설치 시 설치 안내 로직을 포함하며,
 * 지갑 변경 시 기존 세션 데이터 정리 및 암호화 데이터 존재 여부 확인,
 * 복호화 불가 시 사용자 안내 메시지 처리를 담당한다.
 *
 * @see 요구사항 8.1, 8.2, 8.3, 8.12, 8.13
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import type { WalletConnection } from '@bitscope/shared';
import {
  clearCachedEncryptionKey,
  hasEncryptedKeys,
} from '../lib/crypto/encryption-service';

/** localStorage 키: 마지막 연결된 지갑 주소 (자동 재연결용) */
const LAST_WALLET_ADDRESS_KEY = 'bitscope:wallet:lastAddress';

/** MetaMask 확장 프로그램 설치 URL */
const METAMASK_INSTALL_URL = 'https://metamask.io/download/';

/**
 * MetaMask 지갑이 브라우저에 설치되어 있는지 확인한다.
 *
 * EIP-1193 표준의 window.ethereum 객체와
 * MetaMask 전용 isMetaMask 속성을 검사한다.
 *
 * @returns MetaMask 설치 여부
 */
export function isMetaMaskInstalled(): boolean {
  if (typeof window === 'undefined') return false;

  const ethereum = (window as unknown as Record<string, unknown>).ethereum;
  return Boolean(ethereum && (ethereum as Record<string, unknown>).isMetaMask);
}

/**
 * EIP-1193 호환 Web3 지갑(MetaMask 등)이 설치되어 있는지 확인한다.
 *
 * @returns Web3 지갑 설치 여부
 */
export function isWeb3WalletAvailable(): boolean {
  if (typeof window === 'undefined') return false;

  return Boolean((window as unknown as Record<string, unknown>).ethereum);
}

/**
 * 지갑 변경 시 상태를 나타내는 타입
 *
 * 지갑 주소가 변경되었을 때, 새 지갑에 대해
 * 암호화된 API Key가 존재하는지, 재등록이 필요한지를 나타낸다.
 */
export interface WalletChangeStatus {
  /** 지갑 변경이 발생했는지 여부 */
  hasChanged: boolean;
  /** 이전 지갑 주소 (변경 전) */
  previousAddress: string;
  /** 새 지갑 주소에 암호화된 API Key가 존재하는지 여부 */
  hasExistingKeys: boolean;
  /** API 키 재등록이 필요한지 여부 (새 지갑에 키가 없는 경우) */
  requiresReRegistration: boolean;
  /** 사용자에게 표시할 안내 메시지 */
  message: string;
}

/** useWalletAuth 훅 반환 타입 */
export interface UseWalletAuthReturn {
  /** 지갑 연결 상태 정보 */
  wallet: WalletConnection;
  /** 지갑 연결 요청 (RainbowKit 모달 표시) */
  connect: () => void;
  /** 지갑 연결 해제 */
  disconnect: () => void;
  /** 메시지 서명 요청 (personal_sign EIP-191) */
  signMessage: (message: string) => Promise<string>;
  /** 지갑 연결 진행 중 여부 */
  isConnecting: boolean;
  /** MetaMask 설치 여부 */
  isMetaMaskInstalled: boolean;
  /** Web3 지갑 사용 가능 여부 */
  isWalletAvailable: boolean;
  /** MetaMask 설치 페이지 URL */
  metaMaskInstallUrl: string;
  /** 지갑 변경 시 상태 정보 (변경 발생 시에만 non-null) */
  walletChangeStatus: WalletChangeStatus | null;
  /** 지갑 변경 상태를 초기화(dismiss)하는 함수 */
  dismissWalletChange: () => void;
}

/** 계정 변경 콜백 타입 */
type AccountChangedCallback = (address: string) => void;

/**
 * Web3 지갑 인증 관리 훅
 *
 * 주요 기능:
 * - 지갑 연결/해제 (RainbowKit ConnectModal 통합)
 * - 현재 연결 상태 및 지갑 주소 조회
 * - personal_sign(EIP-191) 메시지 서명
 * - 계정 변경 이벤트 감지 및 콜백 호출
 * - 지갑 변경 시 sessionStorage 암호화 키 삭제 및 새 지갑 주소 암호화 데이터 존재 여부 확인
 * - 복호화 불가 시 사용자 안내 메시지 제공
 * - MetaMask 미설치 시 안내 정보 제공
 * - 마지막 연결된 지갑 주소 localStorage 저장 (자동 재연결용)
 *
 * @param onAccountChanged 지갑 주소 변경 시 호출되는 콜백 함수 (선택)
 * @returns 지갑 인증 관련 상태와 함수들
 */
export function useWalletAuth(
  onAccountChanged?: AccountChangedCallback
): UseWalletAuthReturn {
  const { address, isConnected, chainId, isConnecting: wagmiConnecting } = useAccount();
  const { connectAsync, isPending: isConnectPending } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();
  const { signMessageAsync } = useSignMessage();

  /** 이전 지갑 주소를 추적하여 변경 감지에 사용 */
  const previousAddressRef = useRef<string | undefined>(undefined);

  /** 콜백 ref를 사용하여 최신 콜백을 항상 참조 */
  const onAccountChangedRef = useRef<AccountChangedCallback | undefined>(onAccountChanged);
  onAccountChangedRef.current = onAccountChanged;

  /** 지갑 변경 시 상태 정보 */
  const [walletChangeStatus, setWalletChangeStatus] = useState<WalletChangeStatus | null>(null);

  /**
   * 지갑 주소 변경 감지 및 처리
   *
   * 지갑 주소가 변경되면:
   * 1. 이전 주소와 비교하여 실제 변경 여부를 확인
   * 2. 기존 sessionStorage 암호화 키를 즉시 삭제 (보안)
   * 3. 새 지갑 주소에 대한 암호화된 API Key 존재 여부를 확인
   * 4. 존재하지 않으면 사용자에게 API 키 재등록 안내 메시지를 설정
   * 5. 변경 시 onAccountChanged 콜백을 호출
   * 6. 새 지갑 주소를 localStorage에 저장
   *
   * @see 요구사항 8.12, 8.13
   */
  useEffect(() => {
    const prevAddr = previousAddressRef.current;
    const currentAddr = address?.toLowerCase();

    // 초기 연결 또는 주소 변경 감지
    if (prevAddr !== undefined && currentAddr !== undefined && prevAddr !== currentAddr) {
      // 1. 기존 sessionStorage 암호화 키 삭제 (지갑이 변경되었으므로 이전 키는 무효)
      clearCachedEncryptionKey();

      // 2. 새 지갑 주소에 암호화된 API Key가 존재하는지 확인
      const existingKeys = hasEncryptedKeys(currentAddr);

      // 3. 지갑 변경 상태 설정
      if (existingKeys) {
        // 새 지갑에 기존 API Key가 있는 경우 (이전에 이 지갑으로 등록한 적 있음)
        // 재서명을 통해 암호화 키를 다시 도출하면 복호화 가능
        setWalletChangeStatus({
          hasChanged: true,
          previousAddress: prevAddr,
          hasExistingKeys: true,
          requiresReRegistration: false,
          message: '지갑이 변경되었습니다. 기존 API 키를 사용하려면 서명을 다시 진행해주세요.',
        });
      } else {
        // 새 지갑에 API Key가 없는 경우 (처음 사용하는 지갑 또는 이전 데이터 삭제됨)
        // 이전 지갑으로 암호화된 API Key는 새 지갑으로 복호화 불가
        setWalletChangeStatus({
          hasChanged: true,
          previousAddress: prevAddr,
          hasExistingKeys: false,
          requiresReRegistration: true,
          message: '지갑이 변경되었습니다. 새 지갑에 등록된 API 키가 없습니다. API 키를 다시 등록해주세요.',
        });
      }

      // 4. 계정 변경 콜백 호출
      if (onAccountChangedRef.current) {
        onAccountChangedRef.current(currentAddr);
      }
    }

    // 현재 주소를 이전 주소로 업데이트
    previousAddressRef.current = currentAddr;

    // 연결된 지갑 주소를 localStorage에 저장 (자동 재연결용)
    if (currentAddr) {
      try {
        localStorage.setItem(LAST_WALLET_ADDRESS_KEY, currentAddr);
      } catch {
        // localStorage 접근 실패 시 무시 (private browsing 등)
      }
    }
  }, [address]);

  /**
   * 지갑 연결 해제 시 처리
   *
   * 1. sessionStorage에서 암호화 키를 삭제 (보안)
   * 2. localStorage에서 마지막 지갑 주소를 제거
   * 3. 지갑 변경 상태를 초기화
   */
  useEffect(() => {
    if (!isConnected) {
      clearCachedEncryptionKey();
      setWalletChangeStatus(null);

      try {
        localStorage.removeItem(LAST_WALLET_ADDRESS_KEY);
      } catch {
        // localStorage 접근 실패 시 무시
      }
    }
  }, [isConnected]);

  /**
   * 지갑 연결 요청
   *
   * RainbowKit의 ConnectModal을 열어 사용자에게 지갑 선택 UI를 표시한다.
   * MetaMask, WalletConnect 등 다양한 지갑 커넥터를 지원한다.
   */
  const connect = useCallback(() => {
    if (openConnectModal) {
      openConnectModal();
    }
  }, [openConnectModal]);

  /**
   * 지갑 연결 해제
   *
   * 현재 연결된 지갑을 해제하고 관련 상태를 초기화한다.
   * sessionStorage 암호화 키도 함께 삭제된다.
   */
  const disconnect = useCallback(() => {
    clearCachedEncryptionKey();
    setWalletChangeStatus(null);
    wagmiDisconnect();
    previousAddressRef.current = undefined;
  }, [wagmiDisconnect]);

  /**
   * 메시지 서명 요청 (personal_sign, EIP-191)
   *
   * 지갑을 통해 메시지에 서명한다. API Key 암호화 키 도출에 사용된다.
   * 지갑이 연결되지 않은 상태에서 호출하면 오류를 발생시킨다.
   *
   * @param message 서명할 메시지 문자열
   * @returns 서명 결과 (hex 문자열)
   * @throws 지갑 미연결 시 오류
   */
  const signMessageAsyncRef = useRef(signMessageAsync);
  signMessageAsyncRef.current = signMessageAsync;

  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      if (!isConnected || !address) {
        throw new Error('지갑이 연결되지 않았습니다. 먼저 지갑을 연결해주세요.');
      }

      const signature = await signMessageAsyncRef.current({ message });
      return signature;
    },
    [isConnected, address]
  );

  /**
   * 지갑 변경 상태를 초기화(dismiss)한다.
   *
   * 사용자가 지갑 변경 안내 메시지를 확인한 후 호출하여
   * 안내 상태를 초기화한다.
   */
  const dismissWalletChange = useCallback(() => {
    setWalletChangeStatus(null);
  }, []);

  /** 현재 지갑 연결 상태 객체 */
  const wallet: WalletConnection = {
    address: address?.toLowerCase() ?? '',
    chainId: chainId ?? 0,
    isConnected: isConnected ?? false,
  };

  return {
    wallet,
    connect,
    disconnect,
    signMessage,
    isConnecting: wagmiConnecting || isConnectPending,
    isMetaMaskInstalled: typeof window !== 'undefined' ? isMetaMaskInstalled() : false,
    isWalletAvailable: typeof window !== 'undefined' ? isWeb3WalletAvailable() : false,
    metaMaskInstallUrl: METAMASK_INSTALL_URL,
    walletChangeStatus,
    dismissWalletChange,
  };
}
