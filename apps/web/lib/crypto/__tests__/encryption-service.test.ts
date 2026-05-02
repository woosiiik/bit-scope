/**
 * encryption-service 모듈 단위 테스트
 *
 * AES 암호화/복호화 대칭성, localStorage 저장/로드/삭제,
 * sessionStorage 기반 암호화 키 캐싱, 지갑 주소별 데이터 격리를 검증한다.
 *
 * @see 요구사항 1.4, 8.7, 8.8, 8.9, 8.10, 8.11
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CryptoJS from 'crypto-js';
import type { ApiKeyPair, EncryptedApiKey, ExchangeType } from '@bitscope/shared';
import {
  buildStorageKey,
  encryptApiKey,
  decryptApiKey,
  storeEncryptedKey,
  loadEncryptedKey,
  removeEncryptedKey,
  removeAllEncryptedKeys,
  getRegisteredExchanges,
  cacheEncryptionKey,
  getCachedEncryptionKey,
  clearCachedEncryptionKey,
  hasEncryptedKeys,
} from '../encryption-service';

/**
 * 테스트용 AES 암호화 키를 생성한다.
 * 실제 사용 시에는 지갑 서명에서 SHA-256으로 도출한다.
 */
function generateTestEncryptionKey(): string {
  return CryptoJS.SHA256('test-signature-for-unit-test').toString(CryptoJS.enc.Hex);
}

describe('buildStorageKey', () => {
  it('"bitscope:{지갑주소}:apikey:{거래소}" 형태의 키를 생성한다', () => {
    const key = buildStorageKey('0xabcd1234', 'upbit');
    expect(key).toBe('bitscope:0xabcd1234:apikey:upbit');
  });

  it('지갑 주소를 소문자로 정규화한다', () => {
    const key = buildStorageKey('0xAbCd1234', 'bithumb');
    expect(key).toBe('bitscope:0xabcd1234:apikey:bithumb');
  });

  it('거래소별로 다른 키를 생성한다', () => {
    const address = '0xabcd1234';
    const upbitKey = buildStorageKey(address, 'upbit');
    const bithumbKey = buildStorageKey(address, 'bithumb');
    const coinoneKey = buildStorageKey(address, 'coinone');

    expect(upbitKey).not.toBe(bithumbKey);
    expect(bithumbKey).not.toBe(coinoneKey);
    expect(upbitKey).not.toBe(coinoneKey);
  });

  it('지갑 주소별로 다른 키를 생성한다', () => {
    const key1 = buildStorageKey('0x1111', 'upbit');
    const key2 = buildStorageKey('0x2222', 'upbit');

    expect(key1).not.toBe(key2);
  });
});

