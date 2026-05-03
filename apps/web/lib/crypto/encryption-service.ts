/**
 * API Key 암호화 서비스
 *
 * 지갑 서명 기반으로 도출된 암호화 키를 사용하여
 * 거래소 API Key를 AES-256 암호화/복호화하고,
 * localStorage 저장/로드/삭제, sessionStorage 기반 암호화 키 캐싱을 수행한다.
 *
 * 보안 원칙:
 * - API Key 원문은 서버로 전송되지 않으며, 클라이언트 로그에도 기록하지 않는다.
 * - 모든 localStorage 데이터는 연결된 지갑 주소별로 분리 저장하여 계정 간 데이터가 격리된다.
 * - 암호화 키는 sessionStorage에 캐싱하여 탭 닫기 시 자동 삭제된다.
 *
 * @see 요구사항 1.4, 8.7, 8.8, 8.9, 8.10, 8.11
 */

import CryptoJS from 'crypto-js';
import type { ApiKeyPair, EncryptedApiKey, ExchangeType } from '@bitscope/shared';

/** sessionStorage 키: 도출된 AES 암호화 키 */
const ENCRYPTION_KEY_SESSION_KEY = 'bitscope:encryptionKey';

/** sessionStorage 키: 암호화 키 도출에 사용된 nonce */
const ENCRYPTION_NONCE_SESSION_KEY = 'bitscope:encryptionNonce';

/**
 * 지갑 주소 단위의 nonce localStorage 키를 생성한다.
 * nonce는 거래소별이 아닌 지갑 주소당 1개로 관리한다.
 * 이를 통해 모든 거래소가 동일한 암호화 키를 사용하여 서명을 1회만 받으면 된다.
 */
function buildNonceStorageKey(walletAddress: string): string {
  return `bitscope:${walletAddress.toLowerCase()}:nonce`;
}

/**
 * 지갑 주소에 연결된 nonce를 localStorage에 저장한다.
 */
export function storeWalletNonce(walletAddress: string, nonce: string): void {
  try {
    localStorage.setItem(buildNonceStorageKey(walletAddress), nonce);
  } catch {
    // localStorage 접근 실패 시 무시
  }
}

/**
 * 지갑 주소에 연결된 nonce를 localStorage에서 조회한다.
 */
export function loadWalletNonce(walletAddress: string): string | null {
  try {
    return localStorage.getItem(buildNonceStorageKey(walletAddress));
  } catch {
    return null;
  }
}

/**
 * 지갑 주소에 연결된 nonce를 localStorage에서 삭제한다.
 */
export function removeWalletNonce(walletAddress: string): void {
  try {
    localStorage.removeItem(buildNonceStorageKey(walletAddress));
  } catch {
    // localStorage 접근 실패 시 무시
  }
}

/**
 * localStorage 키를 생성한다.
 *
 * 지갑 주소별로 분리된 키 구조를 사용한다.
 * 형식: "bitscope:{지갑주소}:apikey:{거래소}"
 *
 * @param walletAddress 지갑 주소 (소문자)
 * @param exchange 거래소 식별자
 * @returns localStorage 키 문자열
 */
export function buildStorageKey(walletAddress: string, exchange: ExchangeType): string {
  return `bitscope:${walletAddress.toLowerCase()}:apikey:${exchange}`;
}

/** localStorage에 저장되는 암호화된 API Key 데이터 구조 */
export interface StoredApiKeyData {
  /** AES 암호화된 Access Key */
  encryptedAccessKey: string;
  /** AES 암호화된 Secret Key */
  encryptedSecretKey: string;
  /** AES 초기화 벡터 */
  iv: string;
  /** 서명 메시지용 nonce (평문) */
  nonce: string;
  /** API Key 등록 일시 (ISO 8601) */
  registeredAt: string;
}

/**
 * API Key를 AES-256으로 암호화한다.
 *
 * crypto-js의 AES 암호화를 사용하며, 랜덤 IV를 생성하여
 * 같은 키와 데이터라도 매번 다른 암호문을 생성한다.
 * HTTPS 없이도 동작 가능하도록 Web Crypto API 대신 crypto-js를 사용한다.
 *
 * @param apiKey 평문 API Key 쌍 (Access Key, Secret Key)
 * @param encryptionKey AES 암호화 키 (SHA-256 해시 결과, hex 64자)
 * @returns 암호화된 API Key 데이터
 * @throws API Key가 유효하지 않은 경우
 * @throws 암호화 키가 빈 문자열인 경우
 */
