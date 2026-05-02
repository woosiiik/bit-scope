/**
 * 빗썸 서명 모듈 (BithumbSigner) 단위 테스트
 *
 * HMAC-SHA512 서명 생성, nonce/timestamp 기반 일회성 요청 보장,
 * API Key 유효성 검증 로직을 검증한다.
 *
 * @see 요구사항 12.1, 8.17
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CryptoJS from 'crypto-js';
import {
  buildQueryString,
  buildBodyQueryString,
  createHmacSignature,
  generateRequestNonce,
  generateTimestamp,
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
    const params = { order_currency: 'BTC' };
    const result = buildQueryString(params);
    expect(result).toBe('order_currency=BTC');
  });

  it('복수 파라미터를 &로 연결한다', () => {
    const params = { order_currency: 'BTC', payment_currency: 'KRW' };
    const result = buildQueryString(params);
    expect(result).toContain('order_currency=BTC');
    expect(result).toContain('payment_currency=KRW');
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

describe('buildBodyQueryString', () => {
  it('body 객체를 querystring으로 변환한다', () => {
    const body = { order_currency: 'BTC', payment_currency: 'KRW' };
    const result = buildBodyQueryString(body);
    expect(result).toContain('order_currency=BTC');
    expect(result).toContain('payment_currency=KRW');
  });

  it('숫자 값을 문자열로 변환한다', () => {
    const body = { count: 100, page: 1 };
    const result = buildBodyQueryString(body);
    expect(result).toContain('count=100');
    expect(result).toContain('page=1');
  });

  it('빈 객체에 대해 빈 문자열을 반환한다', () => {
    const result = buildBodyQueryString({});
    expect(result).toBe('');
  });
});

describe('createHmacSignature', () => {
  const testEndpoint = '/info/balance';
  const testQueryString = 'order_currency=BTC&payment_currency=KRW';
  const testNonce = 'test-nonce-12345';
  const testSecretKey = 'test-secret-key';

  it('HMAC-SHA512 기반 서명을 반환한다', () => {
    const signature = createHmacSignature(
      testEndpoint,
      testQueryString,
      testNonce,
      testSecretKey
    );

    // Base64 인코딩된 문자열이어야 한다
    expect(signature).toBeTruthy();
    expect(typeof signature).toBe('string');
    expect(signature.length).toBeGreaterThan(0);
  });

  it('동일한 입력에 대해 항상 동일한 서명을 반환한다 (결정론적)', () => {
    const sig1 = createHmacSignature(testEndpoint, testQueryString, testNonce, testSecretKey);
    const sig2 = createHmacSignature(testEndpoint, testQueryString, testNonce, testSecretKey);

    expect(sig1).toBe(sig2);
  });

  it('다른 endpoint에 대해 다른 서명을 반환한다', () => {
    const sig1 = createHmacSignature('/info/balance', testQueryString, testNonce, testSecretKey);
    const sig2 = createHmacSignature('/info/orders', testQueryString, testNonce, testSecretKey);

    expect(sig1).not.toBe(sig2);
  });

  it('다른 queryString에 대해 다른 서명을 반환한다', () => {
    const sig1 = createHmacSignature(testEndpoint, 'order_currency=BTC', testNonce, testSecretKey);
    const sig2 = createHmacSignature(testEndpoint, 'order_currency=ETH', testNonce, testSecretKey);

    expect(sig1).not.toBe(sig2);
  });

  it('다른 nonce에 대해 다른 서명을 반환한다', () => {
    const sig1 = createHmacSignature(testEndpoint, testQueryString, 'nonce-1', testSecretKey);
    const sig2 = createHmacSignature(testEndpoint, testQueryString, 'nonce-2', testSecretKey);

    expect(sig1).not.toBe(sig2);
  });

  it('다른 Secret Key로 서명하면 다른 서명이 생성된다', () => {
    const sig1 = createHmacSignature(testEndpoint, testQueryString, testNonce, 'secret-1');
    const sig2 = createHmacSignature(testEndpoint, testQueryString, testNonce, 'secret-2');

    expect(sig1).not.toBe(sig2);
  });

  it('서명 대상 문자열이 endpoint + chr(0) + queryString + chr(0) + nonce 형식이다', () => {
    const endpoint = '/info/balance';
    const queryString = 'order_currency=BTC';
    const nonce = 'test-nonce';
    const secretKey = 'my-secret';

    const signature = createHmacSignature(endpoint, queryString, nonce, secretKey);

    // 직접 서명 생성하여 비교
    const expectedHmacData = `${endpoint}${String.fromCharCode(0)}${queryString}${String.fromCharCode(0)}${nonce}`;
    const expectedHmac = CryptoJS.HmacSHA512(expectedHmacData, secretKey);
    const expectedHex = expectedHmac.toString(CryptoJS.enc.Hex);
    const expectedBase64 = CryptoJS.enc.Base64.stringify(
      CryptoJS.enc.Utf8.parse(expectedHex)
    );

    expect(signature).toBe(expectedBase64);
  });

  it('빈 queryString에 대해서도 올바른 서명을 생성한다', () => {
    const signature = createHmacSignature(testEndpoint, '', testNonce, testSecretKey);

    expect(signature).toBeTruthy();
    expect(typeof signature).toBe('string');

    // 직접 검증
    const expectedHmacData = `${testEndpoint}${String.fromCharCode(0)}${String.fromCharCode(0)}${testNonce}`;
    const expectedHmac = CryptoJS.HmacSHA512(expectedHmacData, testSecretKey);
    const expectedHex = expectedHmac.toString(CryptoJS.enc.Hex);
    const expectedBase64 = CryptoJS.enc.Base64.stringify(
      CryptoJS.enc.Utf8.parse(expectedHex)
    );

    expect(signature).toBe(expectedBase64);
  });
});

describe('signRequest', () => {
  it('POST 요청에 대해 올바른 서명된 요청을 생성한다', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/info/balance',
      body: { order_currency: 'BTC', payment_currency: 'KRW' },
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.method).toBe('POST');
    expect(signed.url).toBe('https://api.bithumb.com/info/balance');
    expect(signed.headers['Api-Key']).toBe(TEST_API_KEY.accessKey);
    expect(signed.headers['Api-Sign']).toBeTruthy();
    expect(signed.headers['Api-Nonce']).toBeTruthy();
    expect(signed.headers['Api-Timestamp']).toBeTruthy();
    expect(signed.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });

  it('POST 요청의 body를 URL 인코딩된 form data로 포함한다', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/info/balance',
      body: { order_currency: 'BTC', payment_currency: 'KRW' },
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.body).toContain('order_currency=BTC');
    expect(signed.body).toContain('payment_currency=KRW');
    expect(signed.body).toContain('&');
  });

  it('GET 요청에 대해 URL에 querystring을 포함한다', () => {
    const params: SignRequestParams = {
      method: 'GET',
      endpoint: '/public/ticker',
      queryParams: { order_currency: 'BTC', payment_currency: 'KRW' },
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.url).toContain('?order_currency=BTC');
    expect(signed.url).toContain('payment_currency=KRW');
    expect(signed.body).toBeUndefined();
  });

  it('GET 요청에 body가 없다', () => {
    const params: SignRequestParams = {
      method: 'GET',
      endpoint: '/public/ticker',
      queryParams: { order_currency: 'BTC' },
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.body).toBeUndefined();
  });

  it('Api-Key 헤더에 Access Key가 포함된다', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/info/balance',
      body: { order_currency: 'BTC' },
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.headers['Api-Key']).toBe(TEST_API_KEY.accessKey);
  });

  it('Api-Sign 헤더에 HMAC-SHA512 서명이 포함된다', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/info/balance',
      body: { order_currency: 'BTC' },
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    // Api-Sign 헤더가 비어있지 않아야 한다
    expect(signed.headers['Api-Sign']).toBeTruthy();
    expect(typeof signed.headers['Api-Sign']).toBe('string');
    expect((signed.headers['Api-Sign'] as string).length).toBeGreaterThan(0);
  });

  it('Api-Nonce 헤더에 고유한 nonce가 포함된다', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/info/balance',
      body: { order_currency: 'BTC' },
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.headers['Api-Nonce']).toBeTruthy();
  });

  it('Api-Timestamp 헤더에 현재 시각이 포함된다', () => {
    const before = Date.now();
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/info/balance',
      body: { order_currency: 'BTC' },
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);
    const after = Date.now();

    const timestamp = Number(signed.headers['Api-Timestamp']);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it('매 요청마다 고유한 nonce와 timestamp를 생성한다', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/info/balance',
      body: { order_currency: 'BTC' },
      apiKey: TEST_API_KEY,
    };

    const signed1 = signRequest(params);
    const signed2 = signRequest(params);

    // nonce는 매번 달라야 한다
    expect(signed1.headers['Api-Nonce']).not.toBe(signed2.headers['Api-Nonce']);
  });

  it('매 요청마다 다른 서명(Api-Sign)이 생성된다 (일회성 보장)', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/info/balance',
      body: { order_currency: 'BTC' },
      apiKey: TEST_API_KEY,
    };

    const signed1 = signRequest(params);
    const signed2 = signRequest(params);

    // nonce가 다르므로 서명도 다르다
    expect(signed1.headers['Api-Sign']).not.toBe(signed2.headers['Api-Sign']);
  });

  it('Access Key가 빈 문자열이면 오류를 발생시킨다', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/info/balance',
      apiKey: { accessKey: '', secretKey: 'some-secret' },
    };

    expect(() => signRequest(params)).toThrow('빗썸 Access Key가 필요합니다');
  });

  it('Secret Key가 빈 문자열이면 오류를 발생시킨다', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/info/balance',
      apiKey: { accessKey: 'some-access', secretKey: '' },
    };

    expect(() => signRequest(params)).toThrow('빗썸 Secret Key가 필요합니다');
  });

  it('빗썸 REST API 기본 URL을 사용한다', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/info/balance',
      body: { order_currency: 'BTC' },
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.url.startsWith('https://api.bithumb.com')).toBe(true);
  });

  it('body 없는 POST 요청에 대해 빈 queryString으로 서명한다', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/info/balance',
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.method).toBe('POST');
    expect(signed.headers['Api-Sign']).toBeTruthy();
    expect(signed.body).toBeUndefined();
  });

  it('DELETE 요청에 대해 올바르게 처리한다', () => {
    const params: SignRequestParams = {
      method: 'DELETE',
      endpoint: '/info/order_detail',
      queryParams: { order_id: 'test-order-123' },
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.method).toBe('DELETE');
    expect(signed.headers['Api-Key']).toBe(TEST_API_KEY.accessKey);
    expect(signed.headers['Api-Sign']).toBeTruthy();
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

  it('잔고 조회 성공(status: "0000") 시 유효한 API Key로 판정한다', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: '0000', data: { total_btc: '0.1' } }),
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
      json: () => Promise.resolve({ status: '0000', data: {} }),
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
    expect(body.signedRequest.url).toContain('/info/balance');
    expect(body.signedRequest.headers['Api-Key']).toBe(TEST_API_KEY.accessKey);
    expect(body.signedRequest.headers['Api-Sign']).toBeTruthy();
    expect(body.signedRequest.headers['Api-Nonce']).toBeTruthy();
    expect(body.signedRequest.headers['Api-Timestamp']).toBeTruthy();
  });

  it('빗썸 API 오류 status "5300"(Invalid Apikey) 시 INVALID_KEY로 판정한다', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: '5300', message: 'Invalid Apikey' }),
    });

    const result = await validateApiKey(TEST_API_KEY);

    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe('INVALID_KEY');
    expect(result.errorMessage).toContain('잘못된 API 키');
  });

  it('빗썸 API 오류 status "5302"(Api Key Not Existed) 시 INVALID_KEY로 판정한다', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: '5302', message: 'Api Key Not Existed' }),
    });

    const result = await validateApiKey(TEST_API_KEY);

    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe('INVALID_KEY');
  });

  it('빗썸 API 오류 status "5200"(Not Member) 시 INSUFFICIENT_PERMISSION으로 판정한다', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: '5200', message: 'Not Member' }),
    });

    const result = await validateApiKey(TEST_API_KEY);

    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe('INSUFFICIENT_PERMISSION');
    expect(result.errorMessage).toContain('권한이 부족');
  });

  it('기타 빗썸 API 오류 status 시 UNKNOWN 코드를 반환한다', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: '5900', message: 'Unknown Error' }),
    });

    const result = await validateApiKey(TEST_API_KEY);

    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe('UNKNOWN');
    expect(result.errorMessage).toContain('빗썸 API 오류');
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

  it('HTTP 200이지만 status 없는 응답 시 유효한 키로 판정한다', async () => {
    // 프록시가 정규화된 응답을 반환하는 경우 status 필드가 없을 수 있다
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ balances: [] }),
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
  it('빗썸 잔고 조회 시나리오: 서명된 요청이 올바른 형식이다', () => {
    const signed = signRequest({
      method: 'POST',
      endpoint: '/info/balance',
      body: {
        order_currency: 'BTC',
        payment_currency: 'KRW',
      },
      apiKey: TEST_API_KEY,
    });

    // URL 확인
    expect(signed.url).toBe('https://api.bithumb.com/info/balance');

    // 필수 헤더 확인
    expect(signed.headers['Api-Key']).toBe(TEST_API_KEY.accessKey);
    expect(signed.headers['Api-Sign']).toBeTruthy();
    expect(signed.headers['Api-Nonce']).toBeTruthy();
    expect(signed.headers['Api-Timestamp']).toBeTruthy();
    expect(signed.headers['Content-Type']).toBe('application/x-www-form-urlencoded');

    // body가 URL 인코딩된 form data 형태인지 확인
    expect(signed.body).toContain('order_currency=BTC');
    expect(signed.body).toContain('payment_currency=KRW');
  });

  it('빗썸 주문 내역 조회 시나리오: 서명에 body가 반영된다', () => {
    const signed = signRequest({
      method: 'POST',
      endpoint: '/info/orders',
      body: {
        order_currency: 'ETH',
        payment_currency: 'KRW',
        count: '100',
      },
      apiKey: TEST_API_KEY,
    });

    // URL에 querystring이 없어야 한다 (POST 요청)
    expect(signed.url).toBe('https://api.bithumb.com/info/orders');
    expect(signed.url).not.toContain('?');

    // body에 모든 파라미터가 포함되어야 한다
    expect(signed.body).toContain('order_currency=ETH');
    expect(signed.body).toContain('payment_currency=KRW');
    expect(signed.body).toContain('count=100');
  });

  it('서명된 요청의 일회성: 같은 파라미터로도 매번 다른 서명이 생성된다', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/info/balance',
      body: { order_currency: 'BTC' },
      apiKey: TEST_API_KEY,
    };

    const signed1 = signRequest(params);
    const signed2 = signRequest(params);

    // 매번 다른 nonce이므로 서명이 다르다
    expect(signed1.headers['Api-Sign']).not.toBe(signed2.headers['Api-Sign']);
    expect(signed1.headers['Api-Nonce']).not.toBe(signed2.headers['Api-Nonce']);
  });

  it('HMAC 서명의 정확성: 직접 계산한 서명과 일치한다', () => {
    // nonce와 timestamp를 모킹하여 서명을 검증한다
    const mockNonce = 'fixed-test-nonce-for-verification';
    const mockTimestamp = 1700000000000;

    // 모킹
    const originalRandomUUID = crypto.randomUUID;
    const originalDateNow = Date.now;
    crypto.randomUUID = () => mockNonce as `${string}-${string}-${string}-${string}-${string}`;
    Date.now = () => mockTimestamp;

    try {
      const params: SignRequestParams = {
        method: 'POST',
        endpoint: '/info/balance',
        body: { order_currency: 'BTC', payment_currency: 'KRW' },
        apiKey: TEST_API_KEY,
      };

      const signed = signRequest(params);

      // 직접 서명 계산
      const queryString = 'order_currency=BTC&payment_currency=KRW';
      const hmacData = `/info/balance${String.fromCharCode(0)}${queryString}${String.fromCharCode(0)}${mockNonce}`;
      const expectedHmac = CryptoJS.HmacSHA512(hmacData, TEST_API_KEY.secretKey);
      const expectedHex = expectedHmac.toString(CryptoJS.enc.Hex);
      const expectedBase64 = CryptoJS.enc.Base64.stringify(
        CryptoJS.enc.Utf8.parse(expectedHex)
      );

      expect(signed.headers['Api-Sign']).toBe(expectedBase64);
      expect(signed.headers['Api-Nonce']).toBe(mockNonce);
      expect(signed.headers['Api-Timestamp']).toBe(String(mockTimestamp));
    } finally {
      // 모킹 복원
      crypto.randomUUID = originalRandomUUID;
      Date.now = originalDateNow;
    }
  });
});
