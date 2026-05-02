/**
 * 업비트 서명 모듈 (UpbitSigner) 단위 테스트
 *
 * JWT 토큰 생성, query_hash(SHA512) 계산, 서명 정확성,
 * API Key 유효성 검증 로직을 검증한다.
 *
 * @see 요구사항 12.1, 8.17
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CryptoJS from 'crypto-js';
import {
  buildQueryString,
  hashQueryString,
  buildJwtPayload,
  createJwtToken,
  signRequest,
  validateApiKey,
  getExchangeType,
} from '../upbit-signer';
import type { ApiKeyPair, SignRequestParams } from '@bitscope/shared';

/** 테스트용 API Key */
const TEST_API_KEY: ApiKeyPair = {
  accessKey: 'test-access-key-1234567890',
  secretKey: 'test-secret-key-abcdefghij',
};

/**
 * Base64URL 디코딩 헬퍼 함수
 * JWT 토큰의 각 부분을 디코딩하여 검증에 사용한다.
 */
function base64UrlDecode(input: string): string {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  // 패딩 추가
  const pad = base64.length % 4;
  if (pad) {
    base64 += '='.repeat(4 - pad);
  }
  return CryptoJS.enc.Base64.parse(base64).toString(CryptoJS.enc.Utf8);
}

/**
 * SignedRequest에서 JWT 토큰을 추출하는 헬퍼 함수
 *
 * @param headers 서명된 요청의 헤더 객체
 * @returns JWT 토큰 문자열
 */
function extractJwtToken(headers: Record<string, string>): string {
  const authHeader = headers['Authorization'];
  if (!authHeader) {
    throw new Error('Authorization 헤더가 없습니다.');
  }
  return authHeader.replace('Bearer ', '');
}

