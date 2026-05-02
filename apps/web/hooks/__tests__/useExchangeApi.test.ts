/**
 * useExchangeApi 훅 단위 테스트
 *
 * React Query 기반 거래소 API 훅의 쿼리 키 생성,
 * API Key 복호화 헬퍼 함수 등 순수 로직을 검증한다.
 *
 * React 훅 자체의 렌더링 테스트는 통합 테스트에서 수행하며,
 * 여기서는 내보내진 유틸리티 함수와 쿼리 키 구조를 검증한다.
 *
 * @see 요구사항 2.4, 2.5, 2.11, NF1.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  exchangeQueryKeys,
  decryptApiKeyForExchange,
  decryptAllApiKeys,
} from '../useExchangeApi';

// EncryptionService 모킹
vi.mock('../../lib/crypto/encryption-service', () => ({
  getCachedEncryptionKey: vi.fn(),
  loadEncryptedKey: vi.fn(),
  decryptApiKey: vi.fn(),
  getRegisteredExchanges: vi.fn(),
}));

import {
  getCachedEncryptionKey,
  loadEncryptedKey,
  decryptApiKey,
  getRegisteredExchanges,
} from '../../lib/crypto/encryption-service';

const mockGetCachedEncryptionKey = getCachedEncryptionKey as ReturnType<typeof vi.fn>;
const mockLoadEncryptedKey = loadEncryptedKey as ReturnType<typeof vi.fn>;
const mockDecryptApiKey = decryptApiKey as ReturnType<typeof vi.fn>;
const mockGetRegisteredExchanges = getRegisteredExchanges as ReturnType<typeof vi.fn>;

describe('exchangeQueryKeys', () => {
  it('all 키가 올바르게 생성된다', () => {
    expect(exchangeQueryKeys.all).toEqual(['exchange']);
  });

  it('exchange 키가 거래소별로 올바르게 생성된다', () => {
    expect(exchangeQueryKeys.exchange('upbit')).toEqual(['exchange', 'upbit']);
    expect(exchangeQueryKeys.exchange('bithumb')).toEqual(['exchange', 'bithumb']);
    expect(exchangeQueryKeys.exchange('coinone')).toEqual(['exchange', 'coinone']);
  });

  it('balance 키가 올바르게 생성된다', () => {
    expect(exchangeQueryKeys.balance('upbit')).toEqual([
      'exchange',
      'upbit',
      'balance',
    ]);
  });

  it('allBalances 키가 올바르게 생성된다', () => {
    expect(exchangeQueryKeys.allBalances()).toEqual([
      'exchange',
      'all-balances',
    ]);
  });

  it('ticker 키가 심볼 배열과 함께 올바르게 생성된다', () => {
    const key = exchangeQueryKeys.ticker('upbit', ['BTC', 'ETH']);
    expect(key).toEqual(['exchange', 'upbit', 'ticker', ['BTC', 'ETH']]);
  });

  it('ticker 키가 심볼 없이 올바르게 생성된다', () => {
    const key = exchangeQueryKeys.ticker('upbit');
    expect(key).toEqual(['exchange', 'upbit', 'ticker', 'all']);
  });

  it('orderbook 키가 올바르게 생성된다', () => {
    const key = exchangeQueryKeys.orderbook('upbit', 'BTC');
    expect(key).toEqual(['exchange', 'upbit', 'orderbook', 'BTC']);
  });

  it('orderHistory 키가 파라미터와 함께 올바르게 생성된다', () => {
    const params = { symbol: 'BTC', limit: 50 };
    const key = exchangeQueryKeys.orderHistory('upbit', params);
    expect(key).toEqual(['exchange', 'upbit', 'orders', params]);
  });

  it('orderHistory 키가 파라미터 없이 올바르게 생성된다', () => {
    const key = exchangeQueryKeys.orderHistory('upbit');
    expect(key).toEqual(['exchange', 'upbit', 'orders', {}]);
  });
});

describe('decryptApiKeyForExchange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('암호화 키와 저장된 데이터가 있으면 복호화된 API Key를 반환한다', () => {
    mockGetCachedEncryptionKey.mockReturnValue('test-encryption-key');
    mockLoadEncryptedKey.mockReturnValue({
      encryptedAccessKey: 'enc-access',
      encryptedSecretKey: 'enc-secret',
      iv: 'test-iv',
      nonce: 'test-nonce',
      registeredAt: '2024-01-01T00:00:00.000Z',
    });
    mockDecryptApiKey.mockReturnValue({
      accessKey: 'decrypted-access',
      secretKey: 'decrypted-secret',
    });

    const result = decryptApiKeyForExchange('0x1234', 'upbit');

    expect(result).toEqual({
      accessKey: 'decrypted-access',
      secretKey: 'decrypted-secret',
    });
    expect(mockDecryptApiKey).toHaveBeenCalledWith(
      {
        encryptedAccessKey: 'enc-access',
        encryptedSecretKey: 'enc-secret',
        iv: 'test-iv',
      },
      'test-encryption-key',
    );
  });

  it('캐싱된 암호화 키가 없으면 null을 반환한다', () => {
    mockGetCachedEncryptionKey.mockReturnValue(null);

    const result = decryptApiKeyForExchange('0x1234', 'upbit');

    expect(result).toBeNull();
    expect(mockLoadEncryptedKey).not.toHaveBeenCalled();
  });

  it('저장된 암호화 데이터가 없으면 null을 반환한다', () => {
    mockGetCachedEncryptionKey.mockReturnValue('test-encryption-key');
    mockLoadEncryptedKey.mockReturnValue(null);

    const result = decryptApiKeyForExchange('0x1234', 'upbit');

    expect(result).toBeNull();
    expect(mockDecryptApiKey).not.toHaveBeenCalled();
  });

  it('복호화 실패 시 null을 반환한다', () => {
    mockGetCachedEncryptionKey.mockReturnValue('test-encryption-key');
    mockLoadEncryptedKey.mockReturnValue({
      encryptedAccessKey: 'enc-access',
      encryptedSecretKey: 'enc-secret',
      iv: 'test-iv',
      nonce: 'test-nonce',
      registeredAt: '2024-01-01T00:00:00.000Z',
    });
    mockDecryptApiKey.mockImplementation(() => {
      throw new Error('복호화 실패');
    });

    const result = decryptApiKeyForExchange('0x1234', 'upbit');

    expect(result).toBeNull();
  });
});

describe('decryptAllApiKeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('등록된 모든 거래소의 API Key를 복호화하여 반환한다', () => {
    mockGetRegisteredExchanges.mockReturnValue(['upbit', 'bithumb']);
    mockGetCachedEncryptionKey.mockReturnValue('test-encryption-key');
    mockLoadEncryptedKey.mockReturnValue({
      encryptedAccessKey: 'enc-access',
      encryptedSecretKey: 'enc-secret',
      iv: 'test-iv',
      nonce: 'test-nonce',
      registeredAt: '2024-01-01T00:00:00.000Z',
    });
    mockDecryptApiKey.mockReturnValue({
      accessKey: 'decrypted-access',
      secretKey: 'decrypted-secret',
    });

    const result = decryptAllApiKeys('0x1234');

    expect(Object.keys(result)).toHaveLength(2);
    expect(result.upbit).toBeDefined();
    expect(result.bithumb).toBeDefined();
  });

  it('등록된 거래소가 없으면 빈 객체를 반환한다', () => {
    mockGetRegisteredExchanges.mockReturnValue([]);

    const result = decryptAllApiKeys('0x1234');

    expect(Object.keys(result)).toHaveLength(0);
  });

  it('일부 거래소만 복호화 가능하면 해당 거래소만 포함한다', () => {
    mockGetRegisteredExchanges.mockReturnValue(['upbit', 'bithumb', 'coinone']);
    mockGetCachedEncryptionKey.mockReturnValue('test-encryption-key');

    // 업비트: 정상 복호화
    mockLoadEncryptedKey.mockReturnValueOnce({
      encryptedAccessKey: 'enc-access',
      encryptedSecretKey: 'enc-secret',
      iv: 'test-iv',
      nonce: 'test-nonce',
      registeredAt: '2024-01-01T00:00:00.000Z',
    });
    mockDecryptApiKey.mockReturnValueOnce({
      accessKey: 'upbit-access',
      secretKey: 'upbit-secret',
    });

    // 빗썸: 저장 데이터 없음
    mockLoadEncryptedKey.mockReturnValueOnce(null);

    // 코인원: 복호화 실패
    mockLoadEncryptedKey.mockReturnValueOnce({
      encryptedAccessKey: 'enc-access',
      encryptedSecretKey: 'enc-secret',
      iv: 'test-iv',
      nonce: 'test-nonce',
      registeredAt: '2024-01-01T00:00:00.000Z',
    });
    mockDecryptApiKey.mockImplementationOnce(() => {
      throw new Error('복호화 실패');
    });

    const result = decryptAllApiKeys('0x1234');

    // 업비트만 복호화 성공
    expect(Object.keys(result)).toHaveLength(1);
    expect(result.upbit).toBeDefined();
    expect(result.bithumb).toBeUndefined();
    expect(result.coinone).toBeUndefined();
  });
});
