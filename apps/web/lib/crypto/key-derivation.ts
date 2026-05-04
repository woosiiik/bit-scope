/**
 * 지갑 서명 기반 암호화 키 도출 모듈
 *
 * 사용자의 Web3 지갑 서명을 통해 AES 암호화에 사용할 키를 도출한다.
 * nonce 생성, 서명 메시지 구성, personal_sign 요청,
 * SHA-256 해시를 통한 AES 암호화 키 도출 과정을 담당한다.
 *
 * 보안 원칙:
 * - API Key(Secret Key)는 절대 브라우저 밖으로 전송되지 않는다.
 * - 서명 메시지에 지갑 주소와 고유 nonce를 포함하여 다른 사이트의 서명 재사용을 차단한다.
 * - SHA-256 해시를 통해 서명 결과에서 결정론적으로 암호화 키를 도출한다.
 *
 * @see 요구사항 8.4, 8.5, 8.6, 8.8
 */

import CryptoJS from 'crypto-js';
import type { SignFunction, EncryptionKeyDerivation } from '@bitscope/shared';

/** 서명 메시지 접두어 (사이트별 고유 식별용) */
const SIGNATURE_MESSAGE_PREFIX = 'BitScope:encrypt';

/**
 * 고유한 nonce를 생성한다.
 *
 * crypto.randomUUID()를 사용하여 UUID v4 형식의 고유 값을 생성한다.
 * 이 nonce는 서명 메시지를 설치마다 고유하게 만들어
 * 다른 사이트의 서명 재사용을 차단하는 역할을 한다.
 *
 * @returns UUID v4 형식의 고유 nonce
 */
export function generateNonce(): string {
  // crypto.randomUUID()는 Secure Context(HTTPS/localhost)에서만 사용 가능
  // HTTP 환경에서도 동작하도록 폴백 구현
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // 폴백: crypto.getRandomValues로 UUID v4 생성
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 1
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * 서명 메시지를 구성한다.
 *
 * "BitScope:encrypt:{지갑주소}:{nonce}" 형태의 서명 메시지를 생성한다.
 * 지갑 주소는 소문자로 정규화하여 일관성을 유지한다.
 *
 * @param walletAddress 지갑 주소 (0x...)
 * @param nonce 고유 nonce (UUID v4)
 * @returns 서명 메시지 문자열
 * @throws 지갑 주소가 빈 문자열인 경우
 * @throws nonce가 빈 문자열인 경우
 */
export function buildSignatureMessage(walletAddress: string, nonce: string): string {
  if (!walletAddress) {
    throw new Error('지갑 주소가 필요합니다.');
  }
  if (!nonce) {
    throw new Error('nonce가 필요합니다.');
  }

  const normalizedAddress = walletAddress.toLowerCase();
  return `${SIGNATURE_MESSAGE_PREFIX}:${normalizedAddress}:${nonce}`;
}

/**
 * 서명 결과에서 AES 암호화 키를 도출한다.
 *
 * personal_sign 결과(hex 문자열)를 SHA-256 해시 처리하여
 * AES-256 암호화에 사용할 키를 도출한다.
 * 동일한 서명 결과는 항상 동일한 암호화 키를 생성한다 (결정론적).
 *
 * crypto-js를 사용하여 HTTPS 없이도 동작 가능하도록 한다.
 * (Web Crypto API는 Secure Context(HTTPS)에서만 사용 가능)
 *
 * @param signature personal_sign 결과 (hex 문자열)
 * @returns SHA-256 해시 결과 (hex 문자열, 64자)
 * @throws 서명이 빈 문자열인 경우
 */
export function deriveKeyFromSignature(signature: string): string {
  if (!signature) {
    throw new Error('서명이 필요합니다.');
  }

  return CryptoJS.SHA256(signature).toString(CryptoJS.enc.Hex);
}

/**
 * 지갑 서명을 통해 AES 암호화 키를 도출하는 전체 프로세스를 수행한다.
 *
 * 1. nonce 생성 (기존 nonce가 제공되지 않은 경우)
 * 2. 서명 메시지 구성 ("BitScope:encrypt:{address}:{nonce}")
 * 3. personal_sign(EIP-191)을 통해 사용자에게 서명 요청
 * 4. SHA-256 해시 → AES 암호화 키 도출
 *
 * @param walletAddress 지갑 주소 (0x...)
 * @param signFn 지갑 서명 함수 (personal_sign)
 * @param existingNonce 기존 nonce (재서명 시 사용, 선택)
 * @returns 암호화 키 도출 과정의 전체 데이터
 * @throws 지갑 주소가 빈 문자열인 경우
 * @throws 서명 함수 호출 실패 시
 */
export async function deriveEncryptionKey(
  walletAddress: string,
  signFn: SignFunction,
  existingNonce?: string
): Promise<EncryptionKeyDerivation> {
  if (!walletAddress) {
    throw new Error('지갑 주소가 필요합니다.');
  }

  // 1. nonce 생성 또는 기존 nonce 사용
  const nonce = existingNonce || generateNonce();

  // 2. 서명 메시지 구성
  const signatureMessage = buildSignatureMessage(walletAddress, nonce);

  // 3. personal_sign 서명 요청
  const signature = await signFn(signatureMessage);

  // 4. SHA-256 해시로 암호화 키 도출
  const derivedKey = deriveKeyFromSignature(signature);

  return {
    walletAddress: walletAddress.toLowerCase(),
    nonce,
    signatureMessage,
    signature,
    derivedKey,
  };
}
