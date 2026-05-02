import { describe, it, expect } from 'vitest';
import {
  validateUpbitApiKeyFormat,
  validateBithumbApiKeyFormat,
  validateCoinoneApiKeyFormat,
  validateApiKeyFormat,
  isValidWalletAddress,
  sanitizeApiKey,
  maskSecretKey,
} from './validation';

describe('validateUpbitApiKeyFormat', () => {
  it('유효한 Access Key와 Secret Key를 통과시킨다', () => {
    const result = validateUpbitApiKeyFormat({
      accessKey: 'test-access-key-12345',
      secretKey: 'test-secret-key-67890',
    });
    expect(result.isValid).toBe(true);
    expect(result.isAccessKeyValid).toBe(true);
    expect(result.isSecretKeyValid).toBe(true);
    expect(result.errorMessage).toBeUndefined();
  });

  it('빈 Access Key를 거부한다', () => {
    const result = validateUpbitApiKeyFormat({
      accessKey: '',
      secretKey: 'valid-secret',
    });
    expect(result.isValid).toBe(false);
    expect(result.isAccessKeyValid).toBe(false);
    expect(result.isSecretKeyValid).toBe(true);
    expect(result.errorMessage).toBeDefined();
  });

  it('빈 Secret Key를 거부한다', () => {
    const result = validateUpbitApiKeyFormat({
      accessKey: 'valid-access',
      secretKey: '',
    });
    expect(result.isValid).toBe(false);
    expect(result.isAccessKeyValid).toBe(true);
    expect(result.isSecretKeyValid).toBe(false);
    expect(result.errorMessage).toBeDefined();
  });

  it('빈 Access Key와 Secret Key를 모두 거부한다', () => {
    const result = validateUpbitApiKeyFormat({
      accessKey: '',
      secretKey: '',
    });
    expect(result.isValid).toBe(false);
    expect(result.isAccessKeyValid).toBe(false);
    expect(result.isSecretKeyValid).toBe(false);
    expect(result.errorMessage).toContain('모두');
  });

  it('공백만 있는 키를 거부한다', () => {
    const result = validateUpbitApiKeyFormat({
      accessKey: '   ',
      secretKey: '  ',
    });
    expect(result.isValid).toBe(false);
  });
});

describe('validateBithumbApiKeyFormat', () => {
  it('유효한 키 쌍을 통과시킨다', () => {
    const result = validateBithumbApiKeyFormat({
      accessKey: 'bithumb-access-key',
      secretKey: 'bithumb-secret-key',
    });
    expect(result.isValid).toBe(true);
    expect(result.isAccessKeyValid).toBe(true);
    expect(result.isSecretKeyValid).toBe(true);
  });

  it('빈 키를 거부한다', () => {
    const result = validateBithumbApiKeyFormat({
      accessKey: '',
      secretKey: '',
    });
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBeDefined();
  });
});

describe('validateCoinoneApiKeyFormat', () => {
  it('유효한 키 쌍을 통과시킨다', () => {
    const result = validateCoinoneApiKeyFormat({
      accessKey: 'coinone-access-token',
      secretKey: 'coinone-secret-key',
    });
    expect(result.isValid).toBe(true);
  });

  it('빈 Access Token만 제공하면 거부한다', () => {
    const result = validateCoinoneApiKeyFormat({
      accessKey: '',
      secretKey: 'valid-secret',
    });
    expect(result.isValid).toBe(false);
    expect(result.isAccessKeyValid).toBe(false);
    expect(result.errorMessage).toContain('Access Token');
  });

  it('빈 Secret Key만 제공하면 거부한다', () => {
    const result = validateCoinoneApiKeyFormat({
      accessKey: 'valid-access',
      secretKey: '',
    });
    expect(result.isValid).toBe(false);
    expect(result.isSecretKeyValid).toBe(false);
    expect(result.errorMessage).toContain('Secret Key');
  });
});

