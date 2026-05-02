/**
 * 코인원 서명 모듈 (CoinoneSigner) 단위 테스트
 *
 * HMAC-SHA512 서명 생성, Base64 인코딩된 payload 구성,
 * nonce 기반 일회성 요청 보장, API Key 유효성 검증 로직을 검증한다.
 *
 * @see 요구사항 12.1, 8.17
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CryptoJS from 'crypto-js';
import {
  buildQueryString,
  buildPayloadObject,
  encodePayload,
  createHmacSignature,
  generateRequestNonce,
  generateTimestamp,
  signRequest,
  validateApiKey,
  getExchangeType,
} from '../coinone-signer';
import type { ApiKeyPair, SignRequestParams } from '@bitscope/shared';

/** 테스트용 API Key */
const TEST_API_KEY: ApiKeyPair = {
  accessKey: 'test-coinone-access-token-1234567890',
  secretKey: 'test-coinone-secret-key-abcdefghij',
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
    const params = { currency: 'BTC' };
    const result = buildQueryString(params);
    expect(result).toBe('currency=BTC');
  });

  it('복수 파라미터를 &로 연결한다', () => {
    const params = { currency: 'BTC', quote_currency: 'KRW' };
    const result = buildQueryString(params);
    expect(result).toContain('currency=BTC');
    expect(result).toContain('quote_currency=KRW');
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

describe('buildPayloadObject', () => {
  const testAccessKey = 'my-access-token';
  const testNonce = 'test-nonce-12345';

  it('access_token과 nonce를 포함하는 payload 객체를 반환한다', () => {
    const payload = buildPayloadObject(testAccessKey, testNonce);

    expect(payload.access_token).toBe(testAccessKey);
    expect(payload.nonce).toBe(testNonce);
  });

  it('추가 body 파라미터를 포함한 payload 객체를 반환한다', () => {
    const body = { currency: 'BTC', quote_currency: 'KRW' };
    const payload = buildPayloadObject(testAccessKey, testNonce, body);

    expect(payload.access_token).toBe(testAccessKey);
    expect(payload.nonce).toBe(testNonce);
    expect(payload.currency).toBe('BTC');
    expect(payload.quote_currency).toBe('KRW');
  });

  it('body가 빈 객체일 때 access_token과 nonce만 포함한다', () => {
    const payload = buildPayloadObject(testAccessKey, testNonce, {});

    expect(Object.keys(payload)).toHaveLength(2);
    expect(payload.access_token).toBe(testAccessKey);
    expect(payload.nonce).toBe(testNonce);
  });

  it('body가 undefined일 때 access_token과 nonce만 포함한다', () => {
    const payload = buildPayloadObject(testAccessKey, testNonce, undefined);

    expect(Object.keys(payload)).toHaveLength(2);
    expect(payload.access_token).toBe(testAccessKey);
    expect(payload.nonce).toBe(testNonce);
  });

  it('body의 숫자 값을 그대로 유지한다', () => {
    const body = { count: 100, page: 1 };
    const payload = buildPayloadObject(testAccessKey, testNonce, body);

    expect(payload.count).toBe(100);
    expect(payload.page).toBe(1);
  });
});

describe('encodePayload', () => {
  it('payload 객체를 Base64 인코딩된 문자열로 변환한다', () => {
    const payloadObj = { access_token: 'test', nonce: 'nonce-123' };
    const encoded = encodePayload(payloadObj);

    // Base64 디코딩하여 원래 JSON과 일치하는지 검증
    const decoded = CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(encoded));
    const parsedBack = JSON.parse(decoded);

    expect(parsedBack.access_token).toBe('test');
    expect(parsedBack.nonce).toBe('nonce-123');
  });

  it('동일한 입력에 대해 항상 동일한 결과를 반환한다 (결정론적)', () => {
    const payloadObj = { access_token: 'test', nonce: 'nonce-123' };
    const encoded1 = encodePayload(payloadObj);
    const encoded2 = encodePayload(payloadObj);

    expect(encoded1).toBe(encoded2);
  });

  it('빈 객체에 대해서도 유효한 Base64 문자열을 반환한다', () => {
    const encoded = encodePayload({});

    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);

    const decoded = CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(encoded));
    expect(decoded).toBe('{}');
  });

  it('한글 값이 포함된 payload도 올바르게 인코딩한다', () => {
    const payloadObj = { name: '비트코인', access_token: 'test' };
    const encoded = encodePayload(payloadObj);

    const decoded = CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(encoded));
    const parsedBack = JSON.parse(decoded);
    expect(parsedBack.name).toBe('비트코인');
  });
});

