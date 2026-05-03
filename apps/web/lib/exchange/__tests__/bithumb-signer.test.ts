/**
 * 빗썸 서명 모듈 (BithumbSigner) 단위 테스트 - API v2
 *
 * JWT(HS256) 토큰 생성, nonce/timestamp 기반 일회성 요청 보장,
 * query_hash(SHA512) 생성, API Key 유효성 검증 로직을 검증한다.
 *
 * 빗썸 v2 인증 방식은 업비트와 동일한 JWT 기반이다.
 *
 * @see 요구사항 12.1, 8.17
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CryptoJS from 'crypto-js';
import {
  buildQueryString,
  buildJwtPayload,
  createJwtToken,
  generateRequestNonce,
  generateTimestamp,
  hashQueryString,
  signRequest,
  validateApiKey,
  getExchangeType,
} from '../bithumb-signer';
import type { ApiKeyPair, SignRequestParams } from '@bitscope/shared';

/** 테스트용 API Key */
const TEST_API_KEY: ApiKeyPair = {
  accessKey: 'test-bithumb-access-key-1234567890',
  secretKey: 'test-bithumb-secret-key-abcdefghij',
};

describe('generateRequestNonce', () => {
  it('UUID 형식의 nonce를 반환한다', () => {
    const nonce = generateRequestNonce();

    // UUID v4 형식 검증 (8-4-4-4-12 hex)
    expect(nonce).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('매번 고유한 nonce를 생성한다', () => {
    const nonce1 = generateRequestNonce();
    const nonce2 = generateRequestNonce();

    expect(nonce1).not.toBe(nonce2);
  });
});

describe('generateTimestamp', () => {
  it('현재 시각에 근접한 epoch 밀리초를 반환한다', () => {
    const before = Date.now();
    const timestamp = generateTimestamp();
    const after = Date.now();

    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it('숫자 타입을 반환한다', () => {
    const timestamp = generateTimestamp();

    expect(typeof timestamp).toBe('number');
  });
});

describe('buildQueryString', () => {
  it('단일 파라미터를 querystring으로 변환한다', () => {
    const params = { market: 'KRW-BTC' };
    const result = buildQueryString(params);
    expect(result).toBe('market=KRW-BTC');
  });

  it('복수 파라미터를 &로 연결한다', () => {
    const params = { market: 'KRW-BTC', state: 'wait' };
    const result = buildQueryString(params);
    expect(result).toContain('market=KRW-BTC');
    expect(result).toContain('state=wait');
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
    expect(decodeURIComponent(result)).toBe('name=비트코인');
  });
});

describe('hashQueryString', () => {
  it('querystring의 SHA-512 해시를 생성한다', () => {
    const queryString = 'market=KRW-BTC&state=wait';
    const hash = hashQueryString(queryString);

    // SHA-512 해시는 128자의 hex 문자열
    expect(hash).toMatch(/^[0-9a-f]{128}$/);
  });

  it('동일한 입력에 대해 동일한 해시를 반환한다 (결정론적)', () => {
    const queryString = 'market=KRW-BTC';
    const hash1 = hashQueryString(queryString);
    const hash2 = hashQueryString(queryString);

    expect(hash1).toBe(hash2);
  });

  it('다른 입력에 대해 다른 해시를 반환한다', () => {
    const hash1 = hashQueryString('market=KRW-BTC');
    const hash2 = hashQueryString('market=KRW-ETH');

    expect(hash1).not.toBe(hash2);
  });

  it('crypto-js SHA512로 직접 계산한 값과 일치한다', () => {
    const queryString = 'market=KRW-BTC&state=wait';
    const hash = hashQueryString(queryString);
    const expected = CryptoJS.SHA512(queryString).toString(CryptoJS.enc.Hex);

    expect(hash).toBe(expected);
  });
});

describe('buildJwtPayload', () => {
  it('기본 JWT 페이로드를 생성한다 (queryString 없음)', () => {
    const payload = buildJwtPayload(TEST_API_KEY.accessKey);

    expect(payload.access_key).toBe(TEST_API_KEY.accessKey);
    expect(payload.nonce).toBeTruthy();
    expect(typeof payload.nonce).toBe('string');
    expect(payload.timestamp).toBeTruthy();
    expect(typeof payload.timestamp).toBe('number');
    // query_hash가 포함되지 않아야 한다
    expect(payload.query_hash).toBeUndefined();
    expect(payload.query_hash_alg).toBeUndefined();
  });

  it('queryString이 있으면 query_hash와 query_hash_alg을 포함한다', () => {
    const queryString = 'market=KRW-BTC&state=wait';
    const payload = buildJwtPayload(TEST_API_KEY.accessKey, queryString);

    expect(payload.access_key).toBe(TEST_API_KEY.accessKey);
    expect(payload.nonce).toBeTruthy();
    expect(payload.timestamp).toBeTruthy();
    expect(payload.query_hash).toBeTruthy();
    expect(payload.query_hash_alg).toBe('SHA512');

    // query_hash가 SHA-512 해시인지 확인
    const expectedHash = CryptoJS.SHA512(queryString).toString(CryptoJS.enc.Hex);
    expect(payload.query_hash).toBe(expectedHash);
  });

  it('매번 고유한 nonce를 생성한다', () => {
    const payload1 = buildJwtPayload(TEST_API_KEY.accessKey);
    const payload2 = buildJwtPayload(TEST_API_KEY.accessKey);

    expect(payload1.nonce).not.toBe(payload2.nonce);
  });
});

describe('createJwtToken', () => {
  it('JWT 토큰은 header.payload.signature 3파트로 구성된다', () => {
    const payload = {
      access_key: TEST_API_KEY.accessKey,
      nonce: 'test-nonce',
      timestamp: 1700000000000,
    };
    const token = createJwtToken(payload, TEST_API_KEY.secretKey);
    const parts = token.split('.');

    expect(parts).toHaveLength(3);
    // 각 파트가 비어있지 않아야 한다
    expect(parts[0]!.length).toBeGreaterThan(0);
    expect(parts[1]!.length).toBeGreaterThan(0);
    expect(parts[2]!.length).toBeGreaterThan(0);
  });

  it('JWT 헤더에 alg: HS256, typ: JWT가 포함된다', () => {
    const payload = {
      access_key: TEST_API_KEY.accessKey,
      nonce: 'test-nonce',
      timestamp: 1700000000000,
    };
    const token = createJwtToken(payload, TEST_API_KEY.secretKey);
    const headerPart = token.split('.')[0]!;

    // Base64URL 디코딩
    const base64 = headerPart.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = CryptoJS.enc.Base64.parse(base64);
    const header = JSON.parse(decoded.toString(CryptoJS.enc.Utf8));

    expect(header.alg).toBe('HS256');
    expect(header.typ).toBe('JWT');
  });

  it('JWT 페이로드에 입력한 데이터가 포함된다', () => {
    const payload = {
      access_key: 'my-access-key',
      nonce: 'my-nonce-123',
      timestamp: 1700000000000,
    };
    const token = createJwtToken(payload, TEST_API_KEY.secretKey);
    const payloadPart = token.split('.')[1]!;

    // Base64URL 디코딩
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = CryptoJS.enc.Base64.parse(base64);
    const decodedPayload = JSON.parse(decoded.toString(CryptoJS.enc.Utf8));

    expect(decodedPayload.access_key).toBe('my-access-key');
    expect(decodedPayload.nonce).toBe('my-nonce-123');
    expect(decodedPayload.timestamp).toBe(1700000000000);
  });

  it('동일한 입력에 대해 동일한 토큰을 반환한다 (결정론적)', () => {
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
    const token1 = createJwtToken(payload, 'secret-1');
    const token2 = createJwtToken(payload, 'secret-2');

    // 헤더와 페이로드는 같지만 서명이 다르다
    const parts1 = token1.split('.');
    const parts2 = token2.split('.');
    expect(parts1[0]).toBe(parts2[0]); // 헤더 동일
    expect(parts1[1]).toBe(parts2[1]); // 페이로드 동일
    expect(parts1[2]).not.toBe(parts2[2]); // 서명 다름
  });

  it('HMAC-SHA256으로 올바르게 서명한다', () => {
    const payload = {
      access_key: TEST_API_KEY.accessKey,
      nonce: 'test-nonce',
      timestamp: 1700000000000,
    };
    const token = createJwtToken(payload, TEST_API_KEY.secretKey);
    const [headerPart, payloadPart, signaturePart] = token.split('.');

    // 직접 서명 계산
    const signingInput = `${headerPart}.${payloadPart}`;
    const expectedSignature = CryptoJS.HmacSHA256(signingInput, TEST_API_KEY.secretKey);
    const expectedEncoded = CryptoJS.enc.Base64.stringify(expectedSignature)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(signaturePart).toBe(expectedEncoded);
  });
});

describe('signRequest', () => {
  it('GET 요청에 대해 올바른 서명된 요청을 생성한다', () => {
    const params: SignRequestParams = {
      method: 'GET',
      endpoint: '/v1/accounts',
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.method).toBe('GET');
    expect(signed.url).toBe('https://api.bithumb.com/v1/accounts');
    expect(signed.headers['Authorization']).toMatch(/^Bearer .+\..+\..+$/);
    expect(signed.body).toBeUndefined();
  });

  it('GET 요청에 queryParams가 있으면 URL에 querystring을 포함한다', () => {
    const params: SignRequestParams = {
      method: 'GET',
      endpoint: '/v1/orders',
      queryParams: { market: 'KRW-BTC', state: 'wait' },
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.url).toContain('?market=KRW-BTC');
    expect(signed.url).toContain('state=wait');
    expect(signed.body).toBeUndefined();
  });

  it('POST 요청에 대해 Content-Type을 application/json으로 설정한다', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/v1/orders',
      body: { market: 'KRW-BTC', side: 'bid', volume: '0.01', price: '50000000', ord_type: 'limit' },
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.method).toBe('POST');
    expect(signed.headers['Content-Type']).toBe('application/json');
    expect(signed.headers['Authorization']).toMatch(/^Bearer .+\..+\..+$/);
  });

  it('POST 요청의 body가 JSON 문자열로 포함된다', () => {
    const body = { market: 'KRW-BTC', side: 'bid' };
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/v1/orders',
      body,
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.body).toBe(JSON.stringify(body));
  });

  it('Authorization 헤더에 Bearer JWT 토큰이 포함된다', () => {
    const params: SignRequestParams = {
      method: 'GET',
      endpoint: '/v1/accounts',
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);
    const authHeader = signed.headers['Authorization']!;

    expect(authHeader).toBeTruthy();
    expect(authHeader.startsWith('Bearer ')).toBe(true);

    // JWT 토큰 검증 (3파트 구조)
    const token = authHeader.replace('Bearer ', '');
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
  });

  it('매 요청마다 고유한 JWT 토큰이 생성된다 (일회성 보장)', () => {
    const params: SignRequestParams = {
      method: 'GET',
      endpoint: '/v1/accounts',
      apiKey: TEST_API_KEY,
    };

    const signed1 = signRequest(params);
    const signed2 = signRequest(params);

    // nonce가 다르므로 토큰도 다르다
    expect(signed1.headers['Authorization']).not.toBe(signed2.headers['Authorization']);
  });

  it('queryParams가 있는 GET 요청의 JWT에 query_hash가 포함된다', () => {
    const mockNonce = 'fixed-test-nonce-for-verification';
    const mockTimestamp = 1700000000000;

    const originalRandomUUID = crypto.randomUUID;
    const originalDateNow = Date.now;
    crypto.randomUUID = () => mockNonce as `${string}-${string}-${string}-${string}-${string}`;
    Date.now = () => mockTimestamp;

    try {
      const params: SignRequestParams = {
        method: 'GET',
        endpoint: '/v1/orders',
        queryParams: { market: 'KRW-BTC', state: 'wait' },
        apiKey: TEST_API_KEY,
      };

      const signed = signRequest(params);
      const token = signed.headers['Authorization']!.replace('Bearer ', '');
      const payloadPart = token.split('.')[1]!;

      // Base64URL 디코딩
      const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = CryptoJS.enc.Base64.parse(base64);
      const payload = JSON.parse(decoded.toString(CryptoJS.enc.Utf8));

      // query_hash가 포함되어 있는지 확인
      expect(payload.query_hash).toBeTruthy();
      expect(payload.query_hash_alg).toBe('SHA512');

      // query_hash 값 검증
      const queryString = 'market=KRW-BTC&state=wait';
      const expectedHash = CryptoJS.SHA512(queryString).toString(CryptoJS.enc.Hex);
      expect(payload.query_hash).toBe(expectedHash);
    } finally {
      crypto.randomUUID = originalRandomUUID;
      Date.now = originalDateNow;
    }
  });

  it('queryParams 없는 GET 요청의 JWT에 query_hash가 포함되지 않는다', () => {
    const mockNonce = 'fixed-test-nonce-for-verification';
    const mockTimestamp = 1700000000000;

    const originalRandomUUID = crypto.randomUUID;
    const originalDateNow = Date.now;
    crypto.randomUUID = () => mockNonce as `${string}-${string}-${string}-${string}-${string}`;
    Date.now = () => mockTimestamp;

    try {
      const params: SignRequestParams = {
        method: 'GET',
        endpoint: '/v1/accounts',
        apiKey: TEST_API_KEY,
      };

      const signed = signRequest(params);
      const token = signed.headers['Authorization']!.replace('Bearer ', '');
      const payloadPart = token.split('.')[1]!;

      // Base64URL 디코딩
      const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = CryptoJS.enc.Base64.parse(base64);
      const payload = JSON.parse(decoded.toString(CryptoJS.enc.Utf8));

      // query_hash가 포함되지 않아야 한다
      expect(payload.query_hash).toBeUndefined();
      expect(payload.query_hash_alg).toBeUndefined();
    } finally {
      crypto.randomUUID = originalRandomUUID;
      Date.now = originalDateNow;
    }
  });

  it('Access Key가 빈 문자열이면 오류를 발생시킨다', () => {
    const params: SignRequestParams = {
      method: 'GET',
      endpoint: '/v1/accounts',
      apiKey: { accessKey: '', secretKey: 'some-secret' },
    };

    expect(() => signRequest(params)).toThrow('빗썸 Access Key가 필요합니다');
  });

  it('Secret Key가 빈 문자열이면 오류를 발생시킨다', () => {
    const params: SignRequestParams = {
      method: 'GET',
      endpoint: '/v1/accounts',
      apiKey: { accessKey: 'some-access', secretKey: '' },
    };

    expect(() => signRequest(params)).toThrow('빗썸 Secret Key가 필요합니다');
  });

  it('빗썸 REST API 기본 URL을 사용한다', () => {
    const params: SignRequestParams = {
      method: 'GET',
      endpoint: '/v1/accounts',
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.url.startsWith('https://api.bithumb.com')).toBe(true);
  });

  it('DELETE 요청에 대해 올바르게 처리한다', () => {
    const params: SignRequestParams = {
      method: 'DELETE',
      endpoint: '/v1/order',
      queryParams: { uuid: 'test-order-uuid-123' },
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.method).toBe('DELETE');
    expect(signed.headers['Authorization']).toMatch(/^Bearer .+\..+\..+$/);
    expect(signed.headers['Content-Type']).toBe('application/json');
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

  it('잔고 조회 성공(HTTP 200) 시 유효한 API Key로 판정한다', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { currency: 'BTC', balance: '0.1', locked: '0.0', avg_buy_price: '50000000', unit_currency: 'KRW' },
      ]),
    });

    const result = await validateApiKey(TEST_API_KEY);

    expect(result.isValid).toBe(true);
    expect(result.isReadOnly).toBe(true);
    expect(result.errorMessage).toBeUndefined();
    expect(result.errorCode).toBeUndefined();
  });

  it('프록시 엔드포인트(/api/exchange/bithumb/balance)에 요청을 보낸다', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await validateApiKey(TEST_API_KEY);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
    const [url, options] = callArgs;
    expect(url).toBe('/api/exchange/bithumb/balance');
    expect(options.method).toBe('POST');

    const headers = options.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');

    // body에 signedRequest가 포함되어 있어야 한다
    const body = JSON.parse(options.body as string) as {
      signedRequest: { url: string; headers: Record<string, string> };
    };
    expect(body.signedRequest).toBeDefined();
    expect(body.signedRequest.url).toContain('/v1/accounts');
    // JWT 인증이므로 Authorization 헤더에 Bearer 토큰이 포함되어야 한다
    expect(body.signedRequest.headers['Authorization']).toMatch(/^Bearer .+\..+\..+$/);
  });

  it('401 응답 시 잘못된 키로 판정한다', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: 'Unauthorized' }),
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

  it('HTTP 200 빈 배열 응답 시에도 유효한 키로 판정한다', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const result = await validateApiKey(TEST_API_KEY);

    expect(result.isValid).toBe(true);
    expect(result.isReadOnly).toBe(true);
  });
});