describe('encryptApiKey / decryptApiKey', () => {
  const testApiKey: ApiKeyPair = {
    accessKey: 'test-access-key-1234567890',
    secretKey: 'test-secret-key-abcdefghij',
  };
  let encryptionKey: string;

  beforeEach(() => {
    encryptionKey = generateTestEncryptionKey();
  });

  it('API Key를 암호화하고 복호화하면 원본과 동일하다 (대칭성)', () => {
    const encrypted = encryptApiKey(testApiKey, encryptionKey);
    const decrypted = decryptApiKey(encrypted, encryptionKey);

    expect(decrypted.accessKey).toBe(testApiKey.accessKey);
    expect(decrypted.secretKey).toBe(testApiKey.secretKey);
  });

  it('암호화된 데이터가 평문과 다르다', () => {
    const encrypted = encryptApiKey(testApiKey, encryptionKey);

    expect(encrypted.encryptedAccessKey).not.toBe(testApiKey.accessKey);
    expect(encrypted.encryptedSecretKey).not.toBe(testApiKey.secretKey);
  });

  it('암호화 시 IV가 생성된다', () => {
    const encrypted = encryptApiKey(testApiKey, encryptionKey);

    expect(encrypted.iv).toBeTruthy();
    // IV는 16바이트 = 32자 hex 문자열
    expect(encrypted.iv).toHaveLength(32);
    expect(encrypted.iv).toMatch(/^[0-9a-f]{32}$/);
  });

  it('같은 데이터를 암호화해도 매번 다른 암호문을 생성한다 (랜덤 IV)', () => {
    const encrypted1 = encryptApiKey(testApiKey, encryptionKey);
    const encrypted2 = encryptApiKey(testApiKey, encryptionKey);

    // IV가 다르므로 암호문도 달라야 한다
    expect(encrypted1.iv).not.toBe(encrypted2.iv);
    expect(encrypted1.encryptedAccessKey).not.toBe(encrypted2.encryptedAccessKey);
  });

  it('다른 암호화 키로 복호화하면 오류가 발생한다', () => {
    const encrypted = encryptApiKey(testApiKey, encryptionKey);
    const wrongKey = CryptoJS.SHA256('wrong-key').toString(CryptoJS.enc.Hex);

    expect(() => decryptApiKey(encrypted, wrongKey)).toThrow('복호화할 수 없습니다');
  });

  it('손상된 암호화 데이터를 복호화하면 오류가 발생한다', () => {
    const corruptedData: EncryptedApiKey = {
      encryptedAccessKey: 'corrupted-data',
      encryptedSecretKey: 'corrupted-data',
      iv: 'a'.repeat(32),
    };

    expect(() => decryptApiKey(corruptedData, encryptionKey)).toThrow('복호화할 수 없습니다');
  });

  it('Access Key가 빈 문자열이면 암호화 시 오류가 발생한다', () => {
    const invalidKey: ApiKeyPair = { accessKey: '', secretKey: 'valid-secret' };
    expect(() => encryptApiKey(invalidKey, encryptionKey)).toThrow(
      'Access Key와 Secret Key가 모두 필요합니다'
    );
  });

  it('Secret Key가 빈 문자열이면 암호화 시 오류가 발생한다', () => {
    const invalidKey: ApiKeyPair = { accessKey: 'valid-access', secretKey: '' };
    expect(() => encryptApiKey(invalidKey, encryptionKey)).toThrow(
      'Access Key와 Secret Key가 모두 필요합니다'
    );
  });

  it('빈 암호화 키로 암호화하면 오류가 발생한다', () => {
    expect(() => encryptApiKey(testApiKey, '')).toThrow('암호화 키가 필요합니다');
  });

  it('빈 암호화 키로 복호화하면 오류가 발생한다', () => {
    const encrypted = encryptApiKey(testApiKey, encryptionKey);
    expect(() => decryptApiKey(encrypted, '')).toThrow('암호화 키가 필요합니다');
  });

  it('다양한 길이의 API Key를 올바르게 암호화/복호화한다', () => {
    const longApiKey: ApiKeyPair = {
      accessKey: 'a'.repeat(200),
      secretKey: 'b'.repeat(300),
    };

    const encrypted = encryptApiKey(longApiKey, encryptionKey);
    const decrypted = decryptApiKey(encrypted, encryptionKey);

    expect(decrypted.accessKey).toBe(longApiKey.accessKey);
    expect(decrypted.secretKey).toBe(longApiKey.secretKey);
  });

  it('특수 문자가 포함된 API Key를 올바르게 암호화/복호화한다', () => {
    const specialCharKey: ApiKeyPair = {
      accessKey: 'key+with/special=chars!@#$%^&*()',
      secretKey: 'secret-with_underscores.and.dots',
    };

    const encrypted = encryptApiKey(specialCharKey, encryptionKey);
    const decrypted = decryptApiKey(encrypted, encryptionKey);

    expect(decrypted.accessKey).toBe(specialCharKey.accessKey);
    expect(decrypted.secretKey).toBe(specialCharKey.secretKey);
  });

  it('한글이 포함된 API Key를 올바르게 암호화/복호화한다', () => {
    const koreanKey: ApiKeyPair = {
      accessKey: '테스트-access-key-한글',
      secretKey: '테스트-secret-key-한글',
    };

    const encrypted = encryptApiKey(koreanKey, encryptionKey);
    const decrypted = decryptApiKey(encrypted, encryptionKey);

    expect(decrypted.accessKey).toBe(koreanKey.accessKey);
    expect(decrypted.secretKey).toBe(koreanKey.secretKey);
  });
});