describe('createHmacSignature', () => {
  const testPayload = 'base64-encoded-test-payload';
  const testSecretKey = 'test-secret-key';

  it('HMAC-SHA512 기반 서명을 Hex 인코딩으로 반환한다', () => {
    const signature = createHmacSignature(testPayload, testSecretKey);

    // Hex 인코딩된 SHA-512 결과는 128자이다
    expect(signature).toBeTruthy();
    expect(typeof signature).toBe('string');
    expect(signature).toMatch(/^[0-9a-f]+$/);
    expect(signature.length).toBe(128);
  });

  it('동일한 입력에 대해 항상 동일한 서명을 반환한다 (결정론적)', () => {
    const sig1 = createHmacSignature(testPayload, testSecretKey);
    const sig2 = createHmacSignature(testPayload, testSecretKey);

    expect(sig1).toBe(sig2);
  });

  it('다른 payload에 대해 다른 서명을 반환한다', () => {
    const sig1 = createHmacSignature('payload-1', testSecretKey);
    const sig2 = createHmacSignature('payload-2', testSecretKey);

    expect(sig1).not.toBe(sig2);
  });

  it('다른 Secret Key로 서명하면 다른 서명이 생성된다', () => {
    const sig1 = createHmacSignature(testPayload, 'secret-1');
    const sig2 = createHmacSignature(testPayload, 'secret-2');

    expect(sig1).not.toBe(sig2);
  });

  it('Secret Key를 대문자로 변환하여 HMAC 서명을 생성한다', () => {
    const encodedPayload = 'test-payload';
    const secretKey = 'my-secret';

    const signature = createHmacSignature(encodedPayload, secretKey);

    // 직접 계산하여 비교 (Secret Key를 대문자로 변환)
    const expected = CryptoJS.HmacSHA512(encodedPayload, secretKey.toUpperCase());
    const expectedHex = expected.toString(CryptoJS.enc.Hex);

    expect(signature).toBe(expectedHex);
  });

  it('빈 payload에 대해서도 올바른 서명을 생성한다', () => {
    const signature = createHmacSignature('', testSecretKey);

    expect(signature).toBeTruthy();
    expect(signature.length).toBe(128);

    // 직접 검증
    const expected = CryptoJS.HmacSHA512('', testSecretKey.toUpperCase());
    const expectedHex = expected.toString(CryptoJS.enc.Hex);
    expect(signature).toBe(expectedHex);
  });
});