export function encryptApiKey(apiKey: ApiKeyPair, encryptionKey: string): EncryptedApiKey {
  if (!apiKey.accessKey || !apiKey.secretKey) {
    throw new Error('Access Key와 Secret Key가 모두 필요합니다.');
  }
  if (!encryptionKey) {
    throw new Error('암호화 키가 필요합니다.');
  }

  // 랜덤 IV 생성 (16바이트 = 128비트)
  const iv = CryptoJS.lib.WordArray.random(16);
  const key = CryptoJS.enc.Hex.parse(encryptionKey);

  const encryptedAccessKey = CryptoJS.AES.encrypt(apiKey.accessKey, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  }).toString();

  const encryptedSecretKey = CryptoJS.AES.encrypt(apiKey.secretKey, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  }).toString();

  return {
    encryptedAccessKey,
    encryptedSecretKey,
    iv: iv.toString(CryptoJS.enc.Hex),
  };
}

/**
 * 암호화된 API Key를 복호화한다.
 *
 * AES-256 CBC 모드로 암호화된 데이터를 복호화하여 평문 API Key를 복원한다.
 * 잘못된 암호화 키로 복호화 시도 시 오류를 발생시킨다.
 *
 * @param encryptedData 암호화된 API Key 데이터
 * @param encryptionKey AES 암호화 키 (SHA-256 해시 결과, hex 64자)
 * @returns 복호화된 API Key 쌍 (Access Key, Secret Key)
 * @throws 암호화 키가 빈 문자열인 경우
 * @throws 복호화 실패 시 (잘못된 키 또는 손상된 데이터)
 */