describe('localStorage 저장/로드/삭제', () => {
  const testAddress = '0x1234567890abcdef1234567890abcdef12345678';
  const testExchange: ExchangeType = 'upbit';
  const testNonce = 'test-nonce-uuid-v4';
  let encryptionKey: string;
  let localStore: Record<string, string>;

  beforeEach(() => {
    encryptionKey = generateTestEncryptionKey();
    localStore = {};

    // localStorage 모킹
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
      (key: string, value: string) => {
        localStore[key] = value;
      }
    );
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(
      (key: string) => localStore[key] ?? null
    );
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(
      (key: string) => {
        delete localStore[key];
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('storeEncryptedKey', () => {
    it('암호화된 API Key를 localStorage에 저장한다', () => {
      const apiKey: ApiKeyPair = {
        accessKey: 'test-access',
        secretKey: 'test-secret',
      };
      const encrypted = encryptApiKey(apiKey, encryptionKey);

      storeEncryptedKey(testAddress, testExchange, encrypted, testNonce);

      const storageKey = buildStorageKey(testAddress, testExchange);
      expect(localStore[storageKey]).toBeTruthy();

      const stored = JSON.parse(localStore[storageKey]);
      expect(stored.encryptedAccessKey).toBe(encrypted.encryptedAccessKey);
      expect(stored.encryptedSecretKey).toBe(encrypted.encryptedSecretKey);
      expect(stored.iv).toBe(encrypted.iv);
      expect(stored.nonce).toBe(testNonce);
      expect(stored.registeredAt).toBeTruthy();
    });

    it('등록 일시가 ISO 8601 형식으로 저장된다', () => {
      const encrypted = encryptApiKey(
        { accessKey: 'a', secretKey: 'b' },
        encryptionKey
      );

      storeEncryptedKey(testAddress, testExchange, encrypted, testNonce);

      const storageKey = buildStorageKey(testAddress, testExchange);
      const stored = JSON.parse(localStore[storageKey]);

      // ISO 8601 형식 검증
      const date = new Date(stored.registeredAt);
      expect(date.toISOString()).toBe(stored.registeredAt);
    });
  });

  describe('loadEncryptedKey', () => {
    it('저장된 암호화 API Key를 로드한다', () => {
      const apiKey: ApiKeyPair = {
        accessKey: 'test-access',
        secretKey: 'test-secret',
      };
      const encrypted = encryptApiKey(apiKey, encryptionKey);

      storeEncryptedKey(testAddress, testExchange, encrypted, testNonce);
      const loaded = loadEncryptedKey(testAddress, testExchange);

      expect(loaded).not.toBeNull();
      expect(loaded!.encryptedAccessKey).toBe(encrypted.encryptedAccessKey);
      expect(loaded!.encryptedSecretKey).toBe(encrypted.encryptedSecretKey);
      expect(loaded!.iv).toBe(encrypted.iv);
      expect(loaded!.nonce).toBe(testNonce);
    });

    it('데이터가 없으면 null을 반환한다', () => {
      const loaded = loadEncryptedKey(testAddress, 'bithumb');
      expect(loaded).toBeNull();
    });

    it('잘못된 JSON 데이터가 저장되어 있으면 null을 반환한다', () => {
      const storageKey = buildStorageKey(testAddress, testExchange);
      localStore[storageKey] = 'invalid-json';

      const loaded = loadEncryptedKey(testAddress, testExchange);
      expect(loaded).toBeNull();
    });

    it('필수 필드가 누락된 데이터가 저장되어 있으면 null을 반환한다', () => {
      const storageKey = buildStorageKey(testAddress, testExchange);
      localStore[storageKey] = JSON.stringify({
        encryptedAccessKey: 'test',
        // encryptedSecretKey, iv, nonce 누락
      });

      const loaded = loadEncryptedKey(testAddress, testExchange);
      expect(loaded).toBeNull();
    });
  });

  describe('removeEncryptedKey', () => {
    it('저장된 암호화 API Key를 삭제한다', () => {
      const encrypted = encryptApiKey(
        { accessKey: 'a', secretKey: 'b' },
        encryptionKey
      );
      storeEncryptedKey(testAddress, testExchange, encrypted, testNonce);

      removeEncryptedKey(testAddress, testExchange);

      const loaded = loadEncryptedKey(testAddress, testExchange);
      expect(loaded).toBeNull();
    });

    it('존재하지 않는 키를 삭제해도 오류가 발생하지 않는다', () => {
      expect(() => removeEncryptedKey(testAddress, 'coinone')).not.toThrow();
    });
  });

  describe('removeAllEncryptedKeys', () => {
    it('특정 지갑 주소의 모든 거래소 API Key를 삭제한다', () => {
      const exchanges: ExchangeType[] = ['upbit', 'bithumb', 'coinone'];

      // 모든 거래소에 API Key 등록
      for (const exchange of exchanges) {
        const encrypted = encryptApiKey(
          { accessKey: `access-${exchange}`, secretKey: `secret-${exchange}` },
          encryptionKey
        );
        storeEncryptedKey(testAddress, exchange, encrypted, testNonce);
      }

      // 전체 삭제
      removeAllEncryptedKeys(testAddress);

      // 모두 삭제되었는지 확인
      for (const exchange of exchanges) {
        expect(loadEncryptedKey(testAddress, exchange)).toBeNull();
      }
    });

    it('다른 지갑 주소의 데이터에는 영향을 주지 않는다', () => {
      const otherAddress = '0xother_wallet_address_1234567890123456';

      // 두 지갑에 각각 API Key 등록
      const encrypted1 = encryptApiKey(
        { accessKey: 'a1', secretKey: 's1' },
        encryptionKey
      );
      const encrypted2 = encryptApiKey(
        { accessKey: 'a2', secretKey: 's2' },
        encryptionKey
      );
      storeEncryptedKey(testAddress, 'upbit', encrypted1, testNonce);
      storeEncryptedKey(otherAddress, 'upbit', encrypted2, testNonce);

      // 첫 번째 지갑만 삭제
      removeAllEncryptedKeys(testAddress);

      // 첫 번째 지갑의 데이터만 삭제되었는지 확인
      expect(loadEncryptedKey(testAddress, 'upbit')).toBeNull();
      expect(loadEncryptedKey(otherAddress, 'upbit')).not.toBeNull();
    });
  });

  describe('getRegisteredExchanges', () => {
    it('등록된 거래소 목록을 반환한다', () => {
      const encrypted = encryptApiKey(
        { accessKey: 'a', secretKey: 'b' },
        encryptionKey
      );
      storeEncryptedKey(testAddress, 'upbit', encrypted, testNonce);
      storeEncryptedKey(testAddress, 'coinone', encrypted, testNonce);

      const registered = getRegisteredExchanges(testAddress);

      expect(registered).toContain('upbit');
      expect(registered).toContain('coinone');
      expect(registered).not.toContain('bithumb');
      expect(registered).toHaveLength(2);
    });

    it('등록된 거래소가 없으면 빈 배열을 반환한다', () => {
      const registered = getRegisteredExchanges(testAddress);
      expect(registered).toEqual([]);
    });
  });

  describe('hasEncryptedKeys', () => {
    it('등록된 API Key가 있으면 true를 반환한다', () => {
      const encrypted = encryptApiKey(
        { accessKey: 'a', secretKey: 'b' },
        encryptionKey
      );
      storeEncryptedKey(testAddress, 'upbit', encrypted, testNonce);

      expect(hasEncryptedKeys(testAddress)).toBe(true);
    });

    it('등록된 API Key가 없으면 false를 반환한다', () => {
      expect(hasEncryptedKeys(testAddress)).toBe(false);
    });
  });

  describe('저장 → 로드 → 복호화 통합 플로우', () => {
    it('전체 플로우가 정상적으로 동작한다', () => {
      const originalKey: ApiKeyPair = {
        accessKey: 'my-upbit-access-key-abcdef',
        secretKey: 'my-upbit-secret-key-123456',
      };

      // 1. 암호화
      const encrypted = encryptApiKey(originalKey, encryptionKey);

      // 2. localStorage에 저장
      storeEncryptedKey(testAddress, 'upbit', encrypted, testNonce);

      // 3. localStorage에서 로드
      const loaded = loadEncryptedKey(testAddress, 'upbit');
      expect(loaded).not.toBeNull();

      // 4. 복호화
      const decrypted = decryptApiKey(
        {
          encryptedAccessKey: loaded!.encryptedAccessKey,
          encryptedSecretKey: loaded!.encryptedSecretKey,
          iv: loaded!.iv,
        },
        encryptionKey
      );

      // 5. 원본과 동일한지 확인
      expect(decrypted.accessKey).toBe(originalKey.accessKey);
      expect(decrypted.secretKey).toBe(originalKey.secretKey);
    });
  });
});

describe('sessionStorage 암호화 키 캐싱', () => {
  let sessionStore: Record<string, string>;

  beforeEach(() => {
    sessionStore = {};

    // sessionStorage 모킹
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
      (key: string, value: string) => {
        sessionStore[key] = value;
      }
    );
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(
      (key: string) => sessionStore[key] ?? null
    );
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(
      (key: string) => {
        delete sessionStore[key];
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('cacheEncryptionKey', () => {
    it('암호화 키를 sessionStorage에 캐싱한다', () => {
      const testKey = 'a'.repeat(64);

      cacheEncryptionKey(testKey);

      expect(sessionStore['bitscope:encryptionKey']).toBe(testKey);
    });

    it('빈 암호화 키를 캐싱하면 오류가 발생한다', () => {
      expect(() => cacheEncryptionKey('')).toThrow('캐싱할 암호화 키가 필요합니다');
    });
  });

  describe('getCachedEncryptionKey', () => {
    it('캐싱된 암호화 키를 반환한다', () => {
      const testKey = 'b'.repeat(64);
      cacheEncryptionKey(testKey);

      const cached = getCachedEncryptionKey();
      expect(cached).toBe(testKey);
    });

    it('캐싱된 키가 없으면 null을 반환한다', () => {
      const cached = getCachedEncryptionKey();
      expect(cached).toBeNull();
    });
  });

  describe('clearCachedEncryptionKey', () => {
    it('캐싱된 암호화 키를 삭제한다', () => {
      cacheEncryptionKey('c'.repeat(64));

      clearCachedEncryptionKey();

      const cached = getCachedEncryptionKey();
      expect(cached).toBeNull();
    });

    it('캐싱된 키가 없어도 오류가 발생하지 않는다', () => {
      expect(() => clearCachedEncryptionKey()).not.toThrow();
    });
  });

  describe('캐싱 키와 복호화 통합 플로우', () => {
    it('캐싱된 키로 API Key를 복호화할 수 있다', () => {
      const encryptionKey = generateTestEncryptionKey();
      const apiKey: ApiKeyPair = {
        accessKey: 'cached-test-access',
        secretKey: 'cached-test-secret',
      };

      // 암호화
      const encrypted = encryptApiKey(apiKey, encryptionKey);

      // 키 캐싱
      cacheEncryptionKey(encryptionKey);

      // 캐싱된 키 조회
      const cachedKey = getCachedEncryptionKey();
      expect(cachedKey).not.toBeNull();

      // 캐싱된 키로 복호화
      const decrypted = decryptApiKey(encrypted, cachedKey!);
      expect(decrypted.accessKey).toBe(apiKey.accessKey);
      expect(decrypted.secretKey).toBe(apiKey.secretKey);
    });
  });
});