describe('signRequest', () => {
  it('POST 요청에 대해 올바른 서명된 요청을 생성한다', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/v2.1/account/balance/all',
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.method).toBe('POST');
    expect(signed.url).toBe('https://api.coinone.co.kr/v2.1/account/balance/all');
    expect(signed.headers['X-COINONE-PAYLOAD']).toBeTruthy();
    expect(signed.headers['X-COINONE-SIGNATURE']).toBeTruthy();
    expect(signed.headers['Content-Type']).toBe('application/json');
  });

  it('X-COINONE-PAYLOAD 헤더에 Base64 인코딩된 payload가 포함된다', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/v2.1/account/balance/all',
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    // payload를 Base64 디코딩하여 access_token과 nonce가 포함되어 있는지 확인
    const payload = signed.headers['X-COINONE-PAYLOAD'];
    const decoded = CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(payload));
    const parsed = JSON.parse(decoded) as Record<string, string>;

    expect(parsed.access_token).toBe(TEST_API_KEY.accessKey);
    expect(parsed.nonce).toBeTruthy();
  });

  it('X-COINONE-SIGNATURE 헤더에 HMAC-SHA512 서명이 포함된다', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/v2.1/account/balance/all',
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    // Hex 인코딩된 SHA-512 결과 (128자)
    const signature = signed.headers['X-COINONE-SIGNATURE'];
    expect(signature).toBeTruthy();
    expect(typeof signature).toBe('string');
    expect(signature).toMatch(/^[0-9a-f]+$/);
    expect(signature.length).toBe(128);
  });

  it('POST 요청에 body 파라미터가 있으면 payload에 포함된다', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/v2.1/account/balance/all',
      body: { currency: 'BTC', quote_currency: 'KRW' },
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    // payload를 디코딩하여 body 파라미터가 포함되어 있는지 확인
    const payload = signed.headers['X-COINONE-PAYLOAD'];
    const decoded = CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(payload));
    const parsed = JSON.parse(decoded) as Record<string, string>;

    expect(parsed.access_token).toBe(TEST_API_KEY.accessKey);
    expect(parsed.nonce).toBeTruthy();
    expect(parsed.currency).toBe('BTC');
    expect(parsed.quote_currency).toBe('KRW');
  });

  it('POST 요청의 body를 JSON 문자열로 설정한다', () => {
    const body = { currency: 'BTC', quote_currency: 'KRW' };
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/v2.1/account/balance/all',
      body,
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.body).toBe(JSON.stringify(body));
  });

  it('body 없는 POST 요청에 body가 설정되지 않는다', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/v2.1/account/balance/all',
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.body).toBeUndefined();
  });

  it('GET 요청에 query parameter가 있으면 URL에 포함한다', () => {
    const params: SignRequestParams = {
      method: 'GET',
      endpoint: '/public/v2/ticker_new/KRW',
      queryParams: { target_currency: 'BTC' },
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.url).toContain('?target_currency=BTC');
  });

  it('GET 요청에 body가 포함되지 않는다', () => {
    const params: SignRequestParams = {
      method: 'GET',
      endpoint: '/public/v2/ticker_new/KRW',
      queryParams: { target_currency: 'BTC' },
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.body).toBeUndefined();
  });

  it('매 요청마다 고유한 nonce를 생성한다', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/v2.1/account/balance/all',
      apiKey: TEST_API_KEY,
    };

    const signed1 = signRequest(params);
    const signed2 = signRequest(params);

    // payload를 디코딩하여 nonce 비교
    const decoded1 = CryptoJS.enc.Utf8.stringify(
      CryptoJS.enc.Base64.parse(signed1.headers['X-COINONE-PAYLOAD'])
    );
    const decoded2 = CryptoJS.enc.Utf8.stringify(
      CryptoJS.enc.Base64.parse(signed2.headers['X-COINONE-PAYLOAD'])
    );
    const parsed1 = JSON.parse(decoded1) as Record<string, string>;
    const parsed2 = JSON.parse(decoded2) as Record<string, string>;

    expect(parsed1.nonce).not.toBe(parsed2.nonce);
  });

  it('매 요청마다 다른 서명(X-COINONE-SIGNATURE)이 생성된다 (일회성 보장)', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/v2.1/account/balance/all',
      apiKey: TEST_API_KEY,
    };

    const signed1 = signRequest(params);
    const signed2 = signRequest(params);

    // nonce가 다르므로 payload가 다르고, 따라서 서명도 다르다
    expect(signed1.headers['X-COINONE-SIGNATURE']).not.toBe(
      signed2.headers['X-COINONE-SIGNATURE']
    );
  });

  it('Access Key가 빈 문자열이면 오류를 발생시킨다', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/v2.1/account/balance/all',
      apiKey: { accessKey: '', secretKey: 'some-secret' },
    };

    expect(() => signRequest(params)).toThrow('코인원 Access Key가 필요합니다');
  });

  it('Secret Key가 빈 문자열이면 오류를 발생시킨다', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/v2.1/account/balance/all',
      apiKey: { accessKey: 'some-access', secretKey: '' },
    };

    expect(() => signRequest(params)).toThrow('코인원 Secret Key가 필요합니다');
  });

  it('코인원 REST API 기본 URL을 사용한다', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/v2.1/account/balance/all',
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.url.startsWith('https://api.coinone.co.kr')).toBe(true);
  });

  it('DELETE 요청에 대해 올바르게 처리한다', () => {
    const params: SignRequestParams = {
      method: 'DELETE',
      endpoint: '/v2.1/order/cancel',
      body: { order_id: 'test-order-123', currency: 'BTC' },
      apiKey: TEST_API_KEY,
    };

    const signed = signRequest(params);

    expect(signed.method).toBe('DELETE');
    expect(signed.headers['X-COINONE-PAYLOAD']).toBeTruthy();
    expect(signed.headers['X-COINONE-SIGNATURE']).toBeTruthy();
    expect(signed.body).toBe(JSON.stringify({ order_id: 'test-order-123', currency: 'BTC' }));
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
      json: () => Promise.resolve({ result: 'success', balances: [] }),
    });

    const result = await validateApiKey(TEST_API_KEY);

    expect(result.isValid).toBe(true);
    expect(result.isReadOnly).toBe(true);
    expect(result.errorMessage).toBeUndefined();
    expect(result.errorCode).toBeUndefined();
  });

  it('프록시 엔드포인트(/api/exchange/coinone/balance)에 요청을 보낸다', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: 'success', balances: [] }),
    });

    await validateApiKey(TEST_API_KEY);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
    const [url, options] = callArgs;
    expect(url).toBe('/api/exchange/coinone/balance');
    expect(options.method).toBe('POST');

    const headers = options.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');

    // body에 signedRequest가 포함되어 있어야 한다
    const body = JSON.parse(options.body as string) as {
      signedRequest: { url: string; headers: Record<string, string> };
    };
    expect(body.signedRequest).toBeDefined();
    expect(body.signedRequest.url).toContain('/v2.1/account/balance/all');
    expect(body.signedRequest.headers['X-COINONE-PAYLOAD']).toBeTruthy();
    expect(body.signedRequest.headers['X-COINONE-SIGNATURE']).toBeTruthy();
  });

  it('코인원 API 오류 result "error" + errorCode "101"(Invalid Access Token) 시 INVALID_KEY로 판정한다', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        result: 'error',
        errorCode: '101',
        errorMessage: 'Invalid Access Token',
      }),
    });

    const result = await validateApiKey(TEST_API_KEY);

    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe('INVALID_KEY');
    expect(result.errorMessage).toContain('잘못된 API 키');
  });

  it('코인원 API 오류 errorCode "11"(Access Token is not exist) 시 INVALID_KEY로 판정한다', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        result: 'error',
        errorCode: '11',
        errorMessage: 'Access Token is not exist',
      }),
    });

    const result = await validateApiKey(TEST_API_KEY);

    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe('INVALID_KEY');
  });

  it('코인원 API 오류 errorCode "104"(Invalid Signature) 시 INVALID_KEY로 판정한다', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        result: 'error',
        errorCode: '104',
        errorMessage: 'Invalid Signature',
      }),
    });

    const result = await validateApiKey(TEST_API_KEY);

    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe('INVALID_KEY');
  });

  it('코인원 API 오류 errorCode "100"(Session expired) 시 INVALID_KEY로 판정한다', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        result: 'error',
        errorCode: '100',
        errorMessage: 'Session expired',
      }),
    });

    const result = await validateApiKey(TEST_API_KEY);

    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe('INVALID_KEY');
  });

  it('코인원 API 오류 errorCode "12"(Unauthorized) 시 INSUFFICIENT_PERMISSION으로 판정한다', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        result: 'error',
        errorCode: '12',
        errorMessage: 'Unauthorized',
      }),
    });

    const result = await validateApiKey(TEST_API_KEY);

    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe('INSUFFICIENT_PERMISSION');
    expect(result.errorMessage).toContain('권한이 부족');
  });

  it('코인원 API 오류 errorCode "40"(Invalid API permission) 시 INSUFFICIENT_PERMISSION으로 판정한다', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        result: 'error',
        errorCode: '40',
        errorMessage: 'Invalid API permission',
      }),
    });

    const result = await validateApiKey(TEST_API_KEY);

    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe('INSUFFICIENT_PERMISSION');
  });

  it('코인원 API 오류 errorCode "4"(Blocked User) 시 INSUFFICIENT_PERMISSION으로 판정한다', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        result: 'error',
        errorCode: '4',
        errorMessage: 'Blocked User Access',
      }),
    });

    const result = await validateApiKey(TEST_API_KEY);

    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe('INSUFFICIENT_PERMISSION');
  });

  it('코인원 API 오류 errorCode "103"(Need to authenticate) 시 INSUFFICIENT_PERMISSION으로 판정한다', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        result: 'error',
        errorCode: '103',
        errorMessage: 'Need to authenticate',
      }),
    });

    const result = await validateApiKey(TEST_API_KEY);

    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe('INSUFFICIENT_PERMISSION');
  });

  it('기타 코인원 API 오류 코드 시 UNKNOWN 코드를 반환한다', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        result: 'error',
        errorCode: '999',
        errorMessage: 'Unknown Error',
      }),
    });

    const result = await validateApiKey(TEST_API_KEY);

    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe('UNKNOWN');
    expect(result.errorMessage).toContain('코인원 API 오류');
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

  it('HTTP 200이고 result가 "error"가 아닌 응답 시 유효한 키로 판정한다', async () => {
    // 프록시가 정규화된 응답을 반환하는 경우
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
  it('"coinone"을 반환한다', () => {
    expect(getExchangeType()).toBe('coinone');
  });
});

