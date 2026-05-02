/**
 * Web3 지갑 인증 관련 공유 타입 정의
 *
 * 지갑 연결 상태, 암호화 키 도출 과정 관련 타입을 포함한다.
 */

/** 지갑 연결 상태 */
export interface WalletConnection {
  /** 지갑 주소 (0x...) */
  address: string;
  /** 연결된 체인 ID */
  chainId: number;
  /** 연결 상태 */
  isConnected: boolean;
}

/** 암호화 키 도출 과정 데이터 */
export interface EncryptionKeyDerivation {
  /** 지갑 주소 */
  walletAddress: string;
  /** 고유 nonce (crypto.randomUUID()) */
  nonce: string;
  /** 서명 메시지 ("BitScope:encrypt:{address}:{nonce}") */
  signatureMessage: string;
  /** personal_sign 서명 결과 (hex) */
  signature: string;
  /** SHA-256(signature)로 도출된 AES 암호화 키 */
  derivedKey: string;
}

/** 서명 함수 타입 (지갑 서명 요청에 사용) */
export type SignFunction = (message: string) => Promise<string>;
