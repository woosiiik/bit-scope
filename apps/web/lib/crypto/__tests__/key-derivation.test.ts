/**
 * key-derivation 모듈 단위 테스트
 *
 * nonce 고유성, 서명 메시지 구성, SHA-256 키 도출 결정론적 검증,
 * 전체 암호화 키 도출 프로세스 검증을 수행한다.
 *
 * @see 요구사항 8.4, 8.5, 8.6, 8.8
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateNonce,
  buildSignatureMessage,
  deriveKeyFromSignature,
  deriveEncryptionKey,
} from '../key-derivation';

describe('generateNonce', () => {
  it('UUID v4 형식의 고유 nonce를 생성한다', () => {
    const nonce = generateNonce();

    // UUID v4 형식 검증 (xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(nonce).toMatch(uuidV4Regex);
  });

  it('매번 고유한 nonce를 생성한다', () => {
    const nonces = new Set<string>();
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      nonces.add(generateNonce());
    }

    // 100회 생성 시 모두 고유해야 한다
    expect(nonces.size).toBe(iterations);
  });

  it('빈 문자열이 아닌 nonce를 생성한다', () => {
    const nonce = generateNonce();
    expect(nonce).toBeTruthy();
    expect(nonce.length).toBeGreaterThan(0);
  });
});

describe('buildSignatureMessage', () => {
  it('"BitScope:encrypt:{address}:{nonce}" 형태의 메시지를 생성한다', () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678';
    const nonce = '550e8400-e29b-41d4-a716-446655440000';

    const message = buildSignatureMessage(address, nonce);

    expect(message).toBe(`BitScope:encrypt:${address}:${nonce}`);
  });

  it('지갑 주소를 소문자로 정규화한다', () => {
    const mixedCaseAddress = '0xAbCdEf1234567890aBcDeF1234567890AbCdEf12';
    const nonce = 'test-nonce-value';

    const message = buildSignatureMessage(mixedCaseAddress, nonce);

    expect(message).toBe(`BitScope:encrypt:${mixedCaseAddress.toLowerCase()}:${nonce}`);
  });

  it('동일한 입력에 대해 항상 동일한 메시지를 생성한다', () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678';
    const nonce = 'fixed-nonce';

    const message1 = buildSignatureMessage(address, nonce);
    const message2 = buildSignatureMessage(address, nonce);

    expect(message1).toBe(message2);
  });

  it('빈 지갑 주소를 전달하면 오류를 발생시킨다', () => {
    expect(() => buildSignatureMessage('', 'test-nonce')).toThrow('지갑 주소가 필요합니다');
  });

  it('빈 nonce를 전달하면 오류를 발생시킨다', () => {
    expect(() =>
      buildSignatureMessage('0x1234567890abcdef1234567890abcdef12345678', '')
    ).toThrow('nonce가 필요합니다');
  });
});

describe('deriveKeyFromSignature', () => {
  it('서명 결과를 SHA-256 해시하여 키를 도출한다', () => {
    const signature = '0xabcdef1234567890';

    const key = deriveKeyFromSignature(signature);

    // SHA-256 결과는 64자 hex 문자열이어야 한다
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('동일한 서명에 대해 항상 동일한 키를 도출한다 (결정론적)', () => {
    const signature = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    const key1 = deriveKeyFromSignature(signature);
    const key2 = deriveKeyFromSignature(signature);

    expect(key1).toBe(key2);
  });

  it('다른 서명에 대해 다른 키를 도출한다', () => {
    const signature1 = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
    const signature2 = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2';

    const key1 = deriveKeyFromSignature(signature1);
    const key2 = deriveKeyFromSignature(signature2);

    expect(key1).not.toBe(key2);
  });

  it('빈 서명을 전달하면 오류를 발생시킨다', () => {
    expect(() => deriveKeyFromSignature('')).toThrow('서명이 필요합니다');
  });
});

describe('deriveEncryptionKey', () => {
  const testAddress = '0x1234567890abcdef1234567890abcdef12345678';
  const testSignature = '0xmock_signature_result_1234567890abcdef';
  let mockSignFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSignFn = vi.fn().mockResolvedValue(testSignature);
  });

  it('전체 암호화 키 도출 프로세스를 수행한다', async () => {
    const result = await deriveEncryptionKey(testAddress, mockSignFn);

    // nonce가 생성되었는지 확인
    expect(result.nonce).toBeTruthy();

    // 서명 메시지가 올바른 형식인지 확인
    expect(result.signatureMessage).toBe(
      `BitScope:encrypt:${testAddress.toLowerCase()}:${result.nonce}`
    );

    // 서명 함수가 올바른 메시지로 호출되었는지 확인
    expect(mockSignFn).toHaveBeenCalledWith(result.signatureMessage);

    // 서명 결과가 저장되었는지 확인
    expect(result.signature).toBe(testSignature);

    // 도출된 키가 SHA-256 해시 결과인지 확인
    expect(result.derivedKey).toHaveLength(64);
    expect(result.derivedKey).toMatch(/^[0-9a-f]{64}$/);

    // 지갑 주소가 소문자로 정규화되었는지 확인
    expect(result.walletAddress).toBe(testAddress.toLowerCase());
  });

  it('기존 nonce를 사용하여 재서명한다', async () => {
    const existingNonce = 'existing-nonce-value';

    const result = await deriveEncryptionKey(testAddress, mockSignFn, existingNonce);

    expect(result.nonce).toBe(existingNonce);
    expect(result.signatureMessage).toContain(existingNonce);
  });

  it('기존 nonce가 없으면 새 nonce를 생성한다', async () => {
    const result = await deriveEncryptionKey(testAddress, mockSignFn);

    // UUID v4 형식의 nonce가 생성되어야 한다
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(result.nonce).toMatch(uuidV4Regex);
  });

  it('동일한 서명 결과에 대해 동일한 암호화 키를 도출한다', async () => {
    const nonce = 'fixed-nonce';

    const result1 = await deriveEncryptionKey(testAddress, mockSignFn, nonce);
    const result2 = await deriveEncryptionKey(testAddress, mockSignFn, nonce);

    expect(result1.derivedKey).toBe(result2.derivedKey);
  });

  it('빈 지갑 주소를 전달하면 오류를 발생시킨다', async () => {
    await expect(deriveEncryptionKey('', mockSignFn)).rejects.toThrow('지갑 주소가 필요합니다');
  });

  it('서명 함수 실패 시 오류를 전파한다', async () => {
    const failingSignFn = vi.fn().mockRejectedValue(new Error('사용자가 서명을 거부했습니다'));

    await expect(deriveEncryptionKey(testAddress, failingSignFn)).rejects.toThrow(
      '사용자가 서명을 거부했습니다'
    );
  });

  it('대소문자가 다른 주소를 소문자로 정규화한다', async () => {
    const mixedCaseAddress = '0xAbCdEf1234567890aBcDeF1234567890AbCdEf12';

    const result = await deriveEncryptionKey(mixedCaseAddress, mockSignFn);

    expect(result.walletAddress).toBe(mixedCaseAddress.toLowerCase());
  });
});