/**
 * JWT 토큰에서 페이로드를 디코딩하는 헬퍼 함수
 *
 * @param token JWT 토큰 문자열
 * @returns 디코딩된 페이로드 객체
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  const payloadPart = parts[1];
  if (!payloadPart) {
    throw new Error('JWT 토큰 구조가 올바르지 않습니다.');
  }
  return JSON.parse(base64UrlDecode(payloadPart)) as Record<string, unknown>;
}

describe('buildQueryString', () => {
  it('단일 파라미터를 querystring으로 변환한다', () => {
    const params = { market: 'KRW-BTC' };
    const result = buildQueryString(params);
    expect(result).toBe('market=KRW-BTC');
  });

  it('복수 파라미터를 &로 연결한다', () => {
    const params = { market: 'KRW-BTC', count: '100' };
    const result = buildQueryString(params);
    expect(result).toContain('market=KRW-BTC');
    expect(result).toContain('count=100');
    expect(result).toContain('&');
  });

  it('빈 객체에 대해 빈 문자열을 반환한다', () => {
    const result = buildQueryString({});
    expect(result).toBe('');
  });

  it('특수문자가 포함된 값을 URL 인코딩한다', () => {
    const params = { key: 'value with spaces' };
    const result = buildQueryString(params);
    expect(result).toBe('key=value%20with%20spaces');
  });

  it('한글이 포함된 값을 URL 인코딩한다', () => {
    const params = { name: '비트코인' };
    const result = buildQueryString(params);
    expect(result).toContain('name=');
    // URL 인코딩된 한글 포함 확인
    expect(decodeURIComponent(result)).toBe('name=비트코인');
  });
});

describe('hashQueryString', () => {
  it('querystring의 SHA-512 해시를 반환한다', () => {
    const queryString = 'market=KRW-BTC';
    const hash = hashQueryString(queryString);

    // SHA-512 결과는 128자 hex 문자열이어야 한다
    expect(hash).toHaveLength(128);
    expect(hash).toMatch(/^[0-9a-f]{128}$/);
  });

  it('동일한 입력에 대해 항상 동일한 해시를 반환한다 (결정론적)', () => {
    const queryString = 'market=KRW-ETH&count=50';
    const hash1 = hashQueryString(queryString);
    const hash2 = hashQueryString(queryString);

    expect(hash1).toBe(hash2);
  });

  it('다른 입력에 대해 다른 해시를 반환한다', () => {
    const hash1 = hashQueryString('market=KRW-BTC');
    const hash2 = hashQueryString('market=KRW-ETH');

    expect(hash1).not.toBe(hash2);
  });

  it('빈 문자열에 대해서도 해시를 반환한다', () => {
    const hash = hashQueryString('');

    expect(hash).toHaveLength(128);
    expect(hash).toMatch(/^[0-9a-f]{128}$/);
  });
});

describe('buildJwtPayload', () => {
  it('query parameter가 없는 경우 기본 페이로드를 생성한다', () => {
    const payload = buildJwtPayload(TEST_API_KEY.accessKey);

    expect(payload.access_key).toBe(TEST_API_KEY.accessKey);
    expect(payload.nonce).toBeTruthy();
    expect(typeof payload.nonce).toBe('string');
    expect(payload.timestamp).toBeTruthy();
    expect(typeof payload.timestamp).toBe('number');

    // query_hash가 없어야 한다
    expect(payload.query_hash).toBeUndefined();
    expect(payload.query_hash_alg).toBeUndefined();
  });

  it('query parameter가 있는 경우 query_hash를 포함한다', () => {
    const queryString = 'market=KRW-BTC';
    const payload = buildJwtPayload(TEST_API_KEY.accessKey, queryString);

    expect(payload.access_key).toBe(TEST_API_KEY.accessKey);
    expect(payload.nonce).toBeTruthy();
    expect(payload.timestamp).toBeTruthy();

    // query_hash가 있어야 한다
    expect(payload.query_hash).toBeTruthy();
    expect(payload.query_hash_alg).toBe('SHA512');

    // query_hash는 SHA-512 해시 결과여야 한다 (128자 hex)
    expect(String(payload.query_hash)).toHaveLength(128);
    expect(String(payload.query_hash)).toMatch(/^[0-9a-f]{128}$/);
  });

  it('query_hash가 querystring의 SHA-512 해시와 일치한다', () => {
    const queryString = 'market=KRW-BTC&count=100';
    const payload = buildJwtPayload(TEST_API_KEY.accessKey, queryString);

    const expectedHash = CryptoJS.SHA512(queryString).toString(CryptoJS.enc.Hex);
    expect(payload.query_hash).toBe(expectedHash);
  });

  it('매번 고유한 nonce를 생성한다', () => {
    const payload1 = buildJwtPayload(TEST_API_KEY.accessKey);
    const payload2 = buildJwtPayload(TEST_API_KEY.accessKey);

    expect(payload1.nonce).not.toBe(payload2.nonce);
  });

  it('현재 시각에 근접한 timestamp를 생성한다', () => {
    const before = Date.now();
    const payload = buildJwtPayload(TEST_API_KEY.accessKey);
    const after = Date.now();

    expect(payload.timestamp as number).toBeGreaterThanOrEqual(before);
    expect(payload.timestamp as number).toBeLessThanOrEqual(after);
  });
});

describe('createJwtToken', () => {
  it('올바른 JWT 구조(header.payload.signature)를 생성한다', () => {
    const payload = {
      access_key: TEST_API_KEY.accessKey,
      nonce: 'test-nonce',
      timestamp: 1700000000000,
    };

    const token = createJwtToken(payload, TEST_API_KEY.secretKey);

    // JWT는 3개 부분으로 구성된다
    const parts = token.split('.');
    expect(parts).toHaveLength(3);

    // 각 부분이 비어있지 않아야 한다
    parts.forEach((part) => {
      expect(part.length).toBeGreaterThan(0);
    });
  });

  it('JWT 헤더에 alg: "HS256", typ: "JWT"가 포함된다', () => {
    const payload = {
      access_key: TEST_API_KEY.accessKey,
      nonce: 'test-nonce',
      timestamp: 1700000000000,
    };

    const token = createJwtToken(payload, TEST_API_KEY.secretKey);
    const headerPart = token.split('.')[0] as string;
    const header = JSON.parse(base64UrlDecode(headerPart));

    expect(header.alg).toBe('HS256');
    expect(header.typ).toBe('JWT');
  });

  it('JWT 페이로드에 전달된 데이터가 포함된다', () => {
    const payload = {
      access_key: TEST_API_KEY.accessKey,
      nonce: 'test-nonce-value',
      timestamp: 1700000000000,
    };

    const token = createJwtToken(payload, TEST_API_KEY.secretKey);
    const decodedPayload = decodeJwtPayload(token);

    expect(decodedPayload.access_key).toBe(TEST_API_KEY.accessKey);
    expect(decodedPayload.nonce).toBe('test-nonce-value');
    expect(decodedPayload.timestamp).toBe(1700000000000);
  });

  it('query_hash가 포함된 페이로드를 올바르게 인코딩한다', () => {
    const queryHash = CryptoJS.SHA512('market=KRW-BTC').toString(CryptoJS.enc.Hex);
    const payload = {
      access_key: TEST_API_KEY.accessKey,
      nonce: 'test-nonce',
      timestamp: 1700000000000,
      query_hash: queryHash,
      query_hash_alg: 'SHA512',
    };

    const token = createJwtToken(payload, TEST_API_KEY.secretKey);
    const decodedPayload = decodeJwtPayload(token);

    expect(decodedPayload.query_hash).toBe(queryHash);
    expect(decodedPayload.query_hash_alg).toBe('SHA512');
  });

  it('동일한 입력에 대해 항상 동일한 JWT 토큰을 생성한다', () => {
    const payload = {
      access_key: TEST_API_KEY.accessKey,
      nonce: 'fixed-nonce',
      timestamp: 1700000000000,
    };

    const token1 = createJwtToken(payload, TEST_API_KEY.secretKey);
    const token2 = createJwtToken(payload, TEST_API_KEY.secretKey);

    expect(token1).toBe(token2);
  });

  it('다른 Secret Key로 서명하면 다른 토큰이 생성된다', () => {
    const payload = {
      access_key: TEST_API_KEY.accessKey,
      nonce: 'fixed-nonce',
      timestamp: 1700000000000,
    };

    const token1 = createJwtToken(payload, 'secret-key-1');
    const token2 = createJwtToken(payload, 'secret-key-2');

    // 헤더와 페이로드는 같지만 서명이 다르다
    const parts1 = token1.split('.');
    const parts2 = token2.split('.');
    expect(parts1[0]).toBe(parts2[0]); // 동일 헤더
    expect(parts1[1]).toBe(parts2[1]); // 동일 페이로드
    expect(parts1[2]).not.toBe(parts2[2]); // 다른 서명
  });

  it('HMAC-SHA256 서명이 올바른지 검증한다', () => {
    const payload = {
      access_key: 'test-key',
      nonce: 'test-nonce',
      timestamp: 1700000000000,
    };
    const secretKey = 'my-secret';

    const token = createJwtToken(payload, secretKey);
    const parts = token.split('.');

    // 서명 대상 문자열
    const signingInput = `${parts[0]}.${parts[1]}`;

    // 직접 HMAC-SHA256 서명 생성
    const expectedSignature = CryptoJS.HmacSHA256(signingInput, secretKey);
    const expectedEncoded = CryptoJS.enc.Base64.stringify(expectedSignature)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(parts[2]).toBe(expectedEncoded);
  });

  it('JWT 토큰에 Base64URL 이외의 문자가 포함되지 않는다', () => {
    const payload = {
      access_key: TEST_API_KEY.accessKey,
      nonce: 'test-nonce',
      timestamp: 1700000000000,
    };

    const token = createJwtToken(payload, TEST_API_KEY.secretKey);

    // Base64URL 문자 + '.' 만 포함되어야 한다 (패딩 '=' 없음)
    expect(token).toMatch(/^[A-Za-z0-9_\-.]+$/);
    // '+', '/', '=' 문자가 없어야 한다
    expect(token).not.toContain('+');
    expect(token).not.toContain('/');
    expect(token).not.toContain('=');
  });
});

describe('signRequest', () => {
  it('GET 요청에 대해 올바른 서명된 요청을 생성한다', () => {
    const params: SignRequestParams = {
      method: 'GET',
      endpoint: '/accounts',
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.method).toBe('GET');
    expect(signed.url).toBe('https://api.upbit.com/v1/accounts');
    expect(signed.headers['Authorization']).toMatch(/^Bearer .+/);
    expect(signed.headers['Content-Type']).toBe('application/json');
    expect(signed.body).toBeUndefined();
  });

  it('query parameter가 있는 GET 요청에 URL querystring을 포함한다', () => {
    const params: SignRequestParams = {
      method: 'GET',
      endpoint: '/ticker',
      queryParams: { markets: 'KRW-BTC' },
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.url).toContain('?markets=KRW-BTC');
    expect(signed.headers['Authorization']).toMatch(/^Bearer .+/);
  });

  it('query parameter가 있으면 JWT에 query_hash가 포함된다', () => {
    const params: SignRequestParams = {
      method: 'GET',
      endpoint: '/ticker',
      queryParams: { markets: 'KRW-BTC' },
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);
    const token = extractJwtToken(signed.headers);
    const payload = decodeJwtPayload(token);

    expect(payload.query_hash).toBeTruthy();
    expect(payload.query_hash_alg).toBe('SHA512');
  });

  it('query parameter가 없으면 JWT에 query_hash가 없다', () => {
    const params: SignRequestParams = {
      method: 'GET',
      endpoint: '/accounts',
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);
    const token = extractJwtToken(signed.headers);
    const payload = decodeJwtPayload(token);

    expect(payload.query_hash).toBeUndefined();
    expect(payload.query_hash_alg).toBeUndefined();
  });

  it('POST 요청에 body를 JSON 문자열로 포함한다', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/orders',
      body: { market: 'KRW-BTC', side: 'bid' },
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.method).toBe('POST');
    expect(signed.body).toBe(JSON.stringify({ market: 'KRW-BTC', side: 'bid' }));
  });

  it('POST 요청의 body를 기반으로 query_hash를 생성한다', () => {
    const body = { market: 'KRW-BTC', side: 'bid' };
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/orders',
      body,
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);
    const token = extractJwtToken(signed.headers);
    const payload = decodeJwtPayload(token);

    // body가 있으므로 query_hash가 포함되어야 한다
    expect(payload.query_hash).toBeTruthy();
    expect(payload.query_hash_alg).toBe('SHA512');
  });

  it('Authorization 헤더에 "Bearer {JWT}" 형식의 토큰을 포함한다', () => {
    const params: SignRequestParams = {
      method: 'GET',
      endpoint: '/accounts',
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);
    const authHeader = signed.headers['Authorization'] as string;

    expect(authHeader).toMatch(/^Bearer [A-Za-z0-9_\-.]+$/);

    // JWT 토큰이 3개 부분으로 구성되었는지 확인
    const token = authHeader.replace('Bearer ', '');
    expect(token.split('.')).toHaveLength(3);
  });

  it('JWT 페이로드에 access_key, nonce, timestamp가 포함된다', () => {
    const params: SignRequestParams = {
      method: 'GET',
      endpoint: '/accounts',
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);
    const token = extractJwtToken(signed.headers);
    const payload = decodeJwtPayload(token);

    expect(payload.access_key).toBe(TEST_API_KEY.accessKey);
    expect(payload.nonce).toBeTruthy();
    expect(payload.timestamp).toBeTruthy();
    expect(typeof payload.timestamp).toBe('number');
  });

  it('매 요청마다 고유한 nonce와 timestamp를 생성한다', () => {
    const params: SignRequestParams = {
      method: 'GET',
      endpoint: '/accounts',
      apiKey: TEST_API_KEY,
    };

    const signed1 = signRequest(params);
    const signed2 = signRequest(params);

    const token1 = extractJwtToken(signed1.headers);
    const token2 = extractJwtToken(signed2.headers);

    const payload1 = decodeJwtPayload(token1);
    const payload2 = decodeJwtPayload(token2);

    // nonce는 매번 달라야 한다
    expect(payload1.nonce).not.toBe(payload2.nonce);
  });

  it('Access Key가 빈 문자열이면 오류를 발생시킨다', () => {
    const params: SignRequestParams = {
      method: 'GET',
      endpoint: '/accounts',
      apiKey: { accessKey: '', secretKey: 'some-secret' },
    };

    expect(() => signRequest(params)).toThrow('업비트 Access Key가 필요합니다');
  });

  it('Secret Key가 빈 문자열이면 오류를 발생시킨다', () => {
    const params: SignRequestParams = {
      method: 'GET',
      endpoint: '/accounts',
      apiKey: { accessKey: 'some-access', secretKey: '' },
    };

    expect(() => signRequest(params)).toThrow('업비트 Secret Key가 필요합니다');
  });

  it('DELETE 요청에 대해 올바르게 처리한다', () => {
    const params: SignRequestParams = {
      method: 'DELETE',
      endpoint: '/order',
      queryParams: { uuid: 'test-uuid-123' },
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.method).toBe('DELETE');
    expect(signed.url).toContain('?uuid=test-uuid-123');
  });

  it('업비트 REST API 기본 URL을 사용한다', () => {
    const params: SignRequestParams = {
      method: 'GET',
      endpoint: '/accounts',
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.url.startsWith('https://api.upbit.com/v1')).toBe(true);
  });
});

describe('validateApiKey', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('잔고 조회 성공 시 유효한 API Key로 판정한다', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const result = await validateApiKey(TEST_API_KEY);

    expect(result.isValid).toBe(true);
    expect(result.isReadOnly).toBe(true);
    expect(result.errorMessage).toBeUndefined();
    expect(result.errorCode).toBeUndefined();
  });

  it('프록시 엔드포인트(/api/exchange/upbit/balance)에 요청을 보낸다', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await validateApiKey(TEST_API_KEY);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
    const [url, options] = callArgs;
    expect(url).toBe('/api/exchange/upbit/balance');
    expect(options.method).toBe('POST');

    const headers = options.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');

    // body에 signedRequest가 포함되어 있어야 한다
    const body = JSON.parse(options.body as string) as { signedRequest: { url: string; headers: Record<string, string> } };
    expect(body.signedRequest).toBeDefined();
    expect(body.signedRequest.url).toContain('/accounts');
    expect(body.signedRequest.headers['Authorization']).toMatch(/^Bearer .+/);
  });

  it('401 응답 시 잘못된 키로 판정한다', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: 'Invalid API key' }),
    });

    const result = await validateApiKey(TEST_API_KEY);

    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe('INVALID_KEY');
    expect(result.errorMessage).toContain('잘못된 API 키');
  });

  it('403 응답 시 권한 부족으로 판정한다', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ message: 'Forbidden' }),
    });

    const result = await validateApiKey(TEST_API_KEY);

    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe('INSUFFICIENT_PERMISSION');
    expect(result.errorMessage).toContain('권한이 부족');
  });

  it('기타 HTTP 오류 시 UNKNOWN 코드를 반환한다', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Internal Server Error' }),
    });

    const result = await validateApiKey(TEST_API_KEY);

    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe('UNKNOWN');
    expect(result.errorMessage).toContain('API 키 검증에 실패했습니다');
  });

  it('네트워크 오류 시 NETWORK_ERROR 코드를 반환한다', async () => {
    fetchSpy.mockRejectedValue(new Error('Failed to fetch'));

    const result = await validateApiKey(TEST_API_KEY);

    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe('NETWORK_ERROR');
    expect(result.errorMessage).toContain('네트워크 오류');
  });

  it('JSON 파싱 실패해도 HTTP 상태 코드 기반으로 판정한다', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.reject(new Error('Invalid JSON')),
    });

    const result = await validateApiKey(TEST_API_KEY);

    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe('INVALID_KEY');
  });
});

describe('getExchangeType', () => {
  it('"upbit"을 반환한다', () => {
    expect(getExchangeType()).toBe('upbit');
  });
});

describe('signRequest - 통합 시나리오', () => {
  it('업비트 잔고 조회 시나리오: 서명된 요청이 올바른 형식이다', () => {
    const signed = signRequest({
      method: 'GET',
      endpoint: '/accounts',
      apiKey: TEST_API_KEY,
    });

    // URL 확인
    expect(signed.url).toBe('https://api.upbit.com/v1/accounts');

    // Authorization 헤더 확인
    const token = extractJwtToken(signed.headers);
    const parts = token.split('.');
    expect(parts).toHaveLength(3);

    // 페이로드 확인 (query parameter 없으므로 query_hash 없음)
    const payload = decodeJwtPayload(token);
    expect(payload.access_key).toBe(TEST_API_KEY.accessKey);
    expect(payload.query_hash).toBeUndefined();
  });

  it('업비트 시세 조회 시나리오: query parameter의 해시가 포함된다', () => {
    const signed = signRequest({
      method: 'GET',
      endpoint: '/ticker',
      queryParams: { markets: 'KRW-BTC,KRW-ETH' },
      apiKey: TEST_API_KEY,
    });

    // URL에 querystring 포함 확인
    expect(signed.url).toContain('?markets=');
    expect(signed.url).toContain('KRW-BTC');

    // JWT 페이로드에 query_hash 포함 확인
    const token = extractJwtToken(signed.headers);
    const payload = decodeJwtPayload(token);
    expect(payload.query_hash).toBeTruthy();
    expect(payload.query_hash_alg).toBe('SHA512');

    // query_hash가 실제 querystring의 SHA-512 해시와 일치하는지 확인
    const queryString = buildQueryString({ markets: 'KRW-BTC,KRW-ETH' });
    const expectedHash = CryptoJS.SHA512(queryString).toString(CryptoJS.enc.Hex);
    expect(payload.query_hash).toBe(expectedHash);
  });

  it('서명된 요청의 일회성: 같은 파라미터로도 매번 다른 JWT가 생성된다', () => {
    const params: SignRequestParams = {
      method: 'GET',
      endpoint: '/accounts',
      apiKey: TEST_API_KEY,
    };

    const signed1 = signRequest(params);
    const signed2 = signRequest(params);

    // 매번 다른 nonce/timestamp이므로 JWT 토큰이 다르다
    expect(signed1.headers['Authorization']).not.toBe(signed2.headers['Authorization']);
  });
});