describe('getExchangeType', () => {
  it('"bithumb"을 반환한다', () => {
    expect(getExchangeType()).toBe('bithumb');
  });
});

describe('signRequest - 통합 시나리오', () => {
  it('빗썸 v2 잔고 조회 시나리오: 서명된 요청이 올바른 형식이다', () => {
    const signed = signRequest({
      method: 'GET',
      endpoint: '/v1/accounts',
      apiKey: TEST_API_KEY,
    });

    // URL 확인
    expect(signed.url).toBe('https://api.bithumb.com/v1/accounts');

    // Authorization 헤더에 Bearer JWT 토큰이 포함되어야 한다
    expect(signed.headers['Authorization']).toMatch(/^Bearer .+\..+\..+$/);

    // GET 요청이므로 Content-Type이 없어야 한다
    expect(signed.headers['Content-Type']).toBeUndefined();

    // body가 없어야 한다
    expect(signed.body).toBeUndefined();
  });

  it('빗썸 v2 주문 내역 조회 시나리오: queryParams가 URL과 JWT에 포함된다', () => {
    const signed = signRequest({
      method: 'GET',
      endpoint: '/v1/orders',
      queryParams: {
        market: 'KRW-BTC',
        state: 'wait',
      },
      apiKey: TEST_API_KEY,
    });

    // URL에 querystring이 포함되어야 한다
    expect(signed.url).toContain('?market=KRW-BTC');
    expect(signed.url).toContain('state=wait');

    // body가 없어야 한다 (GET 요청)
    expect(signed.body).toBeUndefined();
  });

  it('서명된 요청의 일회성: 같은 파라미터로도 매번 다른 서명이 생성된다', () => {
    const params: SignRequestParams = {
      method: 'GET',
      endpoint: '/v1/accounts',
      apiKey: TEST_API_KEY,
    };

    const signed1 = signRequest(params);
    const signed2 = signRequest(params);

    // 매번 다른 nonce이므로 JWT 토큰이 다르다
    expect(signed1.headers['Authorization']).not.toBe(signed2.headers['Authorization']);
  });

  it('JWT 토큰의 정확성: 직접 계산한 토큰과 일치한다', () => {
    // nonce와 timestamp를 모킹하여 JWT를 검증한다
    const mockNonce = 'fixed-test-nonce-for-verification';
    const mockTimestamp = 1700000000000;

    const originalRandomUUID = crypto.randomUUID;
    const originalDateNow = Date.now;
    crypto.randomUUID = () => mockNonce as `${string}-${string}-${string}-${string}-${string}`;
    Date.now = () => mockTimestamp;

    try {
      const params: SignRequestParams = {
        method: 'GET',
        endpoint: '/v1/accounts',
        apiKey: TEST_API_KEY,
      };

      const signed = signRequest(params);
      const token = signed.headers['Authorization']!.replace('Bearer ', '');

      // 직접 JWT 토큰 생성
      const expectedPayload = {
        access_key: TEST_API_KEY.accessKey,
        nonce: mockNonce,
        timestamp: mockTimestamp,
      };
      const expectedToken = createJwtToken(expectedPayload, TEST_API_KEY.secretKey);

      expect(token).toBe(expectedToken);
    } finally {
      crypto.randomUUID = originalRandomUUID;
      Date.now = originalDateNow;
    }
  });

  it('업비트와 동일한 JWT 인증 구조를 사용한다', () => {
    const signed = signRequest({
      method: 'GET',
      endpoint: '/v1/accounts',
      apiKey: TEST_API_KEY,
    });

    // Authorization: Bearer {JWT} 형식
    const authHeader = signed.headers['Authorization']!;
    expect(authHeader).toMatch(/^Bearer .+$/);

    // JWT 토큰 구조 확인
    const token = authHeader.replace('Bearer ', '');
    const parts = token.split('.');
    expect(parts).toHaveLength(3);

    // 헤더가 HS256/JWT인지 확인
    const headerBase64 = parts[0]!.replace(/-/g, '+').replace(/_/g, '/');
    const headerDecoded = CryptoJS.enc.Base64.parse(headerBase64);
    const header = JSON.parse(headerDecoded.toString(CryptoJS.enc.Utf8));
    expect(header.alg).toBe('HS256');
    expect(header.typ).toBe('JWT');

    // 페이로드에 access_key, nonce, timestamp가 포함되는지 확인
    const payloadBase64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const payloadDecoded = CryptoJS.enc.Base64.parse(payloadBase64);
    const payload = JSON.parse(payloadDecoded.toString(CryptoJS.enc.Utf8));
    expect(payload.access_key).toBe(TEST_API_KEY.accessKey);
    expect(payload.nonce).toBeTruthy();
    expect(payload.timestamp).toBeTruthy();
  });
});