describe('validateApiKeyFormat', () => {
  it('업비트 거래소를 올바르게 디스패치한다', () => {
    const result = validateApiKeyFormat('upbit', {
      accessKey: 'test-key',
      secretKey: 'test-secret',
    });
    expect(result.isValid).toBe(true);
  });

  it('빗썸 거래소를 올바르게 디스패치한다', () => {
    const result = validateApiKeyFormat('bithumb', {
      accessKey: 'test-key',
      secretKey: 'test-secret',
    });
    expect(result.isValid).toBe(true);
  });

  it('코인원 거래소를 올바르게 디스패치한다', () => {
    const result = validateApiKeyFormat('coinone', {
      accessKey: 'test-key',
      secretKey: 'test-secret',
    });
    expect(result.isValid).toBe(true);
  });

  it('빈 키에 대해 각 거래소별로 적절한 오류 메시지를 반환한다', () => {
    const upbitResult = validateApiKeyFormat('upbit', {
      accessKey: '',
      secretKey: '',
    });
    expect(upbitResult.isValid).toBe(false);

    const bithumbResult = validateApiKeyFormat('bithumb', {
      accessKey: '',
      secretKey: '',
    });
    expect(bithumbResult.isValid).toBe(false);

    const coinoneResult = validateApiKeyFormat('coinone', {
      accessKey: '',
      secretKey: '',
    });
    expect(coinoneResult.isValid).toBe(false);
  });
});

describe('isValidWalletAddress', () => {
  it('유효한 이더리움 주소를 통과시킨다', () => {
    expect(
      isValidWalletAddress('0x1234567890abcdef1234567890abcdef12345678'),
    ).toBe(true);
    expect(
      isValidWalletAddress('0xABCDEF1234567890abcdef1234567890ABCDEF12'),
    ).toBe(true);
  });

  it('0x 접두사가 없는 주소를 거부한다', () => {
    expect(
      isValidWalletAddress('1234567890abcdef1234567890abcdef12345678'),
    ).toBe(false);
  });

  it('길이가 맞지 않는 주소를 거부한다', () => {
    expect(isValidWalletAddress('0x1234')).toBe(false);
    expect(
      isValidWalletAddress(
        '0x1234567890abcdef1234567890abcdef1234567890extra',
      ),
    ).toBe(false);
  });

  it('16진수가 아닌 문자를 포함한 주소를 거부한다', () => {
    expect(
      isValidWalletAddress('0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG'),
    ).toBe(false);
  });

  it('빈 문자열을 거부한다', () => {
    expect(isValidWalletAddress('')).toBe(false);
  });

  it('문자열이 아닌 입력을 거부한다', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(isValidWalletAddress(null as any)).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(isValidWalletAddress(undefined as any)).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(isValidWalletAddress(12345 as any)).toBe(false);
  });
});

describe('sanitizeApiKey', () => {
  it('앞뒤 공백을 제거한다', () => {
    expect(sanitizeApiKey('  my-api-key  ')).toBe('my-api-key');
    expect(sanitizeApiKey('\tmy-api-key\n')).toBe('my-api-key');
  });

  it('공백이 없는 키는 그대로 반환한다', () => {
    expect(sanitizeApiKey('my-api-key')).toBe('my-api-key');
  });

  it('빈 문자열은 빈 문자열을 반환한다', () => {
    expect(sanitizeApiKey('')).toBe('');
  });

  it('문자열이 아닌 입력은 빈 문자열을 반환한다', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(sanitizeApiKey(null as any)).toBe('');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(sanitizeApiKey(undefined as any)).toBe('');
  });
});

describe('maskSecretKey', () => {
  it('마지막 4자리만 표시하고 나머지를 마스킹한다', () => {
    expect(maskSecretKey('abcdefghijklmnop')).toBe('************mnop');
  });

  it('4자리 이하의 키는 마지막 4자리까지만 표시한다', () => {
    // 4자리 이하: visibleLength = 키 길이이므로 마스킹 없이 전체 노출
    expect(maskSecretKey('ab')).toBe('ab');
    expect(maskSecretKey('abcd')).toBe('abcd');
  });

  it('정확히 5자리 키를 올바르게 처리한다', () => {
    expect(maskSecretKey('abcde')).toBe('*bcde');
  });

  it('빈 문자열은 빈 문자열을 반환한다', () => {
    expect(maskSecretKey('')).toBe('');
  });

  it('문자열이 아닌 입력은 빈 문자열을 반환한다', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(maskSecretKey(null as any)).toBe('');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(maskSecretKey(undefined as any)).toBe('');
  });

  it('8자리 키의 마스킹을 올바르게 처리한다', () => {
    expect(maskSecretKey('12345678')).toBe('****5678');
  });
});