describe('signRequest - 통합 시나리오', () => {
  it('코인원 잔고 조회 시나리오: 서명된 요청이 올바른 형식이다', () => {
    const signed = signRequest({
      method: 'POST',
      endpoint: '/v2.1/account/balance/all',
      apiKey: TEST_API_KEY,
    });

    // URL 확인
    expect(signed.url).toBe('https://api.coinone.co.kr/v2.1/account/balance/all');

    // 필수 헤더 확인
    expect(signed.headers['X-COINONE-PAYLOAD']).toBeTruthy();
    expect(signed.headers['X-COINONE-SIGNATURE']).toBeTruthy();
    expect(signed.headers['Content-Type']).toBe('application/json');

    // payload에 access_token이 포함되어 있는지 확인
    const payload = signed.headers['X-COINONE-PAYLOAD'];
    const decoded = CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(payload));
    const parsed = JSON.parse(decoded) as Record<string, string>;
    expect(parsed.access_token).toBe(TEST_API_KEY.accessKey);
    expect(parsed.nonce).toBeTruthy();
  });

  it('코인원 주문 내역 조회 시나리오: 서명에 body가 반영된다', () => {
    const signed = signRequest({
      method: 'POST',
      endpoint: '/v2.1/order/query_active_orders',
      body: {
        currency: 'ETH',
        quote_currency: 'KRW',
      },
      apiKey: TEST_API_KEY,
    });

    // URL에 querystring이 없어야 한다 (POST 요청)
    expect(signed.url).toBe('https://api.coinone.co.kr/v2.1/order/query_active_orders');
    expect(signed.url).not.toContain('?');

    // payload에 body 파라미터가 포함되어야 한다
    const payload = signed.headers['X-COINONE-PAYLOAD'];
    const decoded = CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(payload));
    const parsed = JSON.parse(decoded) as Record<string, string>;
    expect(parsed.currency).toBe('ETH');
    expect(parsed.quote_currency).toBe('KRW');

    // body에도 원래 파라미터가 JSON으로 포함되어야 한다
    expect(signed.body).toContain('"currency":"ETH"');
    expect(signed.body).toContain('"quote_currency":"KRW"');
  });

  it('서명된 요청의 일회성: 같은 파라미터로도 매번 다른 서명이 생성된다', () => {
    const params: SignRequestParams = {
      method: 'POST',
      endpoint: '/v2.1/account/balance/all',
      apiKey: TEST_API_KEY,
    };

    const signed1 = signRequest(params);
    const signed2 = signRequest(params);

    // 매번 다른 nonce이므로 payload가 다르고 서명도 다르다
    expect(signed1.headers['X-COINONE-PAYLOAD']).not.toBe(
      signed2.headers['X-COINONE-PAYLOAD']
    );
    expect(signed1.headers['X-COINONE-SIGNATURE']).not.toBe(
      signed2.headers['X-COINONE-SIGNATURE']
    );
  });

  it('HMAC 서명의 정확성: 직접 계산한 서명과 일치한다', () => {
    // nonce를 모킹하여 서명을 검증한다
    const mockNonce = 'fixed-test-nonce-for-verification';

    // 모킹
    const originalRandomUUID = crypto.randomUUID;
    crypto.randomUUID = () => mockNonce as `${string}-${string}-${string}-${string}-${string}`;

    try {
      const params: SignRequestParams = {
        method: 'POST',
        endpoint: '/v2.1/account/balance/all',
        body: { currency: 'BTC' },
        apiKey: TEST_API_KEY,
      };

      const signed = signRequest(params);

      // 직접 payload 구성
      const expectedPayloadObj = {
        access_token: TEST_API_KEY.accessKey,
        nonce: mockNonce,
        currency: 'BTC',
      };
      const expectedJsonString = JSON.stringify(expectedPayloadObj);
      const expectedEncodedPayload = CryptoJS.enc.Base64.stringify(
        CryptoJS.enc.Utf8.parse(expectedJsonString)
      );

      // 직접 서명 계산 (Secret Key를 대문자로 변환)
      const expectedHmac = CryptoJS.HmacSHA512(
        expectedEncodedPayload,
        TEST_API_KEY.secretKey.toUpperCase()
      );
      const expectedSignature = expectedHmac.toString(CryptoJS.enc.Hex);

      expect(signed.headers['X-COINONE-PAYLOAD']).toBe(expectedEncodedPayload);
      expect(signed.headers['X-COINONE-SIGNATURE']).toBe(expectedSignature);
    } finally {
      // 모킹 복원
      crypto.randomUUID = originalRandomUUID;
    }
  });

  it('서명은 payload의 Base64 인코딩 결과에 대한 HMAC-SHA512이다', () => {
    const mockNonce = 'test-nonce-for-sig-check';
    const originalRandomUUID = crypto.randomUUID;
    crypto.randomUUID = () => mockNonce as `${string}-${string}-${string}-${string}-${string}`;

    try {
      const signed = signRequest({
        method: 'POST',
        endpoint: '/v2.1/account/balance/all',
        apiKey: TEST_API_KEY,
      });

      const payload = signed.headers['X-COINONE-PAYLOAD'];
      const signature = signed.headers['X-COINONE-SIGNATURE'];

      // payload에 대해 직접 HMAC-SHA512 계산
      const expectedHmac = CryptoJS.HmacSHA512(
        payload,
        TEST_API_KEY.secretKey.toUpperCase()
      );
      const expectedSignature = expectedHmac.toString(CryptoJS.enc.Hex);

      expect(signature).toBe(expectedSignature);
    } finally {
      crypto.randomUUID = originalRandomUUID;
    }
  });
});