export function decryptApiKey(encryptedData: EncryptedApiKey, encryptionKey: string): ApiKeyPair {
  if (!encryptionKey) {
    throw new Error('암호화 키가 필요합니다.');
  }

  const key = CryptoJS.enc.Hex.parse(encryptionKey);
  const iv = CryptoJS.enc.Hex.parse(encryptedData.iv);

  try {
    const decryptedAccessKey = CryptoJS.AES.decrypt(encryptedData.encryptedAccessKey, key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    const decryptedSecretKey = CryptoJS.AES.decrypt(encryptedData.encryptedSecretKey, key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    const accessKey = decryptedAccessKey.toString(CryptoJS.enc.Utf8);
    const secretKey = decryptedSecretKey.toString(CryptoJS.enc.Utf8);

    // 복호화 결과가 빈 문자열인 경우 키가 잘못된 것
    if (!accessKey || !secretKey) {
      throw new Error('API 키를 복호화할 수 없습니다. 지갑을 확인해주세요.');
    }

    return { accessKey, secretKey };
  } catch (error) {
    // crypto-js 복호화 실패 시 명확한 오류 메시지 제공
    if (error instanceof Error && error.message.includes('복호화할 수 없습니다')) {
      throw error;
    }
    throw new Error('API 키를 복호화할 수 없습니다. 지갑을 확인해주세요.');
  }
}

/**
 * 암호화된 API Key를 localStorage에 저장한다.
 *
 * 지갑 주소별로 분리된 키를 사용하여 계정 간 데이터를 격리한다.
 * nonce와 등록 일시를 함께 저장한다.
 *
 * @param walletAddress 지갑 주소 (0x...)
 * @param exchange 거래소 식별자
 * @param encryptedData 암호화된 API Key 데이터
 * @param nonce 서명 메시지용 nonce
 * @throws localStorage 접근 실패 시
 */
export function storeEncryptedKey(
  walletAddress: string,
  exchange: ExchangeType,
  encryptedData: EncryptedApiKey,
  nonce: string
): void {
  const storageKey = buildStorageKey(walletAddress, exchange);
  const data: StoredApiKeyData = {
    encryptedAccessKey: encryptedData.encryptedAccessKey,
    encryptedSecretKey: encryptedData.encryptedSecretKey,
    iv: encryptedData.iv,
    nonce, // 하위호환을 위해 유지하지만, 실제 nonce는 지갑 단위로 관리
    registeredAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(storageKey, JSON.stringify(data));
    // nonce를 지갑 주소 단위로도 저장 (모든 거래소가 동일한 nonce/키 사용)
    storeWalletNonce(walletAddress, nonce);
  } catch (error) {
    throw new Error(`API 키 저장에 실패했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
  }
}

/**
 * localStorage에서 암호화된 API Key를 로드한다.
 *
 * @param walletAddress 지갑 주소 (0x...)
 * @param exchange 거래소 식별자
 * @returns 저장된 암호화 데이터 및 nonce, 또는 null (데이터 없음)
 */
export function loadEncryptedKey(
  walletAddress: string,
  exchange: ExchangeType
): StoredApiKeyData | null {
  const storageKey = buildStorageKey(walletAddress, exchange);

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const data = JSON.parse(raw) as StoredApiKeyData;

    // 필수 필드 존재 여부 검증
    if (!data.encryptedAccessKey || !data.encryptedSecretKey || !data.iv || !data.nonce) {
      return null;
    }

    return data;
  } catch {
    // JSON 파싱 실패 또는 localStorage 접근 실패 시 null 반환
    return null;
  }
}

/**
 * localStorage에서 암호화된 API Key를 삭제한다.
 *
 * 해당 거래소의 암호화된 API Key와 관련 데이터를 즉시 삭제한다.
 *
 * @param walletAddress 지갑 주소 (0x...)
 * @param exchange 거래소 식별자
 */
export function removeEncryptedKey(walletAddress: string, exchange: ExchangeType): void {
  const storageKey = buildStorageKey(walletAddress, exchange);

  try {
    localStorage.removeItem(storageKey);
  } catch {
    // localStorage 접근 실패 시 무시 (private browsing 등)
  }
}

/**
 * 특정 지갑 주소에 등록된 모든 거래소의 암호화된 API Key를 삭제한다.
 *
 * @param walletAddress 지갑 주소 (0x...)
 */
export function removeAllEncryptedKeys(walletAddress: string): void {
  const exchanges: ExchangeType[] = ['upbit', 'bithumb', 'coinone'];
  for (const exchange of exchanges) {
    removeEncryptedKey(walletAddress, exchange);
  }
}

/**
 * 특정 지갑 주소에 등록된 거래소 목록을 조회한다.
 *
 * @param walletAddress 지갑 주소 (0x...)
 * @returns 등록된 거래소 식별자 목록
 */
export function getRegisteredExchanges(walletAddress: string): ExchangeType[] {
  const exchanges: ExchangeType[] = ['upbit', 'bithumb', 'coinone'];
  const registered: ExchangeType[] = [];

  for (const exchange of exchanges) {
    const data = loadEncryptedKey(walletAddress, exchange);
    if (data) {
      registered.push(exchange);
    }
  }

  return registered;
}

/**
 * 도출된 암호화 키를 sessionStorage에 캐싱한다.
 *
 * sessionStorage는 탭을 닫을 때 자동으로 삭제되어
 * 보안과 편의성의 적절한 균형점을 제공한다.
 * 이를 통해 페이지 새로고침 시 재서명 없이도 암호화 키를 사용할 수 있다.
 *
 * @param key 도출된 AES 암호화 키 (hex 문자열)
 * @throws 암호화 키가 빈 문자열인 경우
 */
export function cacheEncryptionKey(key: string, nonce?: string): void {
  if (!key) {
    throw new Error('캐싱할 암호화 키가 필요합니다.');
  }

  try {
    sessionStorage.setItem(ENCRYPTION_KEY_SESSION_KEY, key);
    if (nonce) {
      sessionStorage.setItem(ENCRYPTION_NONCE_SESSION_KEY, nonce);
    }
  } catch {
    // sessionStorage 접근 실패 시 무시 (private browsing 등)
  }
}

/**
 * sessionStorage에서 캐싱된 암호화 키를 조회한다.
 *
 * @returns 캐싱된 암호화 키, 없으면 null
 */
export function getCachedEncryptionKey(): string | null {
  try {
    return sessionStorage.getItem(ENCRYPTION_KEY_SESSION_KEY);
  } catch {
    return null;
  }
}

/**
 * sessionStorage에서 캐싱된 nonce를 조회한다.
 *
 * @returns 캐싱된 nonce, 없으면 null
 */
export function getCachedEncryptionNonce(): string | null {
  try {
    return sessionStorage.getItem(ENCRYPTION_NONCE_SESSION_KEY);
  } catch {
    return null;
  }
}

/**
 * sessionStorage에서 캐싱된 암호화 키와 nonce를 삭제한다.
 */
export function clearCachedEncryptionKey(): void {
  try {
    sessionStorage.removeItem(ENCRYPTION_KEY_SESSION_KEY);
    sessionStorage.removeItem(ENCRYPTION_NONCE_SESSION_KEY);
  } catch {
    // sessionStorage 접근 실패 시 무시
  }
}

/**
 * 특정 지갑 주소에 암호화된 API Key가 존재하는지 확인한다.
 *
 * @param walletAddress 지갑 주소 (0x...)
 * @returns 하나 이상의 거래소에 API Key가 등록되어 있으면 true
 */
export function hasEncryptedKeys(walletAddress: string): boolean {
  return getRegisteredExchanges(walletAddress).length > 0;
}
